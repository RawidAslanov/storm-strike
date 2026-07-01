import { MSG } from '../../shared/protocol.js';

const DEFAULT_WS = import.meta.env.VITE_WS_URL
  || (import.meta.env.DEV && typeof location !== 'undefined'
    ? `ws://${location.hostname}:3001`
    : '');

const CONNECT_TIMEOUT_MS = 75_000;
const HEARTBEAT_MS = 15_000;
const PONG_TIMEOUT_MS = 25_000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

export class MultiplayerClient {
  constructor(url) {
    this.url = url || import.meta.env.VITE_WS_URL || DEFAULT_WS;
    this.ws = null;
    this.playerId = null;
    this.roomCode = null;
    this.playerName = null;
    this.state = null;
    this.listeners = new Set();
    this.connected = false;
    this.intentionalClose = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.reconnectAttempt = 0;
    this._connectPromise = null;
  }

  on(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit(event, data) { this.listeners.forEach(cb => cb(event, data)); }

  saveSession() {
    if (!this.playerId || !this.roomCode) return;
    sessionStorage.setItem('ss_mp_session', JSON.stringify({
      playerId: this.playerId,
      roomCode: this.roomCode,
      playerName: this.playerName,
    }));
  }

  loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem('ss_mp_session') || 'null');
    } catch {
      return null;
    }
  }

  clearSession() {
    sessionStorage.removeItem('ss_mp_session');
  }

  connect() {
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = new Promise((resolve, reject) => {
      if (!this.url) {
        this._connectPromise = null;
        reject(new Error('Сервер мультиплеера не настроен (VITE_WS_URL)'));
        return;
      }

      this.intentionalClose = false;
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        this._connectPromise = null;
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        this._connectPromise = null;
        reject(new Error('Таймаут подключения к серверу'));
        this.ws?.close();
      }, CONNECT_TIMEOUT_MS);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        this.emit('connected');
        this._connectPromise = null;
        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopHeartbeat();
        this._connectPromise = null;
        if (!this.intentionalClose) {
          this.emit('disconnected');
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this._connectPromise = null;
        this.emit('error', { message: 'Ошибка соединения с сервером' });
      };

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === MSG.PONG) {
          clearTimeout(this.pongTimer);
          return;
        }
        this.handleMessage(msg);
      };
    });

    return this._connectPromise;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      this.ping();
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.ws?.close();
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.pongTimer);
    this.heartbeatTimer = null;
    this.pongTimer = null;
  }

  scheduleReconnect() {
    if (this.intentionalClose || !this.playerId || !this.roomCode) return;
    clearTimeout(this.reconnectTimer);
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.emit('reconnecting', { attempt: this.reconnectAttempt, delay });
    this.reconnectTimer = setTimeout(() => this.tryReconnect(), delay);
  }

  async tryReconnect() {
    if (this.intentionalClose || !this.playerId || !this.roomCode) return;
    try {
      await this.connect();
      this.send(MSG.REJOIN_ROOM, { code: this.roomCode, playerId: this.playerId });
      this.emit('reconnected');
    } catch {
      this.scheduleReconnect();
    }
  }

  async reconnect() {
    this.reconnectAttempt = 0;
    clearTimeout(this.reconnectTimer);
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.send(MSG.REJOIN_ROOM, { code: this.roomCode, playerId: this.playerId });
      return;
    }
    await this.connect();
    this.send(MSG.REJOIN_ROOM, { code: this.roomCode, playerId: this.playerId });
  }

  disconnect() {
    this.intentionalClose = true;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.clearSession();
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', { message: 'Нет соединения с сервером' });
      return false;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  handleMessage(msg) {
    switch (msg.type) {
      case MSG.ROOM_CREATED:
        this.playerId = msg.playerId;
        this.roomCode = msg.code;
        this.state = { lobby: msg.lobby, phase: 'lobby' };
        this.saveSession();
        this.emit('room_created', msg);
        break;
      case MSG.ROOM_JOINED:
        this.playerId = msg.playerId;
        this.roomCode = msg.code;
        this.state = { lobby: msg.lobby, phase: 'lobby' };
        this.saveSession();
        this.emit('room_joined', msg);
        break;
      case MSG.PLAYER_JOINED:
        this.state = { ...this.state, lobby: msg.lobby };
        this.emit('player_joined', msg);
        break;
      case MSG.PLAYER_LEFT:
        this.state = { ...this.state, lobby: msg.lobby };
        this.emit('player_left', msg);
        break;
      case MSG.PLAYER_DISCONNECTED:
        this.emit('player_disconnected', msg);
        break;
      case MSG.GAME_START:
        this.state = { ...this.state, phase: msg.phase };
        this.emit('game_start', msg);
        break;
      case MSG.PLACEMENT_UPDATE:
        this.emit('placement_update', msg);
        break;
      case MSG.TURN:
        this.emit('turn', msg);
        break;
      case MSG.SHOT_RESULT:
        this.state = { ...this.state, battle: msg };
        this.emit('shot_result', msg);
        break;
      case MSG.STATE_SYNC:
        this.state = { ...this.state, battle: msg };
        this.emit('state_sync', msg);
        break;
      case MSG.STORM:
        this.emit('storm', msg.event);
        break;
      case MSG.GAME_OVER:
        this.state = { ...this.state, phase: 'finished', winnerId: msg.winnerId };
        this.emit('game_over', msg);
        break;
      case MSG.ERROR:
        this.emit('error', msg);
        break;
      default:
        break;
    }
  }

  createRoom(name) {
    this.playerName = name;
    return this.send(MSG.CREATE_ROOM, { name });
  }

  joinRoom(code, name) {
    this.playerName = name;
    return this.send(MSG.JOIN_ROOM, { code, name });
  }

  placeShip(row, col) { return this.send(MSG.PLACE_SHIP, { row, col }); }
  rotate() { return this.send(MSG.ROTATE); }
  autoPlace() { return this.send(MSG.AUTO_PLACE); }
  fire(row, col) { return this.send(MSG.FIRE, { row, col }); }
  shield(row, col) { return this.send(MSG.SHIELD, { row, col }); }
  selectPowerUp(powerUp) { return this.send(MSG.SELECT_POWERUP, { powerUp }); }
  useSmoke() { return this.send(MSG.USE_SMOKE); }
  ping() { return this.send(MSG.PING); }
}

import { MSG } from '../../shared/protocol.js';

const DEFAULT_WS = import.meta.env.VITE_WS_URL
  || (import.meta.env.DEV && typeof location !== 'undefined'
    ? `ws://${location.hostname}:3001`
    : '');

export class MultiplayerClient {
  constructor(url) {
    this.url = url || import.meta.env.VITE_WS_URL || DEFAULT_WS;
    this.ws = null;
    this.playerId = null;
    this.roomCode = null;
    this.state = null;
    this.listeners = new Set();
    this.connected = false;
    this.reconnectTimer = null;
  }

  on(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit(event, data) { this.listeners.forEach(cb => cb(event, data)); }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.url) {
        reject(new Error('Сервер мультиплеера не настроен (VITE_WS_URL)'));
        return;
      }
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Таймаут подключения к серверу'));
        this.ws?.close();
      }, 8000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.emit('connected');
        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emit('disconnected');
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.emit('error', { message: 'Ошибка соединения с сервером' });
      };

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this.handleMessage(msg);
      };
    });
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
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
        this.emit('room_created', msg);
        break;
      case MSG.ROOM_JOINED:
        this.playerId = msg.playerId;
        this.roomCode = msg.code;
        this.state = { lobby: msg.lobby, phase: 'lobby' };
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

  createRoom(name) { return this.send(MSG.CREATE_ROOM, { name }); }
  joinRoom(code, name) { return this.send(MSG.JOIN_ROOM, { code, name }); }
  placeShip(row, col) { return this.send(MSG.PLACE_SHIP, { row, col }); }
  rotate() { return this.send(MSG.ROTATE); }
  autoPlace() { return this.send(MSG.AUTO_PLACE); }
  fire(row, col) { return this.send(MSG.FIRE, { row, col }); }
  shield(row, col) { return this.send(MSG.SHIELD, { row, col }); }
  selectPowerUp(powerUp) { return this.send(MSG.SELECT_POWERUP, { powerUp }); }
  useSmoke() { return this.send(MSG.USE_SMOKE); }
  ping() { return this.send(MSG.PING); }
}

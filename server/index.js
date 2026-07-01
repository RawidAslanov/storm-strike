import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './RoomManager.js';

const PORT = Number(process.env.PORT) || 3001;
// Render: всегда 0.0.0.0 — process.env.HOST ломает port scan
const BIND_HOST = '0.0.0.0';

const httpServer = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/' || path === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, service: 'storm-strike-ws', port: PORT }));
    return;
  }
  res.writeHead(404);
  res.end();
});

httpServer.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

const wss = new WebSocketServer({ server: httpServer });
const rooms = new RoomManager();

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcast(room, type, payload = {}, excludeId = null) {
  for (const player of room.players.values()) {
    if (player.id !== excludeId) {
      send(player.ws, type, payload);
    }
  }
}

function broadcastAll(room, type, payload = {}) {
  for (const player of room.players.values()) {
    send(player.ws, type, payload);
  }
}

wss.on('connection', (ws) => {
  let playerId = null;
  let roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, 'error', { message: 'Неверный формат сообщения' });
    }

    try {
      handleMessage(ws, msg);
    } catch (err) {
      console.error('WS error:', err);
      send(ws, 'error', { message: err.message || 'Ошибка сервера' });
    }
  });

  ws.on('close', () => {
    if (roomCode && playerId) {
      const room = rooms.get(roomCode);
      if (room) {
        room.removePlayer(playerId);
        if (room.players.size === 0) {
          rooms.delete(roomCode);
        } else {
          broadcastAll(room, 'player_left', { playerId, lobby: room.getLobbyState() });
        }
      }
    }
  });

  function handleMessage(ws, msg) {
    switch (msg.type) {
      case 'create_room': {
        const name = (msg.name || 'Адмирал').slice(0, 20);
        const code = rooms.generateCode();
        const room = rooms.create(code);
        const player = room.addPlayer(ws, name);
        playerId = player.id;
        roomCode = code;
        send(ws, 'room_created', { code, playerId, lobby: room.getLobbyState() });
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const name = (msg.name || 'Капитан').slice(0, 20);
        const room = rooms.get(code);
        if (!room) return send(ws, 'error', { message: 'Комната не найдена' });
        if (room.players.size >= 2) return send(ws, 'error', { message: 'Комната заполнена' });
        if (room.phase !== 'lobby' && room.phase !== 'placement') {
          return send(ws, 'error', { message: 'Игра уже началась' });
        }

        const player = room.addPlayer(ws, name);
        playerId = player.id;
        roomCode = code;

        send(ws, 'room_joined', { code, playerId, lobby: room.getLobbyState() });
        broadcast(room, 'player_joined', { playerId, name, lobby: room.getLobbyState() }, playerId);

        if (room.players.size === 2) {
          room.startPlacement();
          broadcastAll(room, 'game_start', { phase: 'placement' });
          broadcastAll(room, 'placement_update', room.getPlacementState());
        }
        break;
      }

      case 'place_ship': {
        const room = rooms.get(roomCode);
        if (!room) return;
        const result = room.placeShip(playerId, msg.row, msg.col);
        if (!result.ok) return send(ws, 'error', { message: result.error });
        broadcastAll(room, 'placement_update', room.getPlacementState());
        if (result.battleStarted) {
          broadcastAll(room, 'game_start', { phase: 'battle' });
          broadcastAll(room, 'turn', room.getTurnState());
          broadcastAll(room, 'state_sync', room.getBattleState());
        }
        break;
      }

      case 'rotate': {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.rotate(playerId);
        send(ws, 'placement_update', room.getPlacementState(playerId));
        break;
      }

      case 'auto_place': {
        const room = rooms.get(roomCode);
        if (!room) return;
        const result = room.autoPlace(playerId);
        if (!result.ok) return send(ws, 'error', { message: result.error });
        broadcastAll(room, 'placement_update', room.getPlacementState());
        if (result.battleStarted) {
          broadcastAll(room, 'game_start', { phase: 'battle' });
          broadcastAll(room, 'turn', room.getTurnState());
          broadcastAll(room, 'state_sync', room.getBattleState());
        }
        break;
      }

      case 'select_powerup': {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.selectPowerUp(playerId, msg.powerUp);
        send(ws, 'state_sync', room.getBattleState(playerId));
        break;
      }

      case 'use_smoke': {
        const room = rooms.get(roomCode);
        if (!room) return;
        const result = room.useSmoke(playerId);
        if (!result.ok) return send(ws, 'error', { message: result.error });
        send(ws, 'state_sync', room.getBattleState(playerId));
        break;
      }

      case 'shield': {
        const room = rooms.get(roomCode);
        if (!room) return;
        const result = room.placeShield(playerId, msg.row, msg.col);
        if (!result.ok) return send(ws, 'error', { message: result.error });
        send(ws, 'state_sync', room.getBattleState(playerId));
        break;
      }

      case 'fire': {
        const room = rooms.get(roomCode);
        if (!room) return;
        const result = room.fire(playerId, msg.row, msg.col);
        if (!result.ok) return send(ws, 'error', { message: result.error });

        for (const player of room.players.values()) {
          send(player.ws, 'shot_result', {
            shooterId: playerId,
            results: result.results,
            ...room.getBattleState(player.id),
          });
        }

        if (result.storm) {
          broadcastAll(room, 'storm', { event: result.storm });
        }

        if (result.gameOver) {
          broadcastAll(room, 'game_over', { winnerId: result.winnerId, ...room.getBattleState() });
        } else {
          broadcastAll(room, 'turn', room.getTurnState());
        }
        break;
      }

      case 'ping':
        send(ws, 'pong', { t: Date.now() });
        break;

      default:
        send(ws, 'error', { message: `Неизвестная команда: ${msg.type}` });
    }
  }
});

httpServer.listen(PORT, BIND_HOST, () => {
  console.log(`🚢 Storm Strike multiplayer server listening on ${BIND_HOST}:${PORT}`);
});

import { GameRoom } from './GameRoom.js';

const ROOM_TTL_MS = 30 * 60 * 1000;

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    setInterval(() => this.pruneStaleRooms(), 60_000);
  }

  generateCode() {
    let code;
    do {
      code = randomCode();
    } while (this.rooms.has(code));
    return code;
  }

  create(code) {
    const room = new GameRoom(code);
    room.createdAt = Date.now();
    room.lastActivityAt = Date.now();
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    const room = this.rooms.get(code?.toUpperCase());
    if (room) room.lastActivityAt = Date.now();
    return room;
  }

  delete(code) {
    this.rooms.delete(code);
  }

  pruneStaleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - (room.lastActivityAt || room.createdAt || now);
      const empty = room.players.size === 0;
      const solo = room.players.size === 1 && room.phase === 'lobby';
      if (idle > ROOM_TTL_MS && (empty || solo)) {
        this.rooms.delete(code);
      }
    }
  }
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

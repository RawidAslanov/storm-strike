import { GameRoom } from './GameRoom.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
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
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(code?.toUpperCase());
  }

  delete(code) {
    this.rooms.delete(code);
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

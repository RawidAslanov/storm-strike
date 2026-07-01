import { describe, it, expect } from 'vitest';
import { GameRoom } from '../server/GameRoom.js';
import { CELL } from '../src/game/constants.js';

function mockWs() {
  return { readyState: 1, send() {} };
}

describe('GameRoom', () => {
  it('declares forfeit when player disconnects during battle', () => {
    const room = new GameRoom('TEST01');
    const p1 = room.addPlayer(mockWs(), 'Alpha');
    const p2 = room.addPlayer(mockWs(), 'Beta');
    room.startPlacement();
    p1.placementDone = true;
    p1.placementIndex = p1.placementShips.length;
    p2.placementDone = true;
    p2.placementIndex = p2.placementShips.length;
    room.tryStartBattle();

    const result = room.handleDisconnect(p1.id);
    expect(result.forfeit).toBe(true);
    expect(result.winnerId).toBe(p2.id);
    expect(room.phase).toBe('finished');
  });

  it('awards combo reward on consecutive hits', () => {
    const room = new GameRoom('TEST02');
    const p1 = room.addPlayer(mockWs(), 'Alpha');
    const p2 = room.addPlayer(mockWs(), 'Beta');
    room.startPlacement();

    const ship = createEnemyShip(p2);
    p2.board.ships.push(ship);
    placeOnBoard(p2.board, ship);
    p2.placementDone = true;
    p1.placementDone = true;
    room.tryStartBattle();
    room.currentTurn = p1.id;

    p1.combo = 2;
    const results = [{ valid: true, hit: true, r: 0, c: 0 }];
    room.processResults(p1, results);
    expect(p1.combo).toBe(3);
    expect(p1._lastComboReward).toBeTruthy();
    expect(p1.inventory.chain).toBeGreaterThan(2);
  });
});

function createEnemyShip(player) {
  const ship = {
    id: 99,
    typeId: 'destroyer',
    type: { name: 'Шлюп', ability: 'speed' },
    cells: [[0, 0], [0, 1]],
    hits: 0,
    sunk: false,
    armorUsed: false,
    broadsideUsed: false,
    revealed: true,
  };
  return ship;
}

function placeOnBoard(board, ship) {
  for (const [r, c] of ship.cells) {
    board.grid[r][c] = CELL.SHIP;
  }
}

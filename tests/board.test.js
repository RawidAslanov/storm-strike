import { describe, it, expect, beforeEach } from 'vitest';
import { Board } from '../src/game/Board.js';
import { createShip, placeShipOnGrid } from '../src/game/Ship.js';
import { CELL } from '../src/game/constants.js';

describe('Board', () => {
  let board;

  beforeEach(() => {
    board = new Board();
    const ship = createShip('cruiser', [[0, 0], [0, 1], [0, 2]]);
    placeShipOnGrid(board.grid, ship);
    board.ships.push(ship);
  });

  it('blocks first hit with cruiser armor', () => {
    const res = board.fire(0, 0);
    expect(res.armorBlocked).toBe(true);
    expect(res.hit).toBe(false);
    expect(board.shots[0][0]).toBe(CELL.MISS);
  });

  it('hits submarine and reveals it', () => {
    board.reset();
    const sub = createShip('submarine', [[2, 2], [2, 3], [2, 4]]);
    expect(sub.revealed).toBe(false);
    placeShipOnGrid(board.grid, sub);
    board.ships.push(sub);

    const res = board.fire(2, 2);
    expect(res.hit).toBe(true);
    expect(sub.revealed).toBe(true);
  });

  it('sonar does not detect hidden submarine', () => {
    board.reset();
    const sub = createShip('submarine', [[4, 4], [4, 5], [4, 6]]);
    placeShipOnGrid(board.grid, sub);
    board.ships.push(sub);

    const ping = board.sonarScanZone(4, 4);
    expect(ping.found).toBe(false);
  });

  it('battleship broadside fires extra cells', () => {
    board.reset();
    const ship = createShip('battleship', [[5, 5], [5, 6], [5, 7], [5, 8]]);
    placeShipOnGrid(board.grid, ship);
    board.ships.push(ship);

    const res = board.fire(5, 5);
    expect(res.hit).toBe(true);
    expect(res.broadside).toBe(true);
    expect(res.extraShots?.length).toBeGreaterThan(0);
  });

  it('carrier reveal opens a cell', () => {
    const reveal = board.carrierRevealRandom();
    expect(reveal).not.toBeNull();
    expect(board.isRevealed(reveal.r, reveal.c)).toBe(true);
  });
});

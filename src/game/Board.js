import { GRID_SIZE, CELL } from './constants.js';
import { createEmptyGrid, findShipAt, markSunkArea, getAdjacentCells, getCrossCells, getAreaCells } from './Ship.js';

export class Board {
  constructor() {
    this.grid = createEmptyGrid();
    this.ships = [];
    this.shots = createEmptyGrid();
    this.shields = new Set();
    this.revealed = new Set();
    this.fogCells = new Set();
  }

  reset() {
    this.grid = createEmptyGrid();
    this.ships = [];
    this.shots = createEmptyGrid();
    this.shields = new Set();
    this.revealed = new Set();
    this.fogCells = new Set();
  }

  key(r, c) { return `${r},${c}`; }

  isShielded(r, c) { return this.shields.has(this.key(r, c)); }

  addShield(r, c) { this.shields.add(this.key(r, c)); }

  revealCell(r, c) { this.revealed.add(this.key(r, c)); }

  isRevealed(r, c) { return this.revealed.has(this.key(r, c)); }

  applyFog(percent = 0.3) {
    this.fogCells.clear();
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.shots[r][c] === CELL.EMPTY) candidates.push([r, c]);
      }
    }
    const count = Math.floor(candidates.length * percent);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * candidates.length);
      const [r, c] = candidates.splice(idx, 1)[0];
      this.fogCells.add(this.key(r, c));
    }
  }

  clearFog() { this.fogCells.clear(); }

  isFogged(r, c) { return this.fogCells.has(this.key(r, c)); }

  fire(r, c, options = {}) {
    if (this.shots[r][c] !== CELL.EMPTY && !options.allowRepeat) {
      return { valid: false, reason: 'already_shot' };
    }

    const ship = findShipAt(this.ships, r, c);
    const result = { valid: true, r, c, hit: false, sunk: false, ship: null, shieldBlocked: false, cells: [[r, c]] };

    if (ship && !ship.revealed && ship.typeId === 'submarine') {
      const nearHit = ship.cells.some(([sr, sc]) =>
        getAdjacentCells(sr, sc).some(([ar, ac]) => this.shots[ar][ac] === CELL.HIT || this.shots[ar][ac] === CELL.SUNK)
      );
      if (!nearHit && !options.revealAll) {
        this.shots[r][c] = CELL.MISS;
        result.hit = false;
        return result;
      }
      ship.revealed = true;
    }

    if (ship && this.isShielded(r, c) && !options.ignoreShield) {
      this.shields.delete(this.key(r, c));
      this.shots[r][c] = CELL.MISS;
      result.shieldBlocked = true;
      return result;
    }

    if (ship && ship.type.ability === 'armor' && !ship.armorUsed && !options.ignoreArmor) {
      ship.armorUsed = true;
      this.shots[r][c] = CELL.MISS;
      result.hit = false;
      result.armorBlocked = true;
      return result;
    }

    if (ship) {
      result.hit = true;
      result.ship = ship;
      ship.hits++;
      this.shots[r][c] = CELL.HIT;
      this.revealCell(r, c);

      if (ship.hits >= ship.cells.length) {
        ship.sunk = true;
        result.sunk = true;
        markSunkArea(this.shots, ship);
        for (const [sr, sc] of ship.cells) this.revealCell(sr, sc);
      }
    } else {
      this.shots[r][c] = CELL.MISS;
    }

    return result;
  }

  fireChain(r, c) {
    const results = [];
    const visited = new Set();
    const queue = [[r, c]];

    while (queue.length > 0) {
      const [cr, cc] = queue.shift();
      const k = this.key(cr, cc);
      if (visited.has(k)) continue;
      visited.add(k);

      const res = this.fire(cr, cc);
      if (res.valid) {
        results.push(res);
        if (res.hit) {
          for (const [ar, ac] of getAdjacentCells(cr, cc)) {
            if (!visited.has(this.key(ar, ac)) && this.shots[ar][ac] === CELL.EMPTY) {
              queue.push([ar, ac]);
            }
          }
        }
      }
    }
    return results;
  }

  fireAirstrike(r, c) {
    const cells = getCrossCells(r, c);
    const results = [];
    for (const [cr, cc] of cells) {
      if (this.shots[cr][cc] === CELL.EMPTY) {
        results.push(this.fire(cr, cc));
      }
    }
    return results;
  }

  sonarScan(r, c) {
    const cells = getAreaCells(r, c, 1);
    const found = [];
    for (const [sr, sc] of cells) {
      this.revealCell(sr, sc);
      const ship = findShipAt(this.ships, sr, sc);
      if (ship) found.push([sr, sc]);
    }
    return found;
  }

  getRemainingShips() {
    return this.ships.filter(s => !s.sunk);
  }
}

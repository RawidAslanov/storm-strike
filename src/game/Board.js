import { GRID_SIZE, CELL } from './constants.js';
import { createEmptyGrid, findShipAt, markSunkArea } from './Ship.js';

export class Board {
  constructor() {
    this.grid = createEmptyGrid();
    this.ships = [];
    this.shots = createEmptyGrid();
    this.shieldedShips = new Set();
    this.revealed = new Set();
    this.sonarMarks = new Map();
    this.fogCells = new Set();
  }

  reset() {
    this.grid = createEmptyGrid();
    this.ships = [];
    this.shots = createEmptyGrid();
    this.shieldedShips = new Set();
    this.revealed = new Set();
    this.sonarMarks = new Map();
    this.fogCells = new Set();
  }

  key(r, c) { return `${r},${c}`; }

  getShipAt(r, c) { return findShipAt(this.ships, r, c); }

  isShipShielded(shipId) { return this.shieldedShips.has(shipId); }

  isShielded(r, c) {
    const ship = this.getShipAt(r, c);
    return !!(ship && this.shieldedShips.has(ship.id));
  }

  addShieldToShip(shipId) { this.shieldedShips.add(shipId); }

  getSonarMark(r, c) { return this.sonarMarks.get(this.key(r, c)); }

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

  /** Синхронизирует потопление — если все клетки корабля поражены, он тонет */
  reconcileSunkShips() {
    for (const ship of this.ships) {
      if (ship.sunk) continue;
      const allCellsHit = ship.cells.every(([r, c]) => {
        const s = this.shots[r][c];
        return s === CELL.HIT || s === CELL.SUNK;
      });
      if (allCellsHit || ship.hits >= ship.cells.length) {
        ship.sunk = true;
        ship.hits = ship.cells.length;
        markSunkArea(this.shots, ship);
        for (const [sr, sc] of ship.cells) this.revealCell(sr, sc);
      }
    }
  }

  allShipsSunk() {
    this.reconcileSunkShips();
    return this.ships.length > 0 && this.ships.every(s => s.sunk);
  }

  fire(r, c, options = {}) {
    if (!options.sonarScan) {
      this.sonarMarks.clear();
    }

    if (this.shots[r][c] !== CELL.EMPTY && !options.allowRepeat) {
      return { valid: false, reason: 'already_shot' };
    }

    const ship = findShipAt(this.ships, r, c);
    const result = { valid: true, r, c, hit: false, sunk: false, ship: null, shieldBlocked: false, cells: [[r, c]] };

    if (ship && this.shieldedShips.has(ship.id) && !options.ignoreShield) {
      this.shieldedShips.delete(ship.id);
      this.shots[r][c] = CELL.MISS;
      result.shieldBlocked = true;
      result.hit = false;
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
      ship.revealed = true;
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

    this.reconcileSunkShips();
    return result;
  }

  fireChainVolley(r, c) {
    const first = this.fire(r, c);
    if (!first.valid) return [first];

    if (!first.hit || !first.ship) return [first];

    const ship = first.ship;
    const results = [first];

    for (const [sr, sc] of ship.cells) {
      if (sr === r && sc === c) continue;
      const res = this.fire(sr, sc, { allowRepeat: true, ignoreShield: true, ignoreArmor: true });
      if (res.valid) results.push(res);
    }

    ship.sunk = true;
    ship.hits = ship.cells.length;
    markSunkArea(this.shots, ship);
    for (const [sr, sc] of ship.cells) this.revealCell(sr, sc);
    for (const res of results) {
      if (res.ship === ship) res.sunk = true;
    }
    this.reconcileSunkShips();
    return results;
  }

  sonarScanZone(r, c) {
    if (this.shots[r][c] !== CELL.EMPTY) {
      return { found: false, r, c, invalid: true, cells: [] };
    }

    const cells = [];
    let found = false;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        cells.push([nr, nc]);
        if (findShipAt(this.ships, nr, nc)) found = true;
      }
    }

    const base = found ? 'zone-ship' : 'zone-clear';
    for (const [nr, nc] of cells) {
      const isCenter = nr === r && nc === c;
      this.sonarMarks.set(this.key(nr, nc), isCenter ? `${base}-center` : `${base}-edge`);
    }

    return { found, r, c, cells, zoneMark: base, invalid: false };
  }

  sonarPing(r, c) {
    return this.sonarScanZone(r, c);
  }

  sonarScan(r, c) {
    const result = this.sonarScanZone(r, c);
    if (result.invalid) return [];
    if (!result.found) return [];
    return result.cells.filter(([nr, nc]) => findShipAt(this.ships, nr, nc));
  }

  getRemainingShips() {
    this.reconcileSunkShips();
    return this.ships.filter(s => !s.sunk);
  }
}

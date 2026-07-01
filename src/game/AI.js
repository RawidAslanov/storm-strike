import { GRID_SIZE, CELL } from './constants.js';
import { getAdjacentCells } from './Ship.js';

export class AI {
  constructor() {
    this.difficulty = { aiSmart: 0.6, aiDelay: 900 };
    this.targetBoard = null;
    this.shots = [];
    this.huntQueue = [];
    this.lastHit = null;
  }

  reset(difficulty) {
    this.difficulty = difficulty;
    this.shots = [];
    this.huntQueue = [];
    this.lastHit = null;
  }

  setBoard(board) {
    this.targetBoard = board;
  }

  getShot() {
    if (this.huntQueue.length > 0) {
      const [r, c] = this.huntQueue.shift();
      if (this.isValidShot(r, c)) return { r, c };
    }

    if (this.lastHit && Math.random() < this.difficulty.aiSmart) {
      const adj = getAdjacentCells(this.lastHit[0], this.lastHit[1]);
      const valid = adj.filter(([r, c]) => this.isValidShot(r, c));
      if (valid.length) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        return { r: pick[0], c: pick[1] };
      }
    }

    return this.getHuntShot();
  }

  getHuntShot() {
    const available = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.isValidShot(r, c)) available.push([r, c]);
      }
    }

    if (!available.length) return { r: 0, c: 0 };

    if (Math.random() < this.difficulty.aiSmart) {
      const parity = available.filter(([r, c]) => (r + c) % 2 === 0);
      if (parity.length) {
        const pick = parity[Math.floor(Math.random() * parity.length)];
        return { r: pick[0], c: pick[1] };
      }
    }

    const pick = available[Math.floor(Math.random() * available.length)];
    return { r: pick[0], c: pick[1] };
  }

  isValidShot(r, c) {
    return !this.shots.some(([sr, sc]) => sr === r && sc === c);
  }

  registerShot(r, c, result) {
    this.shots.push([r, c]);

    if (result.hit && !result.sunk) {
      this.lastHit = [r, c];
      const adj = getAdjacentCells(r, c);
      for (const [ar, ac] of adj) {
        if (this.isValidShot(ar, ac) && !this.huntQueue.some(([hr, hc]) => hr === ar && hc === ac)) {
          this.huntQueue.push([ar, ac]);
        }
      }
    }

    if (result.sunk) {
      this.lastHit = null;
      this.huntQueue = [];
    }
  }
}

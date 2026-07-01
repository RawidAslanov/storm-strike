import { GRID_SIZE, CELL, SHIP_TYPES } from './constants.js';

let shipIdCounter = 0;

export function resetShipIds() {
  shipIdCounter = 0;
}

export function createShip(typeId, cells) {
  const type = SHIP_TYPES[typeId];
  return {
    id: ++shipIdCounter,
    typeId,
    type,
    cells: [...cells],
    hits: 0,
    sunk: false,
    armorUsed: false,
    broadsideUsed: false,
    revealed: typeId !== 'submarine',
  };
}

export function cellsInBounds(cells) {
  return cells.every(([r, c]) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE);
}

export function canPlaceShip(grid, cells) {
  if (!cells.length || !cellsInBounds(cells)) return false;
  for (const [r, c] of cells) {
    if (grid[r][c] !== CELL.EMPTY) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
          if (grid[nr][nc] === CELL.SHIP) return false;
        }
      }
    }
  }
  return true;
}

export function placeShipOnGrid(grid, ship) {
  for (const [r, c] of ship.cells) {
    grid[r][c] = CELL.SHIP;
  }
}

export function getShipOrientation(cells) {
  if (cells.length < 2) return 'h';
  return cells[0][0] === cells[1][0] ? 'h' : 'v';
}

export function generateRandomFleet() {
  resetShipIds();
  const grid = createEmptyGrid();
  const ships = [];
  const types = ['destroyer', 'destroyer', 'cruiser', 'cruiser', 'battleship', 'carrier', 'submarine'];

  for (const typeId of types) {
    const size = SHIP_TYPES[typeId].size;
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      attempts++;
      const horizontal = Math.random() > 0.5;
      const maxR = horizontal ? GRID_SIZE : GRID_SIZE - size + 1;
      const maxC = horizontal ? GRID_SIZE - size + 1 : GRID_SIZE;
      const r = Math.floor(Math.random() * maxR);
      const c = Math.floor(Math.random() * maxC);
      const cells = [];
      for (let i = 0; i < size; i++) {
        cells.push(horizontal ? [r, c + i] : [r + i, c]);
      }
      if (canPlaceShip(grid, cells)) {
        const ship = createShip(typeId, cells);
        placeShipOnGrid(grid, ship);
        ships.push(ship);
        placed = true;
      }
    }
  }
  return { grid, ships };
}

export function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(CELL.EMPTY));
}

export function getAdjacentCells(r, c) {
  const adj = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
      adj.push([nr, nc]);
    }
  }
  return adj;
}

export function getCrossCells(r, c) {
  const cells = [[r, c]];
  for (let i = 1; i <= 2; i++) {
    if (r - i >= 0) cells.push([r - i, c]);
    if (r + i < GRID_SIZE) cells.push([r + i, c]);
    if (c - i >= 0) cells.push([r, c - i]);
    if (c + i < GRID_SIZE) cells.push([r, c + i]);
  }
  return cells;
}

export function getAreaCells(r, c, radius = 1) {
  const cells = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
        cells.push([nr, nc]);
      }
    }
  }
  return cells;
}

export function allShipsSunk(ships) {
  return ships.every(s => s.sunk);
}

export function findShipAt(ships, r, c) {
  return ships.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
}

export function markSunkArea(grid, ship) {
  for (const [r, c] of ship.cells) {
    grid[r][c] = CELL.SUNK;
  }
  for (const [r, c] of ship.cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
          if (grid[nr][nc] === CELL.EMPTY) grid[nr][nc] = CELL.MISS;
        }
      }
    }
  }
}

import { Board } from '../game/Board.js';
import { SHIP_TYPES, CELL } from '../game/constants.js';
import { createEmptyGrid } from '../game/Ship.js';

export function buildMyBoard(you) {
  const board = new Board();
  if (!you) return board;

  board.grid = createEmptyGrid();
  board.shots = you.enemyShots || createEmptyGrid();
  board.shields = new Set(you.shields || []);
  board.revealed = new Set(you.revealed || []);
  board.fogCells = new Set();

  board.ships = (you.myShips || []).map(s => ({
    ...s,
    type: SHIP_TYPES[s.typeId],
    typeId: s.typeId,
    revealed: s.typeId !== 'submarine' || s.hits > 0,
  }));

  for (const ship of board.ships) {
    for (const [r, c] of ship.cells) {
      if (!ship.sunk) board.grid[r][c] = CELL.SHIP;
    }
  }

  return board;
}

export function buildEnemyBoard(you) {
  const board = new Board();
  if (!you) return board;

  board.shots = you.myShots || createEmptyGrid();
  board.revealed = new Set(you.revealed || []);
  board.fogCells = new Set(you.fogCells || []);
  board.ships = [];
  board.grid = createEmptyGrid();
  return board;
}

export function getMultiplayerGameState(mp, battleState) {
  const you = battleState?.you || battleState?.players?.[mp.playerId];
  return {
    phase: battleState?.phase || mp.state?.phase || 'lobby',
    turn: battleState?.currentTurn,
    isYourTurn: battleState?.isYourTurn ?? (battleState?.currentTurn === mp.playerId),
    turnNumber: battleState?.turnNumber || 0,
    energy: you?.energy ?? 10,
    combo: you?.combo ?? 0,
    inventory: you?.inventory ?? { sonar: 1, chain: 0, airstrike: 0, shield: 0, smoke: 0 },
    stats: you?.stats ?? { hits: 0, misses: 0, shipsSunk: 0, combos: 0 },
    log: battleState?.log ?? [],
    playerBoard: buildMyBoard(you),
    enemyBoard: buildEnemyBoard(you),
    winnerId: battleState?.winnerId,
    players: battleState?.players,
  };
}

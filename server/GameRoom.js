import { Board } from '../src/game/Board.js';
import {
  createShip, canPlaceShip, placeShipOnGrid, generateRandomFleet,
  allShipsSunk, resetShipIds,
} from '../src/game/Ship.js';
import { StormSystem } from '../src/game/StormSystem.js';
import {
  MAX_ENERGY, ENERGY_PER_TURN, COMBO_THRESHOLDS, POWER_UPS, CELL,
} from '../src/game/constants.js';
import { serializeShotResult } from '../shared/protocol.js';
import { randomBytes } from 'crypto';

const PLACEMENT_TYPES = ['carrier', 'battleship', 'cruiser', 'cruiser', 'destroyer', 'destroyer', 'submarine'];

export class GameRoom {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.phase = 'lobby';
    this.currentTurn = null;
    this.turnNumber = 0;
    this.storm = new StormSystem();
    this.log = [];
  }

  genId() {
    return randomBytes(4).toString('hex');
  }

  addPlayer(ws, name) {
    const id = this.genId();
    const player = {
      id,
      name,
      ws,
      board: new Board(),
      placementShips: [],
      placementIndex: 0,
      orientation: 'h',
      placementDone: false,
      ready: false,
      energy: MAX_ENERGY,
      combo: 0,
      inventory: { sonar: 1, chain: 0, airstrike: 0, shield: 0, smoke: 0 },
      activePowerUp: null,
      shieldMode: false,
      smokeActive: false,
      stats: { hits: 0, misses: 0, shipsSunk: 0, combos: 0 },
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  opponentOf(id) {
    for (const pid of this.players.keys()) {
      if (pid !== id) return this.players.get(pid);
    }
    return null;
  }

  getLobbyState() {
    return {
      code: this.code,
      phase: this.phase,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name })),
    };
  }

  startPlacement() {
    resetShipIds();
    this.phase = 'placement';
    for (const player of this.players.values()) {
      player.board.reset();
      player.placementShips = PLACEMENT_TYPES.map(t => createShip(t, []));
      player.placementIndex = 0;
      player.orientation = 'h';
      player.placementDone = false;
    }
  }

  getPlacementState(forPlayerId = null) {
    const state = { phase: this.phase, players: {} };
    for (const [id, p] of this.players) {
      state.players[id] = {
        name: p.name,
        placementDone: p.placementDone,
        placementIndex: p.placementIndex,
        totalShips: p.placementShips.length,
      };
    }
    if (forPlayerId) {
      const p = this.players.get(forPlayerId);
      if (p) {
        state.you = {
          placementIndex: p.placementIndex,
          orientation: p.orientation,
          currentShip: p.placementShips[p.placementIndex]?.typeId || null,
          placedShips: p.board.ships.length,
        };
      }
    }
    return state;
  }

  getCurrentShip(player) {
    return player.placementShips[player.placementIndex] || null;
  }

  getPreview(player, row, col) {
    const ship = this.getCurrentShip(player);
    if (!ship) return [];
    const cells = [];
    for (let i = 0; i < ship.type.size; i++) {
      cells.push(player.orientation === 'h' ? [row, col + i] : [row + i, col]);
    }
    return cells;
  }

  rotate(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'placement') return;
    player.orientation = player.orientation === 'h' ? 'v' : 'h';
  }

  placeShip(playerId, row, col) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'placement' || player.placementDone) {
      return { ok: false, error: 'Нельзя разместить корабль сейчас' };
    }

    const ship = this.getCurrentShip(player);
    if (!ship) return { ok: false, error: 'Все корабли размещены' };

    const cells = this.getPreview(player, row, col);
    if (!canPlaceShip(player.board.grid, cells)) {
      return { ok: false, error: 'Нельзя поставить корабль здесь' };
    }

    ship.cells = cells;
    placeShipOnGrid(player.board.grid, ship);
    player.board.ships.push(ship);
    player.placementIndex++;

    if (player.placementIndex >= player.placementShips.length) {
      player.placementDone = true;
    }

    const battleStarted = this.tryStartBattle();
    return { ok: true, battleStarted };
  }

  autoPlace(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'placement' || player.placementDone) {
      return { ok: false, error: 'Нельзя разместить сейчас' };
    }

    const { grid, ships } = generateRandomFleet();
    player.board.grid = grid;
    player.board.ships = ships;
    player.placementDone = true;
    player.placementIndex = player.placementShips.length;

    const battleStarted = this.tryStartBattle();
    return { ok: true, battleStarted };
  }

  tryStartBattle() {
    const allDone = [...this.players.values()].every(p => p.placementDone);
    if (!allDone || this.players.size < 2) return false;

    this.phase = 'battle';
    this.turnNumber = 1;
    const ids = [...this.players.keys()];
    this.currentTurn = ids[0];
    this.addLog('⚔ Бой начался!');
    return true;
  }

  getTurnState() {
    return {
      currentTurn: this.currentTurn,
      turnNumber: this.turnNumber,
      isYourTurn: null,
    };
  }

  getBattleState(forPlayerId = null) {
    const players = {};
    for (const [id, p] of this.players) {
      const opponent = this.opponentOf(id);
      players[id] = {
        id,
        name: p.name,
        energy: p.energy,
        combo: p.combo,
        inventory: { ...p.inventory },
        smokeActive: p.smokeActive,
        stats: { ...p.stats },
        myShots: opponent ? opponent.board.shots : null,
        enemyShots: p.board.shots,
        myShips: p.board.ships.map(s => ({
          typeId: s.typeId,
          cells: s.cells,
          sunk: s.sunk,
          hits: s.hits,
        })),
        shields: [...p.board.shields],
        revealed: [...p.board.revealed],
        fogCells: [...p.board.fogCells],
      };
    }

    const state = {
      phase: this.phase,
      currentTurn: this.currentTurn,
      turnNumber: this.turnNumber,
      players,
      log: this.log.slice(0, 10),
    };

    if (forPlayerId) {
      state.you = players[forPlayerId];
      state.isYourTurn = this.currentTurn === forPlayerId;
    }
    return state;
  }

  selectPowerUp(playerId, powerUpId) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'battle' || this.currentTurn !== playerId) return;

    if (powerUpId === 'shield') {
      player.shieldMode = !player.shieldMode;
      player.activePowerUp = player.shieldMode ? 'shield' : null;
      return;
    }
    if (player.inventory[powerUpId] <= 0) return;
    player.activePowerUp = player.activePowerUp === powerUpId ? null : powerUpId;
    player.shieldMode = false;
  }

  useSmoke(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.currentTurn !== playerId) return { ok: false, error: 'Не ваш ход' };
    if (player.inventory.smoke <= 0) return { ok: false, error: 'Нет дымовой завесы' };
    if (player.energy < POWER_UPS.smoke.cost) return { ok: false, error: 'Недостаточно энергии' };

    player.inventory.smoke--;
    player.energy -= POWER_UPS.smoke.cost;
    player.smokeActive = true;
    this.addLog(`💨 ${player.name} использовал дымовую завесу`);
    return { ok: true };
  }

  placeShield(playerId, row, col) {
    const player = this.players.get(playerId);
    if (!player || !player.shieldMode || player.inventory.shield <= 0) {
      return { ok: false, error: 'Щит недоступен' };
    }
    const ship = player.board.ships.find(s =>
      !s.sunk && s.cells.some(([r, c]) => r === row && c === col)
    );
    if (!ship) return { ok: false, error: 'Нет корабля в этой клетке' };

    player.inventory.shield--;
    player.board.addShield(row, col);
    player.shieldMode = false;
    player.activePowerUp = null;
    this.addLog(`🛡 ${player.name} установил щит`);
    return { ok: true };
  }

  fire(playerId, row, col) {
    const player = this.players.get(playerId);
    const opponent = this.opponentOf(playerId);

    if (!player || !opponent) return { ok: false, error: 'Игрок не найден' };
    if (this.phase !== 'battle') return { ok: false, error: 'Бой не идёт' };
    if (this.currentTurn !== playerId) return { ok: false, error: 'Не ваш ход' };

    if (opponent.smokeActive) {
      opponent.smokeActive = false;
      this.addLog(`💨 Дымовая завеса ${opponent.name} сбила прицел!`);
      this.endTurn(player, 1);
      return { ok: true, results: [{ valid: true, smokeBlocked: true }], gameOver: false };
    }

    if (opponent.board.shots[row][col] !== CELL.EMPTY && player.activePowerUp !== 'sonar') {
      return { ok: false, error: 'Уже стреляли сюда' };
    }

    let results = [];
    let energyCost = 1;

    if (player.activePowerUp === 'sonar' && player.inventory.sonar > 0) {
      player.inventory.sonar--;
      const found = opponent.board.sonarScan(row, col);
      results = [{ valid: true, r: row, c: col, hit: found.length > 0, sonar: true, found }];
      this.addLog(`📡 ${player.name}: сонар обнаружил ${found.length} целей`);
      player.activePowerUp = null;
      this.endTurn(player, energyCost);
      return {
        ok: true,
        results: results.map(serializeShotResult),
        gameOver: false,
      };
    }

    if (player.activePowerUp === 'airstrike' && player.inventory.airstrike > 0) {
      if (player.energy < POWER_UPS.airstrike.cost + 1) {
        return { ok: false, error: 'Недостаточно энергии' };
      }
      player.inventory.airstrike--;
      energyCost += POWER_UPS.airstrike.cost;
      results = opponent.board.fireAirstrike(row, col);
      player.activePowerUp = null;
      this.addLog(`💣 ${player.name}: авиаудар!`);
    } else if (player.activePowerUp === 'chain' && player.inventory.chain > 0) {
      if (player.energy < POWER_UPS.chain.cost + 1) {
        return { ok: false, error: 'Недостаточно энергии' };
      }
      player.inventory.chain--;
      energyCost += POWER_UPS.chain.cost;
      results = opponent.board.fireChain(row, col);
      player.activePowerUp = null;
      this.addLog(`⚡ ${player.name}: цепная молния!`);
    } else {
      results = [opponent.board.fire(row, col)];
    }

    if (!results.length || !results[0].valid) {
      return { ok: false, error: 'Невозможный выстрел' };
    }

    this.processResults(player, results);

    const gameOver = allShipsSunk(opponent.board.ships);
    let winnerId = null;
    let storm = null;

    if (gameOver) {
      winnerId = playerId;
      this.phase = 'finished';
      this.addLog(`🏆 ${player.name} победил!`);
    } else {
      storm = this.endTurn(player, energyCost);
    }

    return {
      ok: true,
      results: results.map(serializeShotResult),
      gameOver,
      winnerId,
      storm,
    };
  }

  processResults(player, results) {
    let anyHit = false;
    for (const res of results) {
      if (res.sonar) continue;
      if (res.hit) {
        anyHit = true;
        player.stats.hits++;
        if (res.sunk) {
          player.stats.shipsSunk++;
          this.addLog(`💥 ${res.ship?.type?.name || 'Корабль'} потоплен!`);
        }
      } else if (!res.shieldBlocked && !res.armorBlocked) {
        player.stats.misses++;
      }
    }

    if (anyHit) {
      player.combo++;
      for (const threshold of [...COMBO_THRESHOLDS].reverse()) {
        if (player.combo >= threshold.hits) {
          player.inventory[threshold.reward]++;
          player.stats.combos++;
          this.addLog(`${threshold.label} ${player.name}`);
          break;
        }
      }
    } else {
      player.combo = 0;
    }
  }

  endTurn(player, energyCost) {
    player.energy = Math.max(0, player.energy - energyCost);
    this.currentTurn = this.opponentOf(player.id)?.id || null;
    this.turnNumber++;

    for (const p of this.players.values()) {
      if (p.id === this.currentTurn) {
        const bonus = p.board.ships.filter(s => !s.sunk && s.type.ability === 'speed').length;
        p.energy = Math.min(MAX_ENERGY, p.energy + ENERGY_PER_TURN + bonus);
      }
    }

    const stormEvent = this.storm.tick(this.turnNumber);
    if (stormEvent) {
      this.applyStorm(stormEvent);
    }
    return stormEvent;
  }

  applyStorm(event) {
    this.addLog(`${event.icon} ${event.name}: ${event.desc}`);
    if (event.id === 'fog') {
      for (const p of this.players.values()) {
        p.board.applyFog(0.3);
      }
    } else if (event.id === 'lightning') {
      for (const p of this.players.values()) {
        const opponent = this.opponentOf(p.id);
        if (!opponent) continue;
        const empties = [];
        for (let r = 0; r < 10; r++)
          for (let c = 0; c < 10; c++)
            if (opponent.board.shots[r][c] === CELL.EMPTY) empties.push([r, c]);
        if (empties.length) {
          const [r, c] = empties[Math.floor(Math.random() * empties.length)];
          opponent.board.revealCell(r, c);
        }
      }
    } else if (event.id === 'calm') {
      for (const p of this.players.values()) {
        p.energy = Math.min(MAX_ENERGY, p.energy + 2);
      }
    }
    return event;
  }

  addLog(msg) {
    this.log.unshift({ msg, time: Date.now() });
    if (this.log.length > 20) this.log.pop();
  }
}

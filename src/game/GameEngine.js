import { PHASE, DIFFICULTY, MAX_ENERGY, ENERGY_PER_TURN, COMBO_THRESHOLDS, POWER_UPS, STORM_EVENTS, CELL } from './constants.js';
import { Board } from './Board.js';
import { generateRandomFleet, createShip, canPlaceShip, placeShipOnGrid, allShipsSunk, resetShipIds, createEmptyGrid } from './Ship.js';
import { AI } from './AI.js';
import { StormSystem } from './StormSystem.js';

export class GameEngine {
  constructor() {
    this.phase = PHASE.MENU;
    this.difficulty = 'normal';
    this.playerBoard = new Board();
    this.enemyBoard = new Board();
    this.ai = new AI();
    this.storm = new StormSystem();
    this.energy = MAX_ENERGY;
    this.combo = 0;
    this.turn = 'player';
    this.inventory = { sonar: 1, chain: 0, airstrike: 0, shield: 0, smoke: 0 };
    this.activePowerUp = null;
    this.shieldMode = false;
    this.placementShips = [];
    this.placementIndex = 0;
    this.placementOrientation = 'h';
    this.winner = null;
    this.log = [];
    this.turnNumber = 0;
    this.smokeActive = false;
    this.listeners = new Set();
    this.lastResults = [];
    this.stats = { hits: 0, misses: 0, shipsSunk: 0, combos: 0 };
  }

  on(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit(event, data) { this.listeners.forEach(cb => cb(event, data)); }

  startGame(difficulty = 'normal') {
    this.difficulty = difficulty;
    this.phase = PHASE.PLACEMENT;
    this.reset();
    this.setupPlacement();
    this.emit('phase', this.phase);
  }

  reset() {
    resetShipIds();
    this.playerBoard.reset();
    this.enemyBoard.reset();
    this.energy = MAX_ENERGY;
    this.combo = 0;
    this.turn = 'player';
    this.inventory = { sonar: 1, chain: 0, airstrike: 0, shield: 0, smoke: 0 };
    this.activePowerUp = null;
    this.shieldMode = false;
    this.winner = null;
    this.log = [];
    this.turnNumber = 0;
    this.smokeActive = false;
    this.lastResults = [];
    this.stats = { hits: 0, misses: 0, shipsSunk: 0, combos: 0 };
    this.storm.reset();
    this.ai.reset(DIFFICULTY[this.difficulty]);
  }

  setupPlacement() {
    const types = ['carrier', 'battleship', 'cruiser', 'cruiser', 'destroyer', 'destroyer', 'submarine'];
    this.placementShips = types.map(t => createShip(t, []));
    this.placementIndex = 0;
    this.placementOrientation = 'h';
    this.playerBoard.reset();
  }

  autoPlacePlayerFleet() {
    const { grid, ships } = generateRandomFleet();
    this.playerBoard.grid = grid;
    this.playerBoard.ships = ships;
    this.startBattle();
  }

  getCurrentPlacementShip() {
    return this.placementShips[this.placementIndex] || null;
  }

  rotatePlacement() {
    this.placementOrientation = this.placementOrientation === 'h' ? 'v' : 'h';
    this.emit('placement');
  }

  getPlacementPreview(row, col) {
    const ship = this.getCurrentPlacementShip();
    if (!ship) return [];
    const cells = [];
    for (let i = 0; i < ship.type.size; i++) {
      cells.push(this.placementOrientation === 'h' ? [row, col + i] : [row + i, col]);
    }
    return cells;
  }

  placeShipAt(row, col, options = {}) {
    const ship = this.getCurrentPlacementShip();
    if (!ship) return false;
    const cells = this.getPlacementPreview(row, col);
    if (!canPlaceShip(this.playerBoard.grid, cells)) return false;

    ship.cells = cells;
    placeShipOnGrid(this.playerBoard.grid, ship);
    this.playerBoard.ships.push(ship);
    this.placementIndex++;

    if (this.placementIndex >= this.placementShips.length) {
      if (!options.skipBattle) this.startBattle();
    } else {
      this.emit('placement');
    }
    return true;
  }

  startBattle() {
    const enemy = generateRandomFleet();
    this.enemyBoard.grid = enemy.grid;
    this.enemyBoard.ships = enemy.ships;
    this.ai.setBoard(this.playerBoard);
    this.phase = PHASE.BATTLE;
    this.turnNumber = 1;
    this.addLog('⚔ Бой начался! Уничтожьте вражеский флот!');
    this.emit('phase', PHASE.BATTLE);
    this.emit('battle_start');
  }

  selectPowerUp(id) {
    if (this.turn !== 'player' || this.phase !== PHASE.BATTLE) return;
    if (id === 'shield') {
      this.shieldMode = !this.shieldMode;
      this.activePowerUp = this.shieldMode ? 'shield' : null;
      this.emit('powerup');
      return;
    }
    if (this.inventory[id] <= 0) return;
    this.activePowerUp = this.activePowerUp === id ? null : id;
    this.shieldMode = false;
    this.emit('powerup');
  }

  canAfford(cost) { return this.energy >= cost; }

  playerFire(row, col) {
    if (this.turn !== 'player' || this.phase !== PHASE.BATTLE) return null;
    if (this.enemyBoard.shots[row][col] !== CELL.EMPTY && this.activePowerUp !== 'sonar') return null;

    let results = [];
    let energyCost = 1;

    if (this.activePowerUp === 'sonar' && this.inventory.sonar > 0) {
      this.inventory.sonar--;
      const found = this.enemyBoard.sonarScan(row, col);
      results = [{ valid: true, r: row, c: col, hit: found.length > 0, sonar: true, found }];
      this.addLog(`📡 Сонар: обнаружено ${found.length} целей`);
      this.activePowerUp = null;
      this.endPlayerTurn(energyCost);
      return results;
    }

    if (this.activePowerUp === 'airstrike' && this.inventory.airstrike > 0) {
      if (!this.canAfford(POWER_UPS.airstrike.cost)) return null;
      this.inventory.airstrike--;
      energyCost += POWER_UPS.airstrike.cost;
      results = this.enemyBoard.fireAirstrike(row, col);
      this.addLog('💣 Авиаудар!');
      this.activePowerUp = null;
    } else if (this.activePowerUp === 'chain' && this.inventory.chain > 0) {
      if (!this.canAfford(POWER_UPS.chain.cost)) return null;
      this.inventory.chain--;
      energyCost += POWER_UPS.chain.cost;
      results = this.enemyBoard.fireChain(row, col);
      this.addLog('⚡ Цепная молния!');
      this.activePowerUp = null;
    } else {
      results = [this.enemyBoard.fire(row, col)];
    }

    if (!results.length || !results[0].valid) return null;

    this.processResults(results, 'player');
    this.lastResults = results;

    if (allShipsSunk(this.enemyBoard.ships)) {
      this.winner = 'player';
      this.phase = PHASE.GAME_OVER;
      this.emit('gameover', 'player');
      return results;
    }

    this.endPlayerTurn(energyCost);
    return results;
  }

  playerShield(row, col) {
    if (!this.shieldMode || this.inventory.shield <= 0) return false;
    const ship = this.playerBoard.ships.find(s =>
      !s.sunk && s.cells.some(([r, c]) => r === row && c === col)
    );
    if (!ship) return false;
    this.inventory.shield--;
    this.playerBoard.addShield(row, col);
    this.shieldMode = false;
    this.activePowerUp = null;
    this.addLog('🛡 Щит установлен!');
    this.emit('shield', { row, col });
    return true;
  }

  processResults(results, who) {
    let anyHit = false;
    for (const res of results) {
      if (res.sonar) continue;
      if (res.hit) {
        anyHit = true;
        if (who === 'player') this.stats.hits++;
        if (res.sunk) {
          this.stats.shipsSunk++;
          const name = res.ship?.type?.name || 'Корабль';
          this.addLog(`💥 ${name} уничтожен!`);
        }
      } else if (!res.shieldBlocked && !res.armorBlocked) {
        if (who === 'player') this.stats.misses++;
      }
    }

    if (who === 'player') {
      if (anyHit) {
        this.combo++;
        this.checkComboReward();
      } else {
        this.combo = 0;
      }
    }
  }

  checkComboReward() {
    for (const threshold of [...COMBO_THRESHOLDS].reverse()) {
      if (this.combo >= threshold.hits) {
        this.inventory[threshold.reward]++;
        this.stats.combos++;
        this.addLog(`${threshold.label} +${POWER_UPS[threshold.reward].name}`);
        this.emit('combo', threshold);
        break;
      }
    }
  }

  endPlayerTurn(energyCost) {
    this.energy = Math.max(0, this.energy - energyCost);
    this.turn = 'ai';
    this.emit('turn', 'ai');

    setTimeout(() => this.aiTurn(), DIFFICULTY[this.difficulty].aiDelay);
  }

  aiTurn() {
    if (this.phase !== PHASE.BATTLE) return;

    if (this.smokeActive) {
      this.smokeActive = false;
      this.addLog('💨 Дымовая завеса сбила прицел врага!');
      this.finishAiTurn();
      return;
    }

    const shot = this.ai.getShot();
    let results = [this.playerBoard.fire(shot.r, shot.c)];
    this.ai.registerShot(shot.r, shot.c, results[0]);
    this.processResults(results, 'ai');
    this.lastResults = results;

    if (results[0].hit) {
      this.addLog(`🔴 Враг попал в [${shot.r + 1},${shot.c + 1}]!`);
    }

    if (allShipsSunk(this.playerBoard.ships)) {
      this.winner = 'ai';
      this.phase = PHASE.GAME_OVER;
      this.emit('gameover', 'ai');
      return;
    }

    this.finishAiTurn();
  }

  finishAiTurn() {
    this.turnNumber++;
    this.turn = 'player';
    this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_PER_TURN + this.getEnergyBonus());

    const stormEvent = this.storm.tick(this.turnNumber);
    if (stormEvent) {
      this.applyStorm(stormEvent);
    }

    this.emit('turn', 'player');
  }

  getEnergyBonus() {
    return this.playerBoard.ships
      .filter(s => !s.sunk && s.type.ability === 'speed')
      .length;
  }

  applyStorm(event) {
    this.addLog(`${event.icon} ${event.name}: ${event.desc}`);
    this.emit('storm', event);

    switch (event.id) {
      case 'fog':
        this.enemyBoard.applyFog(0.3);
        setTimeout(() => this.enemyBoard.clearFog(), event.duration * 3000);
        break;
      case 'lightning': {
        const empties = [];
        for (let r = 0; r < 10; r++)
          for (let c = 0; c < 10; c++)
            if (this.enemyBoard.shots[r][c] === CELL.EMPTY) empties.push([r, c]);
        if (empties.length) {
          const [r, c] = empties[Math.floor(Math.random() * empties.length)];
          this.enemyBoard.revealCell(r, c);
          this.emit('lightning', { r, c });
        }
        break;
      }
      case 'calm':
        this.energy = Math.min(MAX_ENERGY, this.energy + 2);
        break;
      default:
        break;
    }
  }

  useSmoke() {
    if (this.inventory.smoke <= 0 || !this.canAfford(POWER_UPS.smoke.cost)) return false;
    this.inventory.smoke--;
    this.energy -= POWER_UPS.smoke.cost;
    this.smokeActive = true;
    this.addLog('💨 Дымовая завеса активирована!');
    return true;
  }

  addLog(msg) {
    this.log.unshift({ msg, time: Date.now() });
    if (this.log.length > 20) this.log.pop();
    this.emit('log', msg);
  }
}

import { GameEngine } from '../game/GameEngine.js';
import { PHASE, GAME_MODE, TOTAL_SHIPS } from '../game/constants.js';
import { MultiplayerClient } from '../multiplayer/MultiplayerClient.js';
import { getMultiplayerGameState } from '../multiplayer/boardBuilder.js';
import {
  renderGrid, updateGrid, initGridLayers, renderPlacementGrid, renderPowerUps, updatePowerUps,
  renderShipList, renderLog, updateLog, showStormOverlay,
  renderDifficultyButtons, renderFleetPanel, renderFleetGuide,
} from './renderer.js';
import { refreshShipLayers } from './shipLayer.js';
import { animateCannonVolley } from './cannonFx.js';
import { sounds, resumeAudio } from './sounds.js';
import { music, createMusicControls, bindMusicGesture } from './music.js';

export class App {
  constructor(root) {
    this.root = root;
    this.mode = null;
    this.game = new GameEngine();
    this.mp = null;
    this.mpState = null;
    this.placementOrientation = 'h';
    this.placementIndex = 0;
    this.playerName = localStorage.getItem('ss_name') || '';
    this.shieldMode = false;
    this.activePowerUp = null;
    this.mpLocalGame = null;
    this.currentPhase = null;
    this.battleRefs = null;
    this.placementGrid = null;
    this.musicBar = null;

    this.initPersistentLayers();

    this.game.on((event, data) => this.handleEvent(event, data));
    this.render();
  }

  initPersistentLayers() {
    this.root.innerHTML = '';
    const ocean = document.createElement('div');
    ocean.className = 'ocean-bg';
    ocean.innerHTML = `
      <div class="ocean-bg__vignette"></div>
      <div class="ocean-bg__stars"></div>
      <div class="ocean-bg__caustics"></div>
      <div class="ocean-bg__grade"></div>
      <div class="waves"></div>
      <div class="waves waves--2"></div>
      <div class="waves waves--3"></div>
    `;
    this.root.appendChild(ocean);

    const fxLayer = document.createElement('div');
    fxLayer.id = 'fx-layer';
    fxLayer.className = 'fx-layer';
    this.root.appendChild(fxLayer);

    const stormOverlay = document.createElement('div');
    stormOverlay.id = 'storm-overlay';
    stormOverlay.className = 'storm-overlay';
    this.root.appendChild(stormOverlay);

    this.container = document.createElement('div');
    this.container.className = 'app-container';
    this.root.appendChild(this.container);

    this.musicBar = createMusicControls();
    this.root.appendChild(this.musicBar);
    bindMusicGesture(() => resumeAudio());
  }

  startMusicOnce() {
    resumeAudio();
    music.ensurePlaying();
  }

  handleEvent(event, data) {
    switch (event) {
      case 'combo':
        sounds.combo();
        this.showComboPopup(data.label);
        break;
      case 'storm':
        sounds.storm();
        showStormOverlay(data);
        break;
      case 'lightning':
        break;
      case 'gameover':
        if (data === 'player') return;
        if (data === 'ai' && this.battleRefs && this.game.lastResults?.length) {
          this._runAiShotAnimation().then(() => {
            sounds.lose();
            this.currentPhase = null;
            this.battleRefs = null;
            this.render();
          });
          return;
        }
        sounds.lose();
        this.currentPhase = null;
        this.battleRefs = null;
        break;
      case 'placement':
        if (this.currentPhase === PHASE.PLACEMENT && this.placementGrid?._refresh) {
          this.placementGrid._refresh();
          const list = this.container.querySelector('#ship-list');
          if (list) {
            const newList = renderShipList(this.game);
            list.replaceWith(newList);
            newList.id = 'ship-list';
          }
          const sub = this.container.querySelector('.header__sub');
          const ship = this.game.getCurrentPlacementShip();
          if (sub) sub.textContent = ship ? `Разместите: ${ship.type.name} (${ship.type.size} кл.)` : 'Готово!';
          return;
        }
        break;
      case 'powerup':
      case 'shield':
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
        }
        return;
      case 'turn':
        if (data === 'player' && this.battleRefs && !this.mp && this.game.lastResults?.length) {
          this._runAiShotAnimation();
          return;
        }
        if (data === 'ai') return;
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
          return;
        }
        break;
      case 'log':
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
          return;
        }
        break;
    }
    this.render();
  }

  setupMultiplayer() {
    if (this.mp) return;
    this.mp = new MultiplayerClient();
    this.mp.on((event, data) => this.handleMpEvent(event, data));
  }

  handleMpEvent(event, data) {
    switch (event) {
      case 'room_created':
      case 'room_joined':
        this.game.phase = PHASE.LOBBY;
        this.currentPhase = null;
        break;
      case 'player_joined':
      case 'placement_update':
        if (data.you) {
          if (!this.mpLocalGame) {
            this.mpLocalGame = new GameEngine();
            this.mpLocalGame.setupPlacement();
          }
          this.mpLocalGame.placementIndex = data.you.placementIndex;
          this.mpLocalGame.placementOrientation = data.you.orientation || 'h';
        }
        break;
      case 'game_start':
        this.game.phase = data.phase === 'battle' ? PHASE.BATTLE : PHASE.PLACEMENT;
        this.currentPhase = null;
        if (data.phase === 'battle') {
          this.mpState = getMultiplayerGameState(this.mp, this.mp.state?.battle);
        }
        break;
      case 'shot_result':
        for (const res of data.results || []) {
          if (res.sonar) sounds.sonar();
          else if (res.hit) { sounds.hit(); if (res.sunk) setTimeout(() => sounds.sunk(), 200); }
          else if (!res.smokeBlocked) sounds.miss();
        }
        this.mpState = getMultiplayerGameState(this.mp, data);
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
          return;
        }
        break;
      case 'state_sync':
        this.mpState = getMultiplayerGameState(this.mp, data);
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
          return;
        }
        break;
      case 'storm':
        sounds.storm();
        showStormOverlay(data);
        break;
      case 'game_over':
        sounds[data.winnerId === this.mp.playerId ? 'win' : 'lose']();
        this.game.phase = PHASE.GAME_OVER;
        this.currentPhase = null;
        this.battleRefs = null;
        this.mpState = getMultiplayerGameState(this.mp, data);
        break;
      case 'turn':
        if (this.mpState) this.mpState.isYourTurn = data.currentTurn === this.mp.playerId;
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
          return;
        }
        break;
      case 'error':
        this.showToast(data.message || 'Ошибка');
        return;
      case 'disconnected':
        this.showToast('Соединение потеряно');
        return;
    }
    this.render();
  }

  getBattleState() {
    if (this.mp) {
      const s = this.mpState || getMultiplayerGameState(this.mp, {});
      return {
        isPlayerTurn: s.isYourTurn,
        energy: 0,
        turnNumber: s.turnNumber,
        stats: s.stats,
        combo: s.combo,
        playerBoard: s.playerBoard,
        enemyBoard: s.enemyBoard,
        inventory: s.inventory,
        log: s.log,
        isMp: true,
        game: {
          turn: s.isYourTurn ? 'player' : 'ai',
          phase: 'battle',
          shieldMode: this.shieldMode,
          activePowerUp: this.activePowerUp,
          inventory: s.inventory,
        },
      };
    }
    const g = this.game;
    return {
      isPlayerTurn: g.turn === 'player',
      turnNumber: g.turnNumber,
      stats: g.stats,
      combo: g.combo,
      playerBoard: g.playerBoard,
      enemyBoard: g.enemyBoard,
      inventory: g.inventory,
      log: g.log,
      isMp: false,
      game: g,
    };
  }

  showComboPopup(text) {
    const el = document.createElement('div');
    el.className = 'combo-popup';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  render() {
    const phase = this.mp ? this.game.phase : this.game.phase;

    if (phase === PHASE.BATTLE && this.currentPhase === PHASE.BATTLE && this.battleRefs) {
      this.updateBattleUI(this.getBattleState());
      return;
    }

    this.currentPhase = phase;
    this.battleRefs = null;
    this.placementGrid = null;
    this.container.innerHTML = '';

    switch (phase) {
      case PHASE.MENU: this.renderMenu(this.container); break;
      case PHASE.LOBBY: this.renderLobby(this.container); break;
      case PHASE.PLACEMENT:
        this.mp ? this.renderMpPlacement(this.container) : this.renderPlacement(this.container);
        break;
      case PHASE.BATTLE:
        this.mp ? this.renderMpBattle(this.container) : this.renderBattle(this.container);
        break;
      case PHASE.GAME_OVER: this.renderGameOver(this.container); break;
    }
  }

  renderMenu(container) {
    container.innerHTML = `
      <div class="screen screen--menu">
        <div class="logo logo--hero">
          <div class="logo__frame">
            <div class="logo__icon">⚓</div>
          </div>
          <h1 class="logo__title">STORM STRIKE</h1>
          <p class="logo__subtitle">Пиратский Морской Бой · ${TOTAL_SHIPS} кораблей</p>
          <span class="logo__badge">⚔ Пушки · Штормы · PvP</span>
        </div>
        <div id="fleet-guide"></div>
        <div class="menu-modes menu-modes--cards">
          <button class="btn btn--primary btn--large" id="btn-solo">🤖 Против AI</button>
          <button class="btn btn--secondary btn--large" id="btn-online">👥 Онлайн PvP</button>
        </div>
        <div id="solo-panel" class="menu-panel" hidden>
          <p class="menu-hint">Выберите сложность</p>
          <div id="diff-btns"></div>
        </div>
        <div id="online-panel" class="menu-panel" hidden>
          <input class="input" id="player-name" placeholder="Ваше имя" maxlength="20" value="${this.playerName}" />
          <button class="btn btn--primary" id="btn-create">Создать комнату</button>
          <div class="join-row">
            <input class="input" id="room-code" placeholder="Код комнаты" maxlength="6" />
            <button class="btn btn--secondary" id="btn-join">Войти</button>
          </div>
          <p class="menu-hint menu-hint--small">Для мультиплеера: <code>npm run server</code></p>
        </div>
      </div>
    `;

    container.querySelector('#fleet-guide').appendChild(renderFleetGuide());

    container.querySelector('#btn-solo').addEventListener('click', () => {
      sounds.click();
      this.startMusicOnce();
      container.querySelector('#solo-panel').hidden = false;
      container.querySelector('#online-panel').hidden = true;
      const diffContainer = container.querySelector('#diff-btns');
      diffContainer.innerHTML = '';
      diffContainer.appendChild(renderDifficultyButtons((diff) => {
        resumeAudio();
        this.startMusicOnce();
        sounds.click();
        this.mp = null;
        this.mode = GAME_MODE.SINGLE;
        this.game.startGame(diff);
      }));
    });

    container.querySelector('#btn-online').addEventListener('click', () => {
      sounds.click();
      this.startMusicOnce();
      container.querySelector('#online-panel').hidden = false;
      container.querySelector('#solo-panel').hidden = true;
    });

    container.querySelector('#btn-create').addEventListener('click', async () => {
      resumeAudio();
      sounds.click();
      const name = container.querySelector('#player-name').value.trim() || 'Адмирал';
      localStorage.setItem('ss_name', name);
      this.playerName = name;
      this.mode = GAME_MODE.MULTIPLAYER;
      this.setupMultiplayer();
      try {
        await this.mp.connect();
        this.mp.createRoom(name);
      } catch {
        this.showToast('Не удалось подключиться. Запустите: npm run server');
      }
    });

    container.querySelector('#btn-join').addEventListener('click', async () => {
      resumeAudio();
      sounds.click();
      const name = container.querySelector('#player-name').value.trim() || 'Капитан';
      const code = container.querySelector('#room-code').value.trim();
      if (!code) return this.showToast('Введите код комнаты');
      localStorage.setItem('ss_name', name);
      this.playerName = name;
      this.mode = GAME_MODE.MULTIPLAYER;
      this.setupMultiplayer();
      try {
        await this.mp.connect();
        this.mp.joinRoom(code, name);
      } catch {
        this.showToast('Не удалось подключиться к серверу');
      }
    });
  }

  renderLobby(container) {
    const lobby = this.mp?.state?.lobby;
    const players = lobby?.players || [];
    const isHost = players.length === 1 && players[0]?.id === this.mp?.playerId;

    container.innerHTML = `
      <div class="screen screen--lobby">
        <h2 class="lobby__title">Комната</h2>
        <div class="lobby__code">${this.mp?.roomCode || '----'}</div>
        <p class="lobby__hint">${isHost ? 'Отправьте код другу' : 'Ожидание начала...'}</p>
        <div class="lobby__players">
          ${players.map(p => `<div class="lobby__player">${p.name} ${p.id === this.mp?.playerId ? '(вы)' : ''}</div>`).join('')}
          ${players.length < 2 ? '<div class="lobby__player lobby__player--waiting">Ожидание соперника...</div>' : ''}
        </div>
        <button class="btn btn--secondary" id="btn-leave">← Назад</button>
      </div>
    `;

    container.querySelector('#btn-leave').addEventListener('click', () => {
      this.mp?.disconnect();
      this.mp = null;
      this.game.phase = PHASE.MENU;
      this.render();
    });
  }

  renderPlacement(container) {
    const ship = this.game.getCurrentPlacementShip();
    container.innerHTML = `
      <div class="screen screen--placement">
        <header class="header header--glass">
          <h2>⚓ Расстановка флота</h2>
          <p class="header__sub">${ship ? `Разместите: ${ship.type.name} (${ship.type.size} кл.)` : 'Готово!'}</p>
        </header>
        <div id="placement-grid" class="grid-wrap"></div>
        <div id="ship-list"></div>
        <div class="placement-actions">
          <button class="btn btn--secondary" id="btn-rotate">🔄 Повернуть</button>
          <button class="btn btn--primary" id="btn-auto">⚡ Авто</button>
        </div>
      </div>
    `;

    this.placementGrid = renderPlacementGrid(this.game, (r, c) => {
      resumeAudio(); sounds.click();
      this.game.placeShipAt(r, c);
    });
    container.querySelector('#placement-grid').appendChild(this.placementGrid);
    this.placementGrid._attachLayers?.();
    const list = renderShipList(this.game);
    list.id = 'ship-list';
    container.querySelector('#ship-list').replaceWith(list);

    container.querySelector('#btn-rotate').addEventListener('click', () => {
      sounds.click(); this.game.rotatePlacement();
    });
    container.querySelector('#btn-auto').addEventListener('click', () => {
      sounds.click(); this.game.autoPlacePlayerFleet();
    });
  }

  renderMpPlacement(container) {
    if (!this.mpLocalGame) {
      this.mpLocalGame = new GameEngine();
      this.mpLocalGame.setupPlacement();
    }
    const localGame = this.mpLocalGame;
    const ship = localGame.getCurrentPlacementShip();

    container.innerHTML = `
      <div class="screen screen--placement">
        <header class="header header--glass">
          <h2>⚓ Расстановка флота</h2>
          <p class="header__sub">${ship ? `Разместите: ${ship.type.name} (${ship.type.size} кл.)` : 'Ожидание соперника...'}</p>
        </header>
        <div id="placement-grid" class="grid-wrap"></div>
        <div id="ship-list"></div>
        <div class="placement-actions">
          <button class="btn btn--secondary" id="btn-rotate">🔄 Повернуть</button>
          <button class="btn btn--primary" id="btn-auto">⚡ Авто</button>
        </div>
      </div>
    `;

    this.placementGrid = renderPlacementGrid(localGame, (r, c) => {
      resumeAudio(); sounds.click();
      this.mp.placeShip(r, c);
      localGame.placeShipAt(r, c, { skipBattle: true });
    });
    container.querySelector('#placement-grid').appendChild(this.placementGrid);
    this.placementGrid._attachLayers?.();
    const list = renderShipList(localGame);
    list.id = 'ship-list';
    container.querySelector('#ship-list').replaceWith(list);

    container.querySelector('#btn-rotate').addEventListener('click', () => {
      sounds.click();
      localGame.rotatePlacement();
      this.mp.rotate();
    });
    container.querySelector('#btn-auto').addEventListener('click', () => {
      sounds.click();
      this.mp.autoPlace();
      localGame.autoPlacePlayerFleet({ skipBattle: true });
    });
  }

  buildBattleScreen(container, state, handlers) {
    const { isPlayerTurn, turnNumber, stats, combo, playerBoard, enemyBoard, log, isMp, game } = state;
    const enemyRemaining = enemyBoard.getRemainingShips().length;

    container.innerHTML = `
      <div class="screen screen--battle">
        <header class="hud hud--glass">
          <div class="hud__turn ${isPlayerTurn ? 'hud__turn--player' : 'hud__turn--enemy'}">
            ${isPlayerTurn ? '🎯 Ваш ход — стреляйте!' : '⏳ Ход соперника...'}
          </div>
          <div class="hud__row">
            <div class="hud__turn-num">Ход ${turnNumber}${isMp ? ' · PvP' : ''}</div>
          </div>
          <div class="hud__enemy-info">🎯 У соперника: <strong>${enemyRemaining}</strong> из ${TOTAL_SHIPS} кораблей</div>
        </header>
        <div class="boards">
          <div class="board-panel">
            <h3 class="board-panel__title">Поле противника</h3>
            <div id="enemy-grid" class="grid-wrap"></div>
            <div id="enemy-fleet"></div>
          </div>
          <div class="board-panel board-panel--player">
            <h3 class="board-panel__title">Ваш флот</h3>
            <div id="player-grid" class="grid-wrap"></div>
            <div id="player-fleet"></div>
          </div>
        </div>
        <div id="powerups"></div>
        <div id="battle-log"></div>
        <div class="stats">
          <div class="stat"><span class="stat__val" data-stat="hits">${stats.hits}</span><span class="stat__lbl">Попадания</span></div>
          <div class="stat"><span class="stat__val" data-stat="sunk">${stats.shipsSunk}</span><span class="stat__lbl">Потоплено</span></div>
          <div class="stat"><span class="stat__val" data-stat="combo">×${combo}</span><span class="stat__lbl">Комбо</span></div>
        </div>
      </div>
    `;

    const enemyGrid = renderGrid(enemyBoard, 'enemy', game, handlers.onEnemy);
    const playerGrid = renderGrid(playerBoard, 'player', game, handlers.onPlayer);
    const enemyWrap = container.querySelector('#enemy-grid');
    const playerWrap = container.querySelector('#player-grid');
    enemyWrap.appendChild(enemyGrid);
    playerWrap.appendChild(playerGrid);
    playerWrap.classList.toggle('grid-wrap--shield-mode', !!game.shieldMode);
    initGridLayers(enemyWrap, enemyBoard, 'enemy');
    initGridLayers(playerWrap, playerBoard, 'player');

    const enemyFleet = renderFleetPanel(enemyBoard, 'Флот соперника');
    const playerFleet = renderFleetPanel(playerBoard, 'Ваш флот');
    container.querySelector('#enemy-fleet').appendChild(enemyFleet);
    container.querySelector('#player-fleet').appendChild(playerFleet);

    const puGame = { inventory: state.inventory || game.inventory, activePowerUp: game.activePowerUp, shieldMode: game.shieldMode };
    const powerups = renderPowerUps(puGame, handlers.onPowerUp);
    container.querySelector('#powerups').appendChild(powerups);
    container.querySelector('#battle-log').appendChild(renderLog(log));

    this.battleRefs = {
      container,
      enemyGrid,
      playerGrid,
      enemyFleet,
      playerFleet,
      powerups,
      log: container.querySelector('#battle-log'),
      handlers,
    };
  }

  updateBattleUI(state) {
    const refs = this.battleRefs;
    if (!refs) return;

    const { isPlayerTurn, turnNumber, stats, combo, playerBoard, enemyBoard, log, game } = state;
    const enemyRemaining = enemyBoard.getRemainingShips().length;

    const turnEl = refs.container.querySelector('.hud__turn');
    turnEl.className = `hud__turn ${isPlayerTurn ? 'hud__turn--player' : 'hud__turn--enemy'}`;
    turnEl.textContent = isPlayerTurn
      ? (game.shieldMode ? '🛡 Нажмите на корабль — щит на весь корабль' : game.activePowerUp === 'sonar' ? '📡 Локатор: выберите центр области 3×3' : '🎯 Ваш ход — стреляйте!')
      : '⏳ Ход соперника...';

    refs.container.querySelector('.hud__turn-num').textContent = `Ход ${turnNumber}${state.isMp ? ' · PvP' : ''}`;
    refs.container.querySelector('.hud__enemy-info strong').textContent = enemyRemaining;

    refs.container.querySelector('[data-stat="hits"]').textContent = stats.hits;
    refs.container.querySelector('[data-stat="sunk"]').textContent = stats.shipsSunk;
    refs.container.querySelector('[data-stat="combo"]').textContent = `×${combo}`;

    refs.playerGrid.parentElement?.classList.toggle('grid-wrap--shield-mode', !!game.shieldMode);

    updateGrid(refs.enemyGrid, enemyBoard, 'enemy', game);
    updateGrid(refs.playerGrid, playerBoard, 'player', game);
    refreshShipLayers(refs.enemyGrid.parentElement, enemyBoard, 'enemy');
    refreshShipLayers(refs.playerGrid.parentElement, playerBoard, 'player');
    refs.enemyFleet._update(enemyBoard);
    refs.playerFleet._update(playerBoard);
    updatePowerUps(refs.powerups, { inventory: state.inventory || game.inventory, activePowerUp: game.activePowerUp, shieldMode: game.shieldMode });
    updateLog(refs.log, log);
  }

  async _runAiShotAnimation() {
    const refs = this.battleRefs;
    if (!refs) return;
    const playerWrap = refs.container.querySelector('#player-grid');
    await animateCannonVolley(playerWrap, this.game.lastResults, 'player');
    this.updateBattleUI(this.getBattleState());
  }

  renderBattle(container) {
    const g = this.game;
    this.buildBattleScreen(container, this.getBattleState(), {
      onEnemy: async (r, c) => {
        resumeAudio();
        this.startMusicOnce();
        const g = this.game;
        if (g.shieldMode) return;
        const results = g.playerFire(r, c);
        if (!results) return;
        const enemyWrap = this.battleRefs?.container?.querySelector('#enemy-grid');
        if (results[0]?.sonar) {
          sounds.sonar();
          this.updateBattleUI(this.getBattleState());
          return;
        }
        await animateCannonVolley(enemyWrap, results, 'enemy');
        if (g.phase === PHASE.GAME_OVER) {
          sounds.win();
          this.currentPhase = null;
          this.battleRefs = null;
          this.render();
        } else if (g.phase === PHASE.BATTLE) {
          this.updateBattleUI(this.getBattleState());
        }
      },
      onPlayer: (r, c) => {
        if (!g.shieldMode) return;
        resumeAudio();
        if (g.playerShield(r, c)) {
          sounds.powerup();
          this.updateBattleUI(this.getBattleState());
        }
      },
      onPowerUp: (id) => {
        resumeAudio();
        sounds.powerup();
        g.selectPowerUp(id);
      },
    });
  }

  renderMpBattle(container) {
    const state = this.getBattleState();
    this.buildBattleScreen(container, state, {
      onEnemy: (r, c) => {
        if (!state.isPlayerTurn || this.shieldMode) return;
        resumeAudio();
        this.startMusicOnce();
        this.mp.fire(r, c);
      },
      onPlayer: (r, c) => {
        if (!this.shieldMode) return;
        resumeAudio(); sounds.powerup();
        this.mp.shield(r, c);
        this.shieldMode = false;
      },
      onPowerUp: (id) => {
        resumeAudio(); sounds.powerup();
        if (id === 'smoke') this.mp.useSmoke();
        else if (id === 'shield') this.shieldMode = !this.shieldMode;
        else this.mp.selectPowerUp(id);
      },
    });
  }

  renderGameOver(container) {
    const isMp = !!this.mp;
    const won = isMp
      ? this.mpState?.winnerId === this.mp?.playerId
      : this.game.winner === 'player';

    container.innerHTML = `
      <div class="screen screen--gameover ${won ? 'screen--victory' : 'screen--defeat'}">
        <div class="gameover__icon">${won ? '🏆' : '💀'}</div>
        <h2 class="gameover__title">${won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
        <p class="gameover__sub">${won ? 'Вражеский флот уничтожен!' : 'Ваш флот потоплен...'}</p>
        <button class="btn btn--primary btn--large" id="btn-restart">⚓ Новая битва</button>
      </div>
    `;
    container.querySelector('#btn-restart').addEventListener('click', () => {
      sounds.click();
      if (this.mp) { this.mp.disconnect(); this.mp = null; this.mpState = null; }
      this.game.phase = PHASE.MENU;
      this.currentPhase = null;
      this.battleRefs = null;
      this.render();
    });
  }
}

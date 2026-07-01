import { GameEngine } from '../game/GameEngine.js';
import { PHASE, GAME_MODE, TOTAL_SHIPS } from '../game/constants.js';
import { MultiplayerClient } from '../multiplayer/MultiplayerClient.js';
import { getMultiplayerGameState, syncPlacementGame } from '../multiplayer/boardBuilder.js';
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
    this.mpBattleGame = null;
    this.currentPhase = null;
    this.battleRefs = null;
    this.placementGrid = null;
    this.musicBar = null;
    this.mpShotAnimating = false;
    this.disconnectModal = null;
    this.connectingOverlay = null;
    this.mpForfeit = false;

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
        this.hideConnecting();
        this.game.phase = PHASE.LOBBY;
        this.currentPhase = null;
        break;
      case 'player_joined':
        if (this.game.phase === PHASE.LOBBY && this.container.querySelector('.screen--lobby')) {
          this.updateLobbyUI();
          return;
        }
        break;
      case 'placement_update':
        if (data.you && this.mpLocalGame) {
          syncPlacementGame(this.mpLocalGame, data.you);
        } else if (data.you && !this.mpLocalGame) {
          this.mpLocalGame = new GameEngine();
          this.mpLocalGame.setupPlacement();
          syncPlacementGame(this.mpLocalGame, data.you);
        }
        if (this.game.phase === PHASE.PLACEMENT && this.placementGrid) {
          this.updateMpPlacementUI(data);
          return;
        }
        break;
      case 'game_start':
        this.game.phase = data.phase === 'battle' ? PHASE.BATTLE : PHASE.PLACEMENT;
        this.currentPhase = null;
        if (data.phase === 'battle') {
          this.mpBattleGame = null;
          this.mpState = getMultiplayerGameState(this.mp, this.mp.state?.battle || data);
        } else {
          this.mpLocalGame = null;
        }
        break;
      case 'shot_result':
        this._handleMpShotResult(data);
        return;
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
        this.mpState = getMultiplayerGameState(this.mp, this.mp.state?.battle || {});
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
        }
        return;
      case 'game_over':
        sounds[data.winnerId === this.mp.playerId ? 'win' : 'lose']();
        this.mpForfeit = data.reason === 'disconnect';
        this.game.phase = PHASE.GAME_OVER;
        this.currentPhase = null;
        this.battleRefs = null;
        this.mpState = getMultiplayerGameState(this.mp, data);
        break;
      case 'turn':
        if (!this.mpState) {
          this.mpState = getMultiplayerGameState(this.mp, data);
        } else {
          this.mpState.isYourTurn = data.currentTurn === this.mp.playerId;
          if (data.turnNumber != null) this.mpState.turnNumber = data.turnNumber;
        }
        if (data.currentTurn !== this.mp.playerId) {
          this.activePowerUp = null;
          this.shieldMode = false;
        }
        if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
          this.updateBattleUI(this.getBattleState());
          return;
        }
        break;
      case 'player_left':
        this.showToast('Соперник покинул комнату', 'info');
        if (this.game.phase === PHASE.LOBBY) {
          this.updateLobbyUI();
          return;
        }
        break;
      case 'player_disconnected':
        this.showToast('Соперник отключился — ожидание переподключения...', 'info');
        break;
      case 'reconnecting':
        this.showConnecting(`Переподключение... (попытка ${data.attempt})`);
        break;
      case 'reconnected':
        this.hideConnecting();
        this.hideDisconnectModal();
        this.showToast('Соединение восстановлено', 'success');
        break;
      case 'error':
        this.showToast(data.message || 'Ошибка', 'error');
        return;
      case 'disconnected':
        this.hideConnecting();
        if (!this.mp?.intentionalClose) {
          this.showDisconnectModal();
        }
        return;
    }
    this.render();
  }

  getBattleHint(state) {
    const { isPlayerTurn, game } = state;
    if (!isPlayerTurn) return '⏳ Ход соперника...';
    if (game.shieldMode) return '🛡 Нажмите на корабль — щит защитит его от 1 удара';
    if (game.activePowerUp === 'sonar') return '📡 Локатор: выберите центр области 3×3 на поле врага';
    if (game.activePowerUp === 'chain') return '⚡ Молния: нажмите на клетку — весь корабль там уничтожится';
    return '🎯 Ваш ход — нажмите на клетку поля противника';
  }

  getBattleState() {
    if (this.mp) {
      const s = this.mpState || getMultiplayerGameState(this.mp, {});
      if (!this.mpBattleGame) {
        this.mpBattleGame = {
          turn: 'ai', phase: 'battle', shieldMode: false, activePowerUp: null, inventory: {},
        };
      }
      const g = this.mpBattleGame;
      g.turn = s.isYourTurn ? 'player' : 'ai';
      g.phase = (s.phase === 'finished' || this.game.phase === PHASE.GAME_OVER) ? 'gameover' : 'battle';
      g.shieldMode = this.shieldMode;
      g.activePowerUp = this.activePowerUp;
      g.inventory = s.inventory || g.inventory;

      return {
        isPlayerTurn: s.isYourTurn,
        turnNumber: s.turnNumber,
        stats: s.stats,
        combo: s.combo,
        playerBoard: s.playerBoard,
        enemyBoard: s.enemyBoard,
        inventory: s.inventory,
        log: s.log,
        isMp: true,
        game: g,
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

  showToast(msg, type = 'error') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  showConnecting(msg = 'Подключение к серверу...') {
    this.hideConnecting();
    const el = document.createElement('div');
    el.className = 'connecting-overlay';
    el.innerHTML = `<div class="connecting-overlay__box"><div class="connecting-overlay__spinner"></div><p>${msg}</p><p class="connecting-overlay__hint">Сервер может просыпаться до минуты</p></div>`;
    document.body.appendChild(el);
    this.connectingOverlay = el;
  }

  hideConnecting() {
    this.connectingOverlay?.remove();
    this.connectingOverlay = null;
  }

  showDisconnectModal() {
    if (this.disconnectModal) return;
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.innerHTML = `
      <div class="modal" role="alertdialog" aria-labelledby="disconnect-title">
        <h3 id="disconnect-title">Соединение потеряно</h3>
        <p>Проверьте интернет и попробуйте переподключиться к комнате.</p>
        <div class="modal__actions">
          <button class="btn btn--primary" id="modal-reconnect">Переподключиться</button>
          <button class="btn btn--secondary" id="modal-menu">В меню</button>
        </div>
      </div>
    `;
    el.querySelector('#modal-reconnect').addEventListener('click', async () => {
      sounds.click();
      this.showConnecting('Переподключение...');
      try {
        await this.mp?.reconnect();
      } catch {
        this.hideConnecting();
        this.showToast('Не удалось переподключиться', 'error');
      }
    });
    el.querySelector('#modal-menu').addEventListener('click', () => {
      sounds.click();
      this.hideDisconnectModal();
      this.mp?.disconnect();
      this.mp = null;
      this.mpState = null;
      this.game.phase = PHASE.MENU;
      this.currentPhase = null;
      this.battleRefs = null;
      this.render();
    });
    document.body.appendChild(el);
    this.disconnectModal = el;
  }

  hideDisconnectModal() {
    this.disconnectModal?.remove();
    this.disconnectModal = null;
  }

  async _handleMpShotResult(data) {
    if (this.mpShotAnimating) {
      this.mpState = getMultiplayerGameState(this.mp, data);
      return;
    }

    const iShot = data.shooterId === this.mp?.playerId;
    const animResults = (data.results || []).filter(r => !r.sonar);
    const hasSmoke = animResults.some(r => r.smokeBlocked);

    for (const res of data.results || []) {
      if (res.sonar) sounds.sonar();
      else if (res.hit) { sounds.hit(); if (res.sunk) setTimeout(() => sounds.sunk(), 200); }
      else if (res.smokeBlocked) sounds.miss();
      else if (!res.hit) sounds.miss();
    }

    if (data.comboReward?.label) {
      sounds.combo();
      this.showComboPopup(data.comboReward.label);
    }

    if (hasSmoke) {
      this.showToast('💨 Дымовая завеса сбила прицел!', 'info');
    }

    this.mpShotAnimating = true;
    if (this.currentPhase === PHASE.BATTLE && this.battleRefs && animResults.length) {
      const wrap = iShot
        ? this.battleRefs.container.querySelector('#enemy-grid')
        : this.battleRefs.container.querySelector('#player-grid');
      const view = iShot ? 'enemy' : 'player';
      if (wrap && !animResults.every(r => r.smokeBlocked)) {
        await animateCannonVolley(wrap, animResults.filter(r => r.smokeBlocked === false), view);
      }
    }

    this.mpState = getMultiplayerGameState(this.mp, data);
    this.mpShotAnimating = false;

    if (this.currentPhase === PHASE.BATTLE && this.battleRefs) {
      this.updateBattleUI(this.getBattleState());
      return;
    }
    this.render();
  }

  getOpponentPlacement(data) {
    const players = data?.players || {};
    for (const [id, info] of Object.entries(players)) {
      if (id !== this.mp?.playerId) return info;
    }
    return null;
  }

  updateLobbyUI() {
    const lobby = this.mp?.state?.lobby;
    const players = lobby?.players || [];
    const isHost = players.length === 1 && players[0]?.id === this.mp?.playerId;

    const listEl = this.container.querySelector('#lobby-players');
    if (listEl) {
      listEl.innerHTML = `
        ${players.map(p => `<div class="lobby__player">${p.name} ${p.id === this.mp?.playerId ? '(вы)' : ''}</div>`).join('')}
        ${players.length < 2 ? '<div class="lobby__player lobby__player--waiting">Ожидание соперника...</div>' : ''}
      `;
    }

    const hintEl = this.container.querySelector('.lobby__hint');
    if (hintEl) {
      hintEl.textContent = isHost ? 'Нажмите код — скопировать ссылку' : 'Ожидание начала...';
    }

    const codeEl = this.container.querySelector('.lobby__code');
    if (codeEl && this.mp?.roomCode) codeEl.textContent = this.mp.roomCode;
  }

  updateMpPlacementUI(data) {
    const localGame = this.mpLocalGame;
    if (!localGame || !this.placementGrid) return;

    this.placementGrid._refresh();
    this.placementGrid._attachLayers?.();

    const list = this.container.querySelector('#ship-list');
    if (list) {
      const newList = renderShipList(localGame);
      newList.id = 'ship-list';
      list.replaceWith(newList);
    }

    const ship = localGame.getCurrentPlacementShip();
    const sub = this.container.querySelector('.header__sub');
    const opp = this.getOpponentPlacement(data);

    if (sub) {
      if (ship) {
        sub.textContent = `Разместите: ${ship.type.name} (${ship.type.size} кл.)`;
      } else if (opp?.placementDone) {
        sub.textContent = 'Соперник готов — ожидание старта...';
      } else {
        sub.textContent = 'Вы готовы — соперник расставляет флот...';
      }
    }

    const oppEl = this.container.querySelector('#mp-opp-status');
    if (oppEl && opp) {
      oppEl.textContent = opp.placementDone
        ? `✓ ${opp.name} готов`
        : `${opp.name} расставляет корабли (${opp.placementIndex}/${opp.totalShips})`;
    }
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
    const scrollTop = (phase === PHASE.LOBBY || phase === PHASE.MENU)
      ? 0
      : this.container.scrollTop;
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

    this.container.querySelector('.screen')?.classList.add('screen--enter');
    this.container.scrollTop = scrollTop;
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
          <p class="menu-hint menu-hint--small menu-hint--dev"${import.meta.env.PROD ? ' hidden' : ''}>Для мультиплеера локально: <code>npm run server</code></p>
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
      this.showConnecting('Создание комнаты...');
      try {
        await this.mp.connect();
        this.mp.createRoom(name);
      } catch {
        this.hideConnecting();
        this.showToast('Не удалось подключиться к серверу', 'error');
      }
    });

    container.querySelector('#btn-join').addEventListener('click', async () => {
      resumeAudio();
      sounds.click();
      const name = container.querySelector('#player-name').value.trim() || 'Капитан';
      const code = container.querySelector('#room-code').value.trim();
      if (!code) return this.showToast('Введите код комнаты', 'error');
      localStorage.setItem('ss_name', name);
      this.playerName = name;
      this.mode = GAME_MODE.MULTIPLAYER;
      this.setupMultiplayer();
      this.showConnecting('Вход в комнату...');
      try {
        await this.mp.connect();
        this.mp.joinRoom(code, name);
      } catch {
        this.hideConnecting();
        this.showToast('Не удалось подключиться к серверу', 'error');
      }
    });

    const roomFromUrl = new URLSearchParams(location.search).get('room');
    if (roomFromUrl) {
      const input = container.querySelector('#room-code');
      if (input) input.value = roomFromUrl.toUpperCase();
      container.querySelector('#online-panel').hidden = false;
      container.querySelector('#solo-panel').hidden = true;
    }
  }

  renderLobby(container) {
    const lobby = this.mp?.state?.lobby;
    const players = lobby?.players || [];
    const isHost = players.length === 1 && players[0]?.id === this.mp?.playerId;

    container.innerHTML = `
      <div class="screen screen--lobby">
        <div class="lobby__code-wrap">
          <h2 class="lobby__title">Комната</h2>
          <div class="lobby__code" id="lobby-code">${this.mp?.roomCode || '----'}</div>
          <p class="lobby__hint">${isHost ? 'Нажмите код — скопировать ссылку' : 'Ожидание начала...'}</p>
        </div>
        <div class="lobby__players" id="lobby-players">
          ${players.map(p => `<div class="lobby__player">${p.name} ${p.id === this.mp?.playerId ? '(вы)' : ''}</div>`).join('')}
          ${players.length < 2 ? '<div class="lobby__player lobby__player--waiting">Ожидание соперника...</div>' : ''}
        </div>
        <button class="btn btn--secondary" id="btn-leave">← Назад</button>
      </div>
    `;

    const codeEl = container.querySelector('#lobby-code');
    codeEl?.addEventListener('click', () => {
      const code = this.mp?.roomCode;
      if (!code) return;
      const link = `${location.origin}${location.pathname}?room=${code}`;
      navigator.clipboard?.writeText(link).then(() => this.showToast('Ссылка скопирована!', 'success'));
    });

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
          <p class="mp-opp-status" id="mp-opp-status"></p>
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
    });
    container.querySelector('#placement-grid').appendChild(this.placementGrid);
    this.placementGrid._attachLayers?.();
    const list = renderShipList(localGame);
    list.id = 'ship-list';
    container.querySelector('#ship-list').replaceWith(list);

    container.querySelector('#btn-rotate').addEventListener('click', () => {
      sounds.click();
      if (localGame) {
        localGame.placementOrientation = localGame.placementOrientation === 'h' ? 'v' : 'h';
      }
      this.mp.rotate();
    });
    container.querySelector('#btn-auto').addEventListener('click', () => {
      sounds.click();
      this.mp.autoPlace();
    });

    this.updateMpPlacementUI({ players: {} });
  }

  buildBattleScreen(container, state, handlers) {
    const { isPlayerTurn, turnNumber, stats, combo, playerBoard, enemyBoard, log, isMp, game } = state;
    const enemyRemaining = enemyBoard.getRemainingShips().length;

    container.innerHTML = `
      <div class="screen screen--battle">
        <header class="hud hud--glass">
          <div class="hud__turn ${isPlayerTurn ? 'hud__turn--player' : 'hud__turn--enemy'}" aria-live="polite">
            ${this.getBattleHint(state)}
          </div>
          <div class="hud__row">
            <div class="hud__turn-num">Ход ${turnNumber}${isMp ? ' · PvP' : ''}</div>
          </div>
          <div class="hud__enemy-info">🎯 У соперника: <strong>${enemyRemaining}</strong> из ${TOTAL_SHIPS} кораблей</div>
        </header>
        <div class="battle-tabs" role="tablist" aria-label="Поля боя">
          <button type="button" class="battle-tabs__btn battle-tabs__btn--active" role="tab" aria-selected="true" data-tab="enemy">🎯 Враг</button>
          <button type="button" class="battle-tabs__btn" role="tab" aria-selected="false" data-tab="player">⚓ Мой флот</button>
        </div>
        <div class="boards boards--tabs">
          <div class="board-panel board-panel--tab-active" data-board="enemy">
            <h3 class="board-panel__title">Поле противника</h3>
            <div id="enemy-grid" class="grid-wrap"></div>
            <div id="enemy-fleet"></div>
          </div>
          <div class="board-panel board-panel--player" data-board="player">
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

    container.querySelectorAll('.battle-tabs__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        container.querySelectorAll('.battle-tabs__btn').forEach((b) => {
          const active = b.dataset.tab === tab;
          b.classList.toggle('battle-tabs__btn--active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        container.querySelectorAll('[data-board]').forEach((panel) => {
          panel.classList.toggle('board-panel--tab-active', panel.dataset.board === tab);
        });
      });
    });

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
    turnEl.textContent = this.getBattleHint(state);

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
    this.buildBattleScreen(container, this.getBattleState(), {
      onEnemy: (r, c) => {
        const live = this.getBattleState();
        if (!live.isPlayerTurn || this.shieldMode) return;
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
        if (id === 'smoke') {
          this.mp.useSmoke();
        } else if (id === 'shield') {
          this.shieldMode = !this.shieldMode;
          this.activePowerUp = this.shieldMode ? 'shield' : null;
          this.mp.selectPowerUp('shield');
          this.updateBattleUI(this.getBattleState());
        } else {
          this.mp.selectPowerUp(id);
          this.activePowerUp = this.activePowerUp === id ? null : id;
          this.shieldMode = false;
          this.updateBattleUI(this.getBattleState());
        }
      },
    });
  }

  renderGameOver(container) {
    const isMp = !!this.mp;
    const won = isMp
      ? this.mpState?.winnerId === this.mp?.playerId
      : this.game.winner === 'player';
    const forfeit = isMp && this.mpForfeit;

    container.innerHTML = `
      <div class="screen screen--gameover ${won ? 'screen--victory' : 'screen--defeat'}">
        <div class="gameover__icon">${won ? '🏆' : '💀'}</div>
        <h2 class="gameover__title">${won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
        <p class="gameover__sub">${won
    ? (forfeit ? 'Соперник отключился — победа засчитана!' : 'Вражеский флот уничтожен!')
    : 'Ваш флот потоплен...'}</p>
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

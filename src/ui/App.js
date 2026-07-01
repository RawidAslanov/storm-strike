import { GameEngine } from '../game/GameEngine.js';
import { PHASE, GAME_MODE } from '../game/constants.js';
import { MultiplayerClient } from '../multiplayer/MultiplayerClient.js';
import { getMultiplayerGameState } from '../multiplayer/boardBuilder.js';
import {
  renderGrid, renderPlacementGrid, renderPowerUps, renderShipList,
  renderLog, renderStats, animateCell, showStormOverlay,
  renderDifficultyButtons,
} from './renderer.js';
import { sounds, resumeAudio } from './sounds.js';

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

    this.game.on((event, data) => this.handleEvent(event, data));
    this.render();
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
        animateCell(data.r, data.c, 'enemy', 'cell--lightning');
        break;
      case 'gameover':
        sounds[data === 'player' ? 'win' : 'lose']();
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
        break;
      case 'shot_result':
        for (const res of data.results || []) {
          if (res.sonar) sounds.sonar();
          else if (res.hit) { sounds.hit(); if (res.sunk) setTimeout(() => sounds.sunk(), 200); }
          else if (!res.smokeBlocked) sounds.miss();
        }
        this.mpState = getMultiplayerGameState(this.mp, data);
        break;
      case 'state_sync':
        this.mpState = getMultiplayerGameState(this.mp, data);
        break;
      case 'storm':
        sounds.storm();
        showStormOverlay(data);
        break;
      case 'game_over':
        sounds[data.winnerId === this.mp.playerId ? 'win' : 'lose']();
        this.game.phase = PHASE.GAME_OVER;
        this.mpState = getMultiplayerGameState(this.mp, data);
        break;
      case 'turn':
        if (this.mpState) this.mpState.isYourTurn = data.currentTurn === this.mp.playerId;
        break;
      case 'error':
        this.showToast(data.message || 'Ошибка');
        break;
      case 'disconnected':
        this.showToast('Соединение потеряно');
        break;
    }
    this.render();
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
    this.root.innerHTML = '';
    this.appendBackground();

    const container = document.createElement('div');
    container.className = 'app-container';
    this.root.appendChild(container);

    const phase = this.mp ? (this.game.phase) : this.game.phase;

    switch (phase) {
      case PHASE.MENU: this.renderMenu(container); break;
      case PHASE.LOBBY: this.renderLobby(container); break;
      case PHASE.PLACEMENT:
        this.mp ? this.renderMpPlacement(container) : this.renderPlacement(container);
        break;
      case PHASE.BATTLE:
        this.mp ? this.renderMpBattle(container) : this.renderBattle(container);
        break;
      case PHASE.GAME_OVER: this.renderGameOver(container); break;
    }
  }

  appendBackground() {
    const ocean = document.createElement('div');
    ocean.className = 'ocean-bg';
    ocean.innerHTML = '<div class="waves"></div><div class="waves waves--2"></div>';
    this.root.appendChild(ocean);

    const fxLayer = document.createElement('div');
    fxLayer.id = 'fx-layer';
    fxLayer.className = 'fx-layer';
    this.root.appendChild(fxLayer);

    const stormOverlay = document.createElement('div');
    stormOverlay.id = 'storm-overlay';
    stormOverlay.className = 'storm-overlay';
    this.root.appendChild(stormOverlay);
  }

  renderMenu(container) {
    container.innerHTML = `
      <div class="screen screen--menu">
        <div class="logo">
          <div class="logo__icon">⚓</div>
          <h1 class="logo__title">STORM STRIKE</h1>
          <p class="logo__subtitle">Морской Бой Нового Поколения</p>
        </div>
        <div class="menu-features">
          <div class="feature"><span>⚡</span> Комбо-атаки</div>
          <div class="feature"><span>🌩</span> Штормовые события</div>
          <div class="feature"><span>👥</span> Онлайн PvP</div>
          <div class="feature"><span>🔱</span> 5 типов кораблей</div>
        </div>

        <div class="menu-modes">
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
          <p class="menu-hint menu-hint--small">Для мультиплеера запустите сервер: <code>npm run server</code></p>
        </div>
      </div>
    `;

    container.querySelector('#btn-solo').addEventListener('click', () => {
      sounds.click();
      container.querySelector('#solo-panel').hidden = false;
      container.querySelector('#online-panel').hidden = true;
      const diffContainer = container.querySelector('#diff-btns');
      diffContainer.innerHTML = '';
      diffContainer.appendChild(renderDifficultyButtons((diff) => {
        resumeAudio();
        sounds.click();
        this.mp = null;
        this.mode = GAME_MODE.SINGLE;
        this.game.startGame(diff);
      }));
    });

    container.querySelector('#btn-online').addEventListener('click', () => {
      sounds.click();
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
        this.showToast('Не удалось подключиться к серверу. Запустите: npm run server');
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
        <header class="header">
          <h2>Расстановка флота</h2>
          <p class="header__sub">${ship ? `Разместите: ${ship.type.icon} ${ship.type.name}` : 'Готово!'}</p>
        </header>
        <div id="placement-grid" class="grid-wrap"></div>
        <div id="ship-list"></div>
        <div class="placement-actions">
          <button class="btn btn--secondary" id="btn-rotate">🔄 Повернуть</button>
          <button class="btn btn--primary" id="btn-auto">⚡ Авто</button>
        </div>
      </div>
    `;

    container.querySelector('#placement-grid').appendChild(
      renderPlacementGrid(this.game, (r, c) => {
        resumeAudio(); sounds.click();
        this.game.placeShipAt(r, c);
      })
    );
    container.querySelector('#ship-list').appendChild(renderShipList(this.game));
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
        <header class="header">
          <h2>Расстановка флота</h2>
          <p class="header__sub">${ship ? `Разместите: ${ship.type.icon} ${ship.type.name}` : 'Ожидание соперника...'}</p>
        </header>
        <div id="placement-grid" class="grid-wrap"></div>
        <div id="ship-list"></div>
        <div class="placement-actions">
          <button class="btn btn--secondary" id="btn-rotate">🔄 Повернуть</button>
          <button class="btn btn--primary" id="btn-auto">⚡ Авто</button>
        </div>
      </div>
    `;

    container.querySelector('#placement-grid').appendChild(
      renderPlacementGrid(localGame, (r, c) => {
        resumeAudio(); sounds.click();
        this.mp.placeShip(r, c);
        localGame.placeShipAt(r, c, { skipBattle: true });
      })
    );
    container.querySelector('#ship-list')?.appendChild(renderShipList(localGame));
    container.querySelector('#btn-rotate').addEventListener('click', () => {
      sounds.click();
      localGame.rotatePlacement();
      this.mp.rotate();
    });
    container.querySelector('#btn-auto').addEventListener('click', () => {
      sounds.click();
      this.mp.autoPlace();
    });
  }

  renderBattle(container) {
    const g = this.game;
    const isPlayerTurn = g.turn === 'player';
    container.innerHTML = this.battleHTML(isPlayerTurn, g.energy, g.turnNumber, g.stats, g.combo);
    this.wireBattle(container, g, {
      onEnemy: (r, c) => {
        resumeAudio();
        if (g.shieldMode) return;
        const results = g.playerFire(r, c);
        if (!results) return;
        this.animateResults(results);
      },
      onPlayer: (r, c) => {
        if (g.shieldMode) { resumeAudio(); sounds.powerup(); g.playerShield(r, c); }
      },
      onPowerUp: (id) => {
        resumeAudio(); sounds.powerup();
        if (id === 'smoke') g.useSmoke();
        else g.selectPowerUp(id);
      },
      playerBoard: g.playerBoard,
      enemyBoard: g.enemyBoard,
      game: g,
      log: g.log,
    });
  }

  renderMpBattle(container) {
    const s = this.mpState || getMultiplayerGameState(this.mp, {});
    const isPlayerTurn = s.isYourTurn;
    container.innerHTML = this.battleHTML(isPlayerTurn, s.energy, s.turnNumber, s.stats, s.combo, true);

    const fakeGame = { turn: isPlayerTurn ? 'player' : 'ai', phase: 'battle', shieldMode: this.shieldMode, activePowerUp: this.activePowerUp };

    this.wireBattle(container, fakeGame, {
      onEnemy: (r, c) => {
        if (!isPlayerTurn || this.shieldMode) return;
        resumeAudio();
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
      playerBoard: s.playerBoard,
      enemyBoard: s.enemyBoard,
      game: { ...fakeGame, inventory: s.inventory, shieldMode: this.shieldMode },
      log: s.log,
      inventory: s.inventory,
    });
  }

  battleHTML(isPlayerTurn, energy, turnNumber, stats, combo, isMp = false) {
    return `
      <div class="screen screen--battle">
        <header class="hud">
          <div class="hud__turn ${isPlayerTurn ? 'hud__turn--player' : 'hud__turn--enemy'}">
            ${isPlayerTurn ? '🎯 Ваш ход' : '⏳ Ход соперника'}
          </div>
          <div class="hud__energy">
            <div class="energy-bar">
              <div class="energy-bar__fill" style="width:${(energy / 10) * 100}%"></div>
            </div>
            <span class="energy-bar__label">⚡ ${energy}/10</span>
          </div>
          <div class="hud__turn-num">Ход ${turnNumber}${isMp ? ' • PvP' : ''}</div>
        </header>
        <div class="boards">
          <div class="board-panel">
            <h3 class="board-panel__title">🎯 Противник</h3>
            <div id="enemy-grid" class="grid-wrap"></div>
          </div>
          <div class="board-panel board-panel--player">
            <h3 class="board-panel__title">🛡 Ваш флот</h3>
            <div id="player-grid" class="grid-wrap"></div>
          </div>
        </div>
        <div id="powerups"></div>
        <div id="battle-log"></div>
        <div class="stats">
          <div class="stat"><span class="stat__val">${stats.hits}</span><span class="stat__lbl">Попадания</span></div>
          <div class="stat"><span class="stat__val">${stats.shipsSunk}</span><span class="stat__lbl">Потоплено</span></div>
          <div class="stat"><span class="stat__val">×${combo}</span><span class="stat__lbl">Комбо</span></div>
        </div>
      </div>
    `;
  }

  wireBattle(container, game, { onEnemy, onPlayer, onPowerUp, playerBoard, enemyBoard, log, inventory }) {
    container.querySelector('#enemy-grid').appendChild(
      renderGrid(enemyBoard, 'enemy', game, onEnemy)
    );
    container.querySelector('#player-grid').appendChild(
      renderGrid(playerBoard, 'player', game, onPlayer)
    );
    const puGame = { inventory: inventory || game.inventory, activePowerUp: game.activePowerUp, shieldMode: game.shieldMode };
    container.querySelector('#powerups').appendChild(renderPowerUps(puGame, onPowerUp));
    container.querySelector('#battle-log').appendChild(renderLog(log));
  }

  animateResults(results) {
    for (const res of results) {
      if (res.sonar) animateCell(res.r, res.c, 'enemy', 'cell--sonar');
      else if (res.hit) animateCell(res.r, res.c, 'enemy', res.sunk ? 'cell--sunk-anim' : 'cell--hit-anim');
      else animateCell(res.r, res.c, 'enemy', 'cell--miss-anim');
    }
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
      this.render();
    });
  }
}

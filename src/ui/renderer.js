import { GRID_SIZE, CELL, POWER_UPS, SHIP_TYPES, DIFFICULTY, FLEET_COMPOSITION, TOTAL_SHIPS } from '../game/constants.js';
import { shipIconSvg } from './shipSprites.js';
import { attachShipLayers, refreshShipLayers } from './shipLayer.js';

function findShipAt(board, r, c) {
  return board.ships.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
}

function buildShipMap(board) {
  const map = new Map();
  for (const ship of board.ships) {
    for (const [r, c] of ship.cells) map.set(`${r},${c}`, ship);
  }
  return map;
}

export function createCellState(board, r, c, view = 'enemy', shipMap) {
  const shot = board.shots[r][c];
  const isPlayer = view === 'player';
  const fogged = view === 'enemy' && board.isFogged(r, c);
  const revealed = board.isRevealed(r, c);

  let cls = 'cell';
  let content = '';
  let shipType = null;
  let segment = null;

  if (fogged) {
    cls += ' cell--fog';
    return { cls, content, r, c, fogged: true, shot, shipType, segment };
  }

  if (isPlayer) {
    const ship = shipMap?.get(`${r},${c}`) || findShipAt(board, r, c);
    if (ship && !ship.sunk) {
      cls += ' cell--under-ship';
      shipType = ship.typeId;
      if (board.isShipShielded(ship.id)) cls += ' cell--shielded';
      if (shot === CELL.HIT) cls += ' cell--ship-hit';
      else if (shot === CELL.MISS) cls += ' cell--shield-deflect';
      return { cls, content: '', r, c, shot, shipType, segment, fogged: false };
    }
  } else {
    const sonarMark = board.getSonarMark?.(r, c);
    if (sonarMark === 'zone-ship-center') {
      cls += ' cell--sonar-zone-ship cell--sonar-zone-center';
      content = '<span class="sonar-zone-label">🚢</span>';
    } else if (sonarMark === 'zone-ship') {
      cls += ' cell--sonar-zone-ship';
    } else if (sonarMark === 'zone-clear-center') {
      cls += ' cell--sonar-zone-clear cell--sonar-zone-center';
      content = '<span class="sonar-zone-label sonar-zone-label--empty">○</span>';
    } else if (sonarMark === 'zone-clear') {
      cls += ' cell--sonar-zone-clear';
    } else if (revealed && shot === CELL.EMPTY) {
      cls += ' cell--scanned';
    }
  }

  switch (shot) {
    case CELL.HIT:
      cls += ' cell--hit';
      if (!isPlayer) {
        cls += ' cell--enemy-hit';
        content = '<span class="hit-marker" aria-hidden="true"></span>';
      }
      break;
    case CELL.MISS:
      cls += ' cell--miss';
      if (!isPlayer) content = '<span class="miss-marker" aria-hidden="true"></span>';
      break;
    case CELL.SUNK:
      cls += ' cell--sunk';
      if (!isPlayer) {
        cls += ' cell--enemy-sunk';
        content = '<span class="sunk-marker" aria-hidden="true"></span>';
      }
      break;
    default:
      if (!(view === 'enemy' && board.getSonarMark?.(r, c))) cls += ' cell--water';
  }

  return { cls, content, r, c, shot, shipType, segment, fogged: false };
}

function applyCellState(cell, state) {
  cell.className = state.cls;
  cell.innerHTML = state.content;
  cell.dataset.ship = state.shipType || '';
}

export function renderGrid(board, view, game, onCellClick) {
  const grid = document.createElement('div');
  grid.className = `grid grid--${view}`;
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', view === 'enemy' ? 'Поле противника' : 'Ваше поле');

  const shipMap = view === 'player' ? buildShipMap(board) : null;
  const cells = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const state = createCellState(board, r, c, view, shipMap);
      const cell = document.createElement('button');
      cell.className = state.cls;
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.innerHTML = state.content;
      cell.type = 'button';
      cells.push(cell);

      if (view === 'enemy' && game.phase === 'battle') {
        cell.addEventListener('click', () => {
          if (game.turn === 'player') onCellClick(r, c);
        });
      }
      if (view === 'player' && game.phase === 'battle') {
        cell.addEventListener('click', () => onCellClick(r, c));
      }

      grid.appendChild(cell);
    }
  }

  grid._cells = cells;
  grid._shipMap = shipMap;
  return grid;
}

/** Вызывать после appendChild сетки в .grid-wrap */
export function initGridLayers(gridWrap, board, view) {
  gridWrap.querySelector('.ship-layer')?.remove();
  gridWrap.querySelector('.effect-layer')?.remove();
  attachShipLayers(gridWrap, board, view);
}

/** Обновляет только изменившиеся клетки — без пересоздания сетки */
export function updateGrid(grid, board, view, game) {
  if (!grid?._cells) return renderGrid(board, view, game, () => {});

  const clickable = view === 'enemy' && game.turn === 'player' && game.phase === 'battle';

  const shipMap = view === 'player' ? buildShipMap(board) : grid._shipMap;
  grid._shipMap = shipMap;

  for (const cell of grid._cells) {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    const state = createCellState(board, r, c, view, shipMap);
    if (cell.className !== state.cls || cell.innerHTML !== state.content) {
      applyCellState(cell, state);
    }
  }

  const shieldClick = view === 'player' && game.shieldMode && game.phase === 'battle';
  const sonarClick = view === 'enemy' && game.activePowerUp === 'sonar' && game.phase === 'battle';
  for (const cell of grid._cells) {
    if (view === 'enemy') {
      const canFire = clickable || sonarClick;
      cell.style.pointerEvents = canFire ? '' : 'none';
      cell.style.cursor = canFire ? 'pointer' : 'default';
    } else if (view === 'player') {
      cell.style.pointerEvents = shieldClick ? '' : 'none';
      cell.style.cursor = shieldClick ? 'pointer' : 'default';
      const r = +cell.dataset.r;
      const c = +cell.dataset.c;
      const onShip = shipMap?.has(`${r},${c}`);
      const ship = shipMap?.get(`${r},${c}`);
      const canShield = shieldClick && onShip && ship && !board.isShipShielded(ship.id);
      cell.classList.toggle('cell--shield-target', canShield);
    }
  }

  const wrap = grid.parentElement;
  if (wrap?.classList.contains('grid-wrap')) {
    wrap.classList.toggle('grid-wrap--shield-mode', view === 'player' && game.shieldMode);
    refreshShipLayers(wrap, board, view);
  }
}

export function renderPlacementGrid(game, onCellClick) {
  const grid = document.createElement('div');
  grid.className = 'grid grid--placement';

  const shipMap = buildShipMap(game.playerBoard);
  const cellEls = new Array(GRID_SIZE * GRID_SIZE);
  let previewEls = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = document.createElement('button');
      const state = createCellState(game.playerBoard, r, c, 'player', shipMap);
      cell.className = state.cls || 'cell cell--water';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.type = 'button';
      if (state.content) cell.innerHTML = state.content;
      cellEls[r * GRID_SIZE + c] = cell;
      cell.addEventListener('click', () => onCellClick(r, c));
      grid.appendChild(cell);
    }
  }

  const clearPreview = () => {
    for (const el of previewEls) el.classList.remove('cell--preview', 'cell--invalid');
    previewEls = [];
  };

  grid.addEventListener('mouseleave', clearPreview);

  for (const cell of cellEls) {
    cell.addEventListener('mouseenter', () => {
      const ship = game.getCurrentPlacementShip();
      if (!ship) return;
      clearPreview();
      const r = +cell.dataset.r;
      const c = +cell.dataset.c;
      const cells = game.getPlacementPreview(r, c);
      if (!cells.length) return;
      const canPlace = cells.every(([pr, pc]) => {
        const el = cellEls[pr * GRID_SIZE + pc];
        return el && !el.classList.contains('cell--under-ship');
      });
      for (const [pr, pc] of cells) {
        const el = cellEls[pr * GRID_SIZE + pc];
        if (el) {
          el.classList.add(canPlace ? 'cell--preview' : 'cell--invalid');
          previewEls.push(el);
        }
      }
    });
  }

  grid._refresh = () => {
    const map = buildShipMap(game.playerBoard);
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const state = createCellState(game.playerBoard, r, c, 'player', map);
        applyCellState(cellEls[r * GRID_SIZE + c], state);
      }
    }
    const wrap = grid.parentElement;
    if (wrap?.classList.contains('grid-wrap')) refreshShipLayers(wrap, game.playerBoard, 'player');
  };

  grid._attachLayers = () => {
    const wrap = grid.parentElement;
    if (wrap?.classList.contains('grid-wrap')) {
      if (!wrap._shipLayer) initGridLayers(wrap, game.playerBoard, 'player');
      else refreshShipLayers(wrap, game.playerBoard, 'player');
    }
  };

  return grid;
}

export function renderFleetPanel(board, label = 'Флот') {
  const panel = document.createElement('div');
  panel.className = 'fleet-panel';

  const remaining = board.getRemainingShips().length;
  const sunk = board.ships.filter(s => s.sunk).length;

  panel.innerHTML = `
    <div class="fleet-panel__header">
      <span class="fleet-panel__title">${label}</span>
      <span class="fleet-panel__count">${remaining} / ${TOTAL_SHIPS} в строю</span>
    </div>
    <div class="fleet-panel__ships"></div>
  `;

  const shipsEl = panel.querySelector('.fleet-panel__ships');

  for (const entry of FLEET_COMPOSITION) {
    const type = SHIP_TYPES[entry.typeId];
    const typeShips = board.ships.filter(s => s.typeId === entry.typeId);
    const alive = typeShips.filter(s => !s.sunk).length;
    const total = entry.count;

    const card = document.createElement('div');
    card.className = `fleet-card fleet-card--${entry.typeId}${alive === 0 ? ' fleet-card--sunk' : ''}`;
    card.innerHTML = `
      <div class="fleet-card__icon">${shipIconSvg(entry.typeId, 40)}</div>
      <div class="fleet-card__info">
        <span class="fleet-card__name">${type.name}</span>
        <span class="fleet-card__size">${type.size} кл.</span>
      </div>
      <div class="fleet-card__status">
        <span class="fleet-card__alive">${alive}</span><span class="fleet-card__sep">/</span><span class="fleet-card__total">${total}</span>
      </div>
    `;
    card.title = `${type.desc}`;
    shipsEl.appendChild(card);
  }

  panel._update = (b) => {
    const rem = b.getRemainingShips().length;
    panel.querySelector('.fleet-panel__count').textContent = `${rem} / ${TOTAL_SHIPS} в строю`;
    const cards = panel.querySelectorAll('.fleet-card');
    FLEET_COMPOSITION.forEach((entry, i) => {
      const typeShips = b.ships.filter(s => s.typeId === entry.typeId);
      const alive = typeShips.filter(s => !s.sunk).length;
      const card = cards[i];
      card.querySelector('.fleet-card__alive').textContent = alive;
      card.classList.toggle('fleet-card--sunk', alive === 0);
    });
  };

  return panel;
}

export function renderFleetGuide() {
  const guide = document.createElement('div');
  guide.className = 'fleet-guide';
  guide.innerHTML = `<p class="fleet-guide__title">Состав флота — ${TOTAL_SHIPS} кораблей</p>`;

  const grid = document.createElement('div');
  grid.className = 'fleet-guide__grid';

  for (const entry of FLEET_COMPOSITION) {
    const type = SHIP_TYPES[entry.typeId];
    const card = document.createElement('div');
    card.className = `fleet-guide__item fleet-guide__item--${entry.typeId}`;
    card.innerHTML = `
      <div class="fleet-guide__icon">${shipIconSvg(entry.typeId, 56)}</div>
      <div class="fleet-guide__meta">
        <strong>${entry.label}</strong>
        <span>${type.size} клеток · ${type.desc}</span>
      </div>
    `;
    grid.appendChild(card);
  }

  guide.appendChild(grid);
  return guide;
}

export function renderShipList(game) {
  const list = document.createElement('div');
  list.className = 'ship-list';

  const placed = game.placementIndex;
  const total = game.placementShips.length;

  list.innerHTML = `<div class="ship-list__progress">Размещено: <strong>${placed}</strong> / ${total}</div>`;

  const counts = {};
  for (const ship of game.placementShips) {
    counts[ship.typeId] = (counts[ship.typeId] || 0) + 1;
  }

  const placedCounts = {};
  for (let i = 0; i < placed; i++) {
    const id = game.placementShips[i].typeId;
    placedCounts[id] = (placedCounts[id] || 0) + 1;
  }

  for (const entry of FLEET_COMPOSITION) {
    const type = SHIP_TYPES[entry.typeId];
    const done = placedCounts[entry.typeId] || 0;
    const el = document.createElement('div');
    el.className = `ship-list__item ship-list__item--${entry.typeId}${done >= entry.count ? ' ship-list__item--done' : ''}`;
    el.innerHTML = `
      <span class="ship-list__icon">${shipIconSvg(entry.typeId, 32)}</span>
      <span class="ship-list__name">${type.name}</span>
      <span class="ship-list__count">${done}/${entry.count}</span>
      <span class="ship-list__size">${type.size} кл.</span>
    `;
    list.appendChild(el);
  }

  const current = game.getCurrentPlacementShip();
  if (current) {
    const hint = document.createElement('div');
    hint.className = 'ship-list__current';
    hint.innerHTML = `Сейчас: <strong>${current.type.name}</strong> (${current.type.size} клеток)`;
    list.appendChild(hint);
  } else if (placed >= total) {
    list.innerHTML += '<span class="ship-list__done">✓ Все 7 кораблей расставлены</span>';
  }

  return list;
}

export function renderPowerUps(game, onSelect) {
  const container = document.createElement('div');
  container.className = 'powerups';
  const inventory = game.inventory || {};

  for (const pu of Object.values(POWER_UPS)) {
    const count = inventory[pu.id] || 0;
    const active = game.activePowerUp === pu.id || (pu.id === 'shield' && game.shieldMode);
    const btn = document.createElement('button');
    btn.className = `powerup-btn${active ? ' powerup-btn--active' : ''}${count === 0 ? ' powerup-btn--empty' : ''}`;
    btn.dataset.pu = pu.id;
    btn.innerHTML = `
      <span class="powerup-btn__icon">${pu.icon}</span>
      <span class="powerup-btn__name">${pu.name}</span>
      <span class="powerup-btn__count">${count}</span>
    `;
    btn.title = pu.desc;
    btn.disabled = count === 0 && !active;
    btn.addEventListener('click', () => onSelect(pu.id));
    container.appendChild(btn);
  }
  return container;
}

export function updatePowerUps(container, game) {
  if (!container) return;
  const inventory = game.inventory || {};
  for (const btn of container.querySelectorAll('.powerup-btn')) {
    const id = btn.dataset.pu;
    const count = inventory[id] || 0;
    const active = game.activePowerUp === id || (id === 'shield' && game.shieldMode);
    btn.className = `powerup-btn${active ? ' powerup-btn--active' : ''}${count === 0 ? ' powerup-btn--empty' : ''}`;
    btn.querySelector('.powerup-btn__count').textContent = count;
    btn.disabled = count === 0 && !active;
  }
}

export function renderLog(log) {
  const el = document.createElement('div');
  el.className = 'battle-log';
  for (const entry of log.slice(0, 6)) {
    const line = document.createElement('div');
    line.className = 'battle-log__line';
    line.textContent = entry.msg;
    el.appendChild(line);
  }
  return el;
}

export function updateLog(el, log) {
  if (!el) return;
  const lines = log.slice(0, 6);
  el.innerHTML = '';
  for (const entry of lines) {
    const line = document.createElement('div');
    line.className = 'battle-log__line';
    line.textContent = entry.msg;
    el.appendChild(line);
  }
}

export function spawnExplosion(x, y, type = 'hit') {
  const el = document.createElement('div');
  el.className = `fx fx--${type}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.getElementById('fx-layer')?.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

export function showStormOverlay(event) {
  const overlay = document.getElementById('storm-overlay');
  if (!overlay) return;
  overlay.className = `storm-overlay storm-overlay--${event.id} storm-overlay--show`;
  overlay.innerHTML = `<div class="storm-overlay__content">
    <span class="storm-overlay__icon">${event.icon}</span>
    <span class="storm-overlay__name">${event.name}</span>
    <span class="storm-overlay__desc">${event.desc}</span>
  </div>`;
  setTimeout(() => overlay.classList.remove('storm-overlay--show'), 2500);
}

export function animateCell(r, c, view, animClass) {
  const grid = document.querySelector(`.grid--${view}`);
  if (!grid) return;
  const cell = grid.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  if (cell) {
    cell.classList.add(animClass);
    setTimeout(() => cell.classList.remove(animClass), 800);
    const wrap = grid.parentElement;
    if (wrap) {
      let fx = wrap.querySelector(`.cell-effect[data-r="${r}"][data-c="${c}"]`);
      if (!fx && animClass.includes('hit')) {
        fx = document.createElement('div');
        fx.className = 'cell-effect cell-effect--hit cell-effect--burst';
        fx.dataset.r = r;
        fx.dataset.c = c;
        fx.style.setProperty('--r', r);
        fx.style.setProperty('--c', c);
        wrap.querySelector('.effect-layer')?.appendChild(fx);
        setTimeout(() => fx?.remove(), 1000);
      }
    }
    const rect = cell.getBoundingClientRect();
    spawnExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, animClass.includes('hit') ? 'hit' : 'miss');
  }
}

export function renderDifficultyButtons(onSelect) {
  const container = document.createElement('div');
  container.className = 'difficulty-btns';
  for (const [key, diff] of Object.entries(DIFFICULTY)) {
    const btn = document.createElement('button');
    btn.className = 'btn btn--diff';
    btn.textContent = diff.name;
    btn.addEventListener('click', () => onSelect(key));
    container.appendChild(btn);
  }
  return container;
}

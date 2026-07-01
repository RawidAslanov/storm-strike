import { GRID_SIZE, CELL, POWER_UPS, SHIP_TYPES, DIFFICULTY } from '../game/constants.js';

export function createCellState(board, r, c, view = 'enemy', game) {
  const shot = board.shots[r][c];
  const isPlayer = view === 'player';
  const fogged = view === 'enemy' && board.isFogged(r, c);
  const revealed = board.isRevealed(r, c);

  let cls = 'cell';
  let content = '';

  if (fogged) {
    cls += ' cell--fog';
    return { cls, content, r, c, fogged: true };
  }

  if (isPlayer) {
    const ship = board.ships.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
    if (ship && !ship.sunk && shot !== CELL.HIT && shot !== CELL.SUNK) {
      cls += ' cell--ship';
      if (board.isShielded(r, c)) cls += ' cell--shielded';
      content = ship.type.icon;
    }
  } else if (revealed && shot === CELL.EMPTY) {
    cls += ' cell--scanned';
  }

  switch (shot) {
    case CELL.HIT:
      cls += ' cell--hit';
      content = '💥';
      break;
    case CELL.MISS:
      cls += ' cell--miss';
      content = '○';
      break;
    case CELL.SUNK:
      cls += ' cell--sunk';
      content = '☠';
      break;
    default:
      cls += ' cell--water';
  }

  return { cls, content, r, c, shot };
}

export function renderGrid(board, view, game, onCellClick) {
  const grid = document.createElement('div');
  grid.className = `grid grid--${view}`;
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', view === 'enemy' ? 'Поле противника' : 'Ваше поле');

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const state = createCellState(board, r, c, view, game);
      const cell = document.createElement('button');
      cell.className = state.cls;
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.textContent = state.content;
      cell.type = 'button';

      if (view === 'enemy' && game.turn === 'player' && game.phase === 'battle') {
        cell.addEventListener('click', () => onCellClick(r, c));
      }
      if (view === 'player' && game.shieldMode) {
        cell.addEventListener('click', () => onCellClick(r, c));
      }

      grid.appendChild(cell);
    }
  }
  return grid;
}

export function renderPlacementGrid(game, onCellClick) {
  const grid = document.createElement('div');
  grid.className = 'grid grid--placement';

  const ship = game.getCurrentPlacementShip();
  const previewCells = new Set();

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = document.createElement('button');
      cell.className = 'cell cell--water';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.type = 'button';

      const placed = game.playerBoard.ships.some(s =>
        s.cells.some(([sr, sc]) => sr === r && sc === c)
      );
      if (placed) {
        cell.className = 'cell cell--ship';
        const s = game.playerBoard.ships.find(s =>
          s.cells.some(([sr, sc]) => sr === r && sc === c)
        );
        cell.textContent = s?.type?.icon || '🚢';
      }

      cell.addEventListener('mouseenter', () => {
        if (!ship) return;
        const cells = game.getPlacementPreview(r, c);
        const valid = cells.length > 0;
        grid.querySelectorAll('.cell--preview').forEach(el => {
          el.classList.remove('cell--preview', 'cell--invalid');
        });
        if (valid) {
          const canPlace = cells.every(([pr, pc]) => {
            const el = grid.querySelector(`[data-r="${pr}"][data-c="${pc}"]`);
            return el && !el.classList.contains('cell--ship');
          });
          for (const [pr, pc] of cells) {
            const el = grid.querySelector(`[data-r="${pr}"][data-c="${pc}"]`);
            if (el) el.classList.add(canPlace ? 'cell--preview' : 'cell--invalid');
          }
        }
      });

      cell.addEventListener('click', () => onCellClick(r, c));
      grid.appendChild(cell);
    }
  }
  return grid;
}

export function renderPowerUps(game, onSelect) {
  const container = document.createElement('div');
  container.className = 'powerups';
  const inventory = game.inventory || {};

  for (const pu of Object.values(POWER_UPS)) {
    const count = inventory[pu.id] || 0;
    const active = game.activePowerUp === pu.id || (pu.id === 'shield' && game.shieldMode);
    const btn = document.createElement('button');
    btn.className = `powerup-btn${active ? ' powerup-btn--active' : ''}${count === 0 && pu.id !== 'shield' ? ' powerup-btn--empty' : ''}`;
    btn.innerHTML = `
      <span class="powerup-btn__icon">${pu.icon}</span>
      <span class="powerup-btn__name">${pu.name}</span>
      <span class="powerup-btn__count">${count}</span>
    `;
    btn.title = pu.desc;
    btn.disabled = count === 0 && pu.id !== 'shield' && !active;
    btn.addEventListener('click', () => onSelect(pu.id));
    container.appendChild(btn);
  }
  return container;
}

export function renderShipList(game) {
  const list = document.createElement('div');
  list.className = 'ship-list';
  const remaining = game.placementShips.slice(game.placementIndex);
  for (const ship of remaining) {
    const el = document.createElement('div');
    el.className = 'ship-list__item';
    el.innerHTML = `<span>${ship.type.icon}</span> ${ship.type.name} (${ship.type.size})`;
    list.appendChild(el);
  }
  if (!remaining.length) list.innerHTML = '<span class="ship-list__done">✓ Флот готов</span>';
  return list;
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

export function renderStats(game) {
  return `
    <div class="stats">
      <div class="stat"><span class="stat__val">${game.stats.hits}</span><span class="stat__lbl">Попадания</span></div>
      <div class="stat"><span class="stat__val">${game.stats.shipsSunk}</span><span class="stat__lbl">Потоплено</span></div>
      <div class="stat"><span class="stat__val">×${game.combo}</span><span class="stat__lbl">Комбо</span></div>
    </div>
  `;
}

export function spawnExplosion(x, y, type = 'hit') {
  const el = document.createElement('div');
  el.className = `fx fx--${type}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.getElementById('fx-layer')?.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

export function spawnComboText(text, x, y) {
  const el = document.createElement('div');
  el.className = 'fx-combo-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.getElementById('fx-layer')?.appendChild(el);
  setTimeout(() => el.remove(), 1200);
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
    setTimeout(() => cell.classList.remove(animClass), 600);
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

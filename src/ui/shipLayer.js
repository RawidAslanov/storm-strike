import { CELL } from '../game/constants.js';
import { scheduleSyncGridOverlays, syncGridOverlays } from './cannonFx.js';

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/ships/`;

export const SHIP_IMAGES = {
  destroyer:  `${ASSET_BASE}destroyer.png`,
  cruiser:    `${ASSET_BASE}cruiser.png`,
  battleship: `${ASSET_BASE}battleship.png`,
  carrier:    `${ASSET_BASE}carrier.png`,
  submarine:  `${ASSET_BASE}submarine.png`,
};

export const FX_IMAGES = {
  hitFire: `${ASSET_BASE}hit-fire.png`,
  wreck:   `${ASSET_BASE}sunk-wreck.png`,
};

export function getShipOrientation(ship) {
  if (ship.cells.length < 2) return 'h';
  return ship.cells[0][0] === ship.cells[1][0] ? 'h' : 'v';
}

export function getShipOrigin(ship) {
  const orient = getShipOrientation(ship);
  const cells = [...ship.cells];
  if (orient === 'h') cells.sort((a, b) => a[1] - b[1]);
  else cells.sort((a, b) => a[0] - b[0]);
  return cells[0];
}

function getCellIndex(ship, r, c) {
  const orient = getShipOrientation(ship);
  const sorted = [...ship.cells].sort((a, b) =>
    orient === 'h' ? a[1] - b[1] : a[0] - b[0]
  );
  return sorted.findIndex(([sr, sc]) => sr === r && sc === c);
}

function getHitSegments(ship, board) {
  const hits = [];
  for (const [r, c] of ship.cells) {
    const shot = board.shots[r][c];
    if (shot === CELL.HIT || shot === CELL.SUNK) hits.push(getCellIndex(ship, r, c));
  }
  return hits;
}

function shouldShowShip(ship, board, view) {
  if (view === 'player') return !ship.sunk;
  return false;
}

function shouldShowEnemyWreck(ship, view) {
  return view === 'enemy' && ship.sunk;
}

function buildShipUnit(ship, board, view) {
  const [r, c] = getShipOrigin(ship);
  const orient = getShipOrientation(ship);
  const len = ship.cells.length;
  const hits = getHitSegments(ship, board);
  const showAlive = shouldShowShip(ship, board, view);
  const showWreck = shouldShowEnemyWreck(ship, view);
  const showSinking = ship.sunk && !ship._sinkDone && view === 'player';

  const unit = document.createElement('div');
  unit.className = `ship-unit ship-unit--${ship.typeId} ship-unit--${orient}`;
  unit.dataset.shipId = ship.id;
  unit.style.setProperty('--r', r);
  unit.style.setProperty('--c', c);
  unit.style.setProperty('--len', len);

  if (!ship.sunk) {
    const phase = (ship.id * 1.37 + r * 0.61 + c * 0.29) % 1;
    unit.style.setProperty('--rock-delay', `${(phase * 2.8).toFixed(2)}s`);
    unit.style.setProperty('--rock-dur', `${(3.1 + (ship.id % 5) * 0.38).toFixed(2)}s`);
  }

  if (!showAlive && !showSinking && !showWreck) {
    unit.classList.add('ship-unit--hidden');
    return unit;
  }

  if (showWreck) {
    unit.classList.add('ship-unit--wreck');
  }

  if (ship.sunk && view === 'player') {
    unit.classList.add('ship-unit--sinking');
    unit.addEventListener('animationend', () => { ship._sinkDone = true; }, { once: true });
  }

  const hull = document.createElement('div');
  hull.className = 'ship-unit__hull';

  const img = document.createElement('img');
  img.className = 'ship-unit__img';
  img.src = (ship.sunk || showWreck) ? FX_IMAGES.wreck : SHIP_IMAGES[ship.typeId];
  img.alt = ship.type?.name || '';
  img.draggable = false;
  hull.appendChild(img);

  if (!ship.sunk && hits.length) {
    const burns = document.createElement('div');
    burns.className = 'ship-unit__burns';
    for (const idx of hits) {
      const burn = document.createElement('div');
      burn.className = 'ship-burn';
      burn.style.setProperty('--i', idx);
      burn.style.setProperty('--len', len);
      burns.appendChild(burn);
    }
    hull.appendChild(burns);
  }

  unit.appendChild(hull);

  if (ship.sunk) {
    const bubbles = document.createElement('div');
    bubbles.className = 'ship-unit__bubbles';
    unit.appendChild(bubbles);
  }

  unit.dataset.hitKey = hits.join(',');
  return unit;
}

function buildCellEffect(r, c, type) {
  const el = document.createElement('div');
  el.className = `cell-effect cell-effect--${type}`;
  el.dataset.r = r;
  el.dataset.c = c;
  el.style.setProperty('--r', r);
  el.style.setProperty('--c', c);
  return el;
}

function isPlayerShipCell(board, r, c) {
  const ship = board.ships.find(s => !s.sunk && s.cells.some(([sr, sc]) => sr === r && sc === c));
  return !!ship;
}

export function renderShipLayer(board, view) {
  const layer = document.createElement('div');
  layer.className = `ship-layer ship-layer--${view}`;
  const effects = document.createElement('div');
  effects.className = `effect-layer effect-layer--${view}`;
  layer._effects = effects;
  layer._view = view;
  updateShipLayer(layer, board, view);
  return { layer, effects };
}

export function updateShipLayer(layer, board, view) {
  if (!layer) return;
  const effects = layer._effects;

  const existing = new Map();
  for (const el of layer.querySelectorAll('.ship-unit')) {
    existing.set(+el.dataset.shipId, el);
  }

  for (const ship of board.ships) {
    const showAlive = shouldShowShip(ship, board, view);
    const showWreck = shouldShowEnemyWreck(ship, view);
    const showSinking = ship.sunk && !ship._sinkDone && view === 'player';
    let unit = existing.get(ship.id);

    if (!showAlive && !showSinking && !showWreck) {
      if (unit && !unit.classList.contains('ship-unit--sinking')) unit.remove();
      continue;
    }

    if (unit?.classList.contains('ship-unit--sinking')) continue;

    const hits = getHitSegments(ship, board);
    const needsRebuild = !unit
      || (showWreck && !unit.classList.contains('ship-unit--wreck'))
      || (ship.sunk && view === 'player' && !unit.classList.contains('ship-unit--sinking'))
      || unit.dataset.hitKey !== hits.join(',');

    if (needsRebuild) {
      unit?.remove();
      unit = buildShipUnit(ship, board, view);
      layer.appendChild(unit);
    }
  }

  for (const [id, el] of existing) {
    if (!layer.querySelector(`[data-ship-id="${id}"]`) && !el.classList.contains('ship-unit--sinking')) {
      el.remove();
    }
  }

  if (effects) {
    effects.innerHTML = '';
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const shot = board.shots[r][c];
        if (shot === CELL.MISS && !(view === 'player' && isPlayerShipCell(board, r, c))) {
          effects.appendChild(buildCellEffect(r, c, 'miss'));
        }
      }
    }
  }
}

export function preloadShipAssets() {
  const urls = [...Object.values(SHIP_IMAGES), ...Object.values(FX_IMAGES)];
  return Promise.all(urls.map((src) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(src);
    img.onerror = () => resolve(src);
    img.src = src;
  })));
}

export function attachShipLayers(gridWrap, board, view) {
  const { layer, effects } = renderShipLayer(board, view);
  gridWrap.appendChild(layer);
  gridWrap.appendChild(effects);
  gridWrap._shipLayer = layer;
  gridWrap._effectLayer = effects;
  scheduleSyncGridOverlays(gridWrap);
  if (!gridWrap._overlayObserver) {
    gridWrap._overlayObserver = new ResizeObserver(() => syncGridOverlays(gridWrap));
    const grid = gridWrap.querySelector('.grid');
    if (grid) gridWrap._overlayObserver.observe(grid);
  }
  return { layer, effects };
}

export function refreshShipLayers(gridWrap, board, view) {
  if (!gridWrap) return;
  if (!gridWrap._shipLayer) {
    attachShipLayers(gridWrap, board, view);
    return;
  }
  syncGridOverlays(gridWrap);
  updateShipLayer(gridWrap._shipLayer, board, view);
  scheduleSyncGridOverlays(gridWrap);
}

import { sounds } from './sounds.js';

/** Привязывает оверлей (снаряды, корабли) точно к DOM-сетке */
export function alignLayerToGrid(gridWrap, layer) {
  const grid = gridWrap?.querySelector('.grid');
  if (!grid || !layer) return;

  const gridRect = grid.getBoundingClientRect();
  const wrapRect = gridWrap.getBoundingClientRect();
  if (gridRect.width < 1 || gridRect.height < 1) return;

  const cell = grid.querySelector('.cell');
  if (cell) {
    const cellW = cell.getBoundingClientRect().width;
    if (cellW > 0) layer.style.setProperty('--cell-size', `${cellW}px`);
  }

  layer.style.position = 'absolute';
  layer.style.transform = 'none';
  layer.style.left = `${gridRect.left - wrapRect.left}px`;
  layer.style.top = `${gridRect.top - wrapRect.top}px`;
  layer.style.width = `${gridRect.width}px`;
  layer.style.height = `${gridRect.height}px`;
}

/** Синхронизирует все оверлеи сетки после layout/resize */
function positionOverlayUnits(grid, layer) {
  if (!grid || !layer) return;
  const layerRect = layer.getBoundingClientRect();

  for (const unit of layer.querySelectorAll('.ship-unit:not(.ship-unit--hidden)')) {
    const r = parseInt(unit.dataset.r, 10);
    const c = parseInt(unit.dataset.c, 10);
    const len = parseInt(unit.dataset.len, 10) || 1;
    const isV = unit.classList.contains('ship-unit--v');
    const cell0 = grid.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (!cell0) continue;

    const r0 = cell0.getBoundingClientRect();
    if (!isV) {
      const cellEnd = grid.querySelector(`[data-r="${r}"][data-c="${c + len - 1}"]`) || cell0;
      const r1 = cellEnd.getBoundingClientRect();
      unit.style.marginTop = '0';
      unit.style.marginLeft = '0';
      unit.style.left = `${r0.left - layerRect.left}px`;
      unit.style.top = `${r0.top - layerRect.top - r0.height * 0.28}px`;
      unit.style.width = `${r1.right - r0.left}px`;
      unit.style.height = `${r0.height * 1.42}px`;
    } else {
      const cellEnd = grid.querySelector(`[data-r="${r + len - 1}"][data-c="${c}"]`) || cell0;
      const r1 = cellEnd.getBoundingClientRect();
      unit.style.marginTop = '0';
      unit.style.marginLeft = '0';
      unit.style.left = `${r0.left - layerRect.left - r0.width * 0.28}px`;
      unit.style.top = `${r0.top - layerRect.top}px`;
      unit.style.width = `${r0.width * 1.42}px`;
      unit.style.height = `${r1.bottom - r0.top}px`;
    }
    unit.classList.remove('ship-unit--pending');
  }

  for (const fx of layer.querySelectorAll('.cell-effect')) {
    const r = parseInt(fx.dataset.r, 10);
    const c = parseInt(fx.dataset.c, 10);
    const cell = grid.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (!cell) continue;
    const cr = cell.getBoundingClientRect();
    fx.style.left = `${cr.left - layerRect.left}px`;
    fx.style.top = `${cr.top - layerRect.top}px`;
    fx.style.width = `${cr.width}px`;
    fx.style.height = `${cr.height}px`;
  }
}

export function syncGridOverlays(gridWrap) {
  if (!gridWrap) return;
  const grid = gridWrap.querySelector('.grid');
  alignLayerToGrid(gridWrap, gridWrap.querySelector('.projectile-layer'));
  alignLayerToGrid(gridWrap, gridWrap._shipLayer);
  alignLayerToGrid(gridWrap, gridWrap._effectLayer);
  positionOverlayUnits(grid, gridWrap._shipLayer);
  positionOverlayUnits(grid, gridWrap._effectLayer);
}

/** Отложенная синхронизация — после того как браузер посчитает layout */
export function scheduleSyncGridOverlays(gridWrap) {
  if (!gridWrap) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => syncGridOverlays(gridWrap));
  });
}

function afterLayout(fn) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(fn());
      });
    });
  });
}

export function getCellCenter(gridWrap, r, c) {
  const grid = gridWrap?.querySelector('.grid');
  const layer = gridWrap?.querySelector('.projectile-layer');
  const cell = grid?.querySelector(`[data-r="${r}"][data-c="${c}"]`);

  if (!cell || !layer) {
    return fallbackCellCenter(gridWrap, r, c);
  }

  alignLayerToGrid(gridWrap, layer);

  const cellRect = cell.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();

  return {
    x: cellRect.left - layerRect.left + cellRect.width / 2,
    y: cellRect.top - layerRect.top + cellRect.height / 2,
    cellSize: cellRect.width,
    layerRect,
  };
}

function fallbackCellCenter(gridWrap, r, c) {
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-size')) || 32;
  const step = cellSize + 1;
  return {
    x: c * step + cellSize / 2,
    y: r * step + cellSize / 2,
    cellSize,
    layerRect: { width: step * 10, height: step * 10 },
  };
}

function getOrCreateProjectileLayer(gridWrap) {
  let layer = gridWrap.querySelector('.projectile-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'projectile-layer';
    gridWrap.appendChild(layer);
  }
  alignLayerToGrid(gridWrap, layer);
  return layer;
}

function createCannonball() {
  const ball = document.createElement('div');
  ball.className = 'cannonball';
  ball.style.transform = 'translate(-50%, -50%)';
  ball.innerHTML = '<div class="cannonball__sphere"></div><div class="cannonball__fuse"></div>';
  return ball;
}

function spawnAtCenter(el, x, y, cellSize) {
  el.style.position = 'absolute';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.transform = 'translate(-50%, -50%)';
  if (cellSize) {
    el.style.setProperty('--sz', `${cellSize}px`);
    el.style.width = `${cellSize}px`;
    el.style.height = `${cellSize}px`;
  }
}

function playWaterSplash(layer, x, y, cellSize) {
  const splash = document.createElement('div');
  splash.className = 'water-impact';
  spawnAtCenter(splash, x, y, cellSize);
  splash.innerHTML = `
    <div class="water-impact__ring water-impact__ring--1"></div>
    <div class="water-impact__ring water-impact__ring--2"></div>
    <div class="water-impact__ring water-impact__ring--3"></div>
    <div class="water-impact__plume"></div>
    ${Array.from({ length: 8 }, (_, i) => `<div class="water-impact__drop" style="--i:${i}"></div>`).join('')}
  `;
  layer.appendChild(splash);
  setTimeout(() => splash.remove(), 1400);
}

function playShipImpact(layer, x, y, cellSize, sunk = false) {
  const impact = document.createElement('div');
  impact.className = `ship-impact${sunk ? ' ship-impact--sunk' : ''}`;
  spawnAtCenter(impact, x, y, cellSize);
  impact.innerHTML = `
    <div class="ship-impact__flash"></div>
    <div class="ship-impact__crack"></div>
    ${Array.from({ length: 10 }, (_, i) => `<div class="ship-impact__splinter" style="--i:${i}"></div>`).join('')}
    <div class="ship-impact__debris"></div>
    <div class="ship-impact__smoke"></div>
  `;
  layer.appendChild(impact);
  setTimeout(() => impact.remove(), sunk ? 2200 : 1500);
}

function playDeflect(layer, x, y, cellSize) {
  const el = document.createElement('div');
  el.className = 'deflect-impact';
  spawnAtCenter(el, x, y, cellSize);
  el.innerHTML = '<div class="deflect-impact__spark"></div><div class="deflect-impact__ring"></div>';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function flyCannonball(ball, startX, startY, endX, endY, duration = 700) {
  const peakY = Math.min(startY, endY) - 50 - Math.abs(startX - endX) * 0.12;
  const midX = (startX + endX) / 2;

  ball.style.left = `${startX}px`;
  ball.style.top = `${startY}px`;

  return ball.animate([
    { left: `${startX}px`, top: `${startY}px`, transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0.7 },
    { left: `${midX}px`, top: `${peakY}px`, transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.45 },
    { left: `${endX}px`, top: `${endY}px`, transform: 'translate(-50%, -50%) scale(0.9)', opacity: 1 },
  ], { duration, easing: 'cubic-bezier(0.25, 0.1, 0.2, 1)', fill: 'forwards' });
}

function sinkCannonball(ball, x, y) {
  ball.style.left = `${x}px`;
  ball.style.top = `${y}px`;
  return ball.animate([
    { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 1 },
    { transform: 'translate(-50%, 12px) scale(0.45)', opacity: 0.25 },
    { transform: 'translate(-50%, 22px) scale(0.15)', opacity: 0 },
  ], { duration: 500, easing: 'ease-in', fill: 'forwards' });
}

export function playCannonShot(gridWrap, r, c, { hit, sunk, deflected, view = 'enemy' } = {}) {
  return new Promise(resolve => {
    if (!gridWrap) { resolve(); return; }

    afterLayout(() => {
      syncGridOverlays(gridWrap);
      const layer = getOrCreateProjectileLayer(gridWrap);
      const { x, y, cellSize, layerRect } = getCellCenter(gridWrap, r, c);
      const lw = layerRect?.width || layer.clientWidth;
      const lh = layerRect?.height || layer.clientHeight;

      const fromBelow = view === 'enemy';
      const startX = lw * 0.5;
      const startY = fromBelow ? lh + 36 : -28;

      const ball = createCannonball();
      layer.appendChild(ball);

      sounds.cannonFire?.();

      const flight = flyCannonball(ball, startX, startY, x, y);

      const finish = () => {
        if (deflected) {
          sounds.deflect?.();
          playDeflect(layer, x, y, cellSize);
          sinkCannonball(ball, x, y).onfinish = () => { ball.remove(); resolve(); };
          return;
        }
        if (hit) {
          sounds.hit?.();
          playShipImpact(layer, x, y, cellSize, sunk);
          ball.querySelector('.cannonball__sphere')?.classList.add('cannonball__sphere--buried');
          setTimeout(() => { ball.remove(); resolve(); }, sunk ? 500 : 350);
        } else {
          sounds.miss?.();
          playWaterSplash(layer, x, y, cellSize);
          sinkCannonball(ball, x, y).onfinish = () => { ball.remove(); resolve(); };
        }
      };

      flight.onfinish = finish;
      setTimeout(resolve, 2200);
    });
  });
}

export async function animateCannonVolley(gridWrap, results, view) {
  if (!results?.length) return;
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.sonar) continue;
    const hit = !!(res.hit && !res.armorBlocked && !res.shieldBlocked);
    const deflected = !!(res.armorBlocked || res.shieldBlocked);
    await playCannonShot(gridWrap, res.r, res.c, { hit, sunk: res.sunk, deflected, view });
    if (i < results.length - 1) await new Promise(r => setTimeout(r, 180));
  }
}

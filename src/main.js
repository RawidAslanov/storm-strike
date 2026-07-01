import './styles/index.css';
import { App } from './ui/App.js';
import { preloadShipAssets } from './ui/shipLayer.js';

preloadShipAssets();

const root = document.getElementById('app');

try {
  new App(root);
} catch (err) {
  console.error(err);
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0a1628;color:#f0e0c0;font-family:sans-serif;text-align:center">
        <div>
          <h1 style="margin:0 0 12px">⚓ Storm Strike</h1>
          <p>Не удалось загрузить игру. Обновите страницу: <b>Ctrl+Shift+R</b></p>
        </div>
      </div>`;
  }
}

document.addEventListener('touchstart', () => {}, { passive: true });

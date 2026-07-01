import './styles/index.css';
import { App } from './ui/App.js';

const app = document.getElementById('app');
new App(app);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Registered by vite-plugin-pwa
  });
}

document.addEventListener('touchstart', () => {}, { passive: true });

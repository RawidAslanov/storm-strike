let ctx = null;
let sfxVolume = parseFloat(localStorage.getItem('ss_sfx_vol') ?? '0.7');

const SFX_BASE = `${import.meta.env.BASE_URL}audio/sfx/`;

const SFX = {
  cannonFire: `${SFX_BASE}cannon.ogg`,
  hit:        `${SFX_BASE}hit-ship.ogg`,
  miss:       `${SFX_BASE}splash.mp3`,
  sunk:       `${SFX_BASE}sink.mp3`,
  deflect:    `${SFX_BASE}clang.mp3`,
  click:      `${SFX_BASE}click.mp3`,
  win:        `${SFX_BASE}win.mp3`,
  lose:       `${SFX_BASE}lose.mp3`,
};

const cache = new Map();

export function initAudio() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { /* silent */ }
  return ctx;
}

export function resumeAudio() {
  if (ctx?.state === 'suspended') ctx.resume();
}

function playFile(path, vol = 1, fallback) {
  if (!path) { fallback?.(); return; }
  let audio = cache.get(path);
  if (!audio) {
    audio = new Audio(path);
    cache.set(path, audio);
  }
  const clone = audio.cloneNode();
  clone.volume = Math.min(1, sfxVolume * vol);
  clone.addEventListener('error', () => fallback?.(), { once: true });
  clone.play().catch(() => fallback?.());
}

function tone(freq, duration, type = 'sine', vol = 0.12, delay = 0) {
  const ac = initAudio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol * sfxVolume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function noiseBurst(duration = 0.12, vol = 0.1) {
  const ac = initAudio();
  if (!ac) return;
  const n = ac.sampleRate * duration | 0;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  src.buffer = buf;
  g.gain.setValueAtTime(vol * sfxVolume, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  src.start();
}

function playSfx(path, fallback, vol = 1) {
  const a = new Audio(path);
  a.volume = sfxVolume * vol;
  a.play().catch(() => fallback?.());
}

export const sounds = {
  cannonFire: () => playFile(SFX.cannonFire, 0.9, () => { noiseBurst(0.08, 0.12); tone(65, 0.35, 'sawtooth', 0.14); }),
  hit:        () => playFile(SFX.hit, 0.75, () => { noiseBurst(0.12, 0.1); tone(90, 0.15, 'square', 0.08); }),
  miss:       () => playFile(SFX.miss, 0.65, () => { noiseBurst(0.1, 0.06); tone(200, 0.12, 'sine', 0.05); }),
  sunk:       () => playSfx(SFX.sunk, () => { [150, 110, 80].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.1), i * 100)); }),
  deflect:    () => playSfx(SFX.deflect, () => { tone(520, 0.1, 'triangle', 0.08); }),
  combo:      () => { [262, 330, 392].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.08), i * 70)); },
  powerup:    () => { tone(330, 0.08, 'triangle', 0.07); tone(440, 0.1, 'sine', 0.05, 0.05); },
  storm:      () => { noiseBurst(0.5, 0.1); tone(55, 0.6, 'sawtooth', 0.06); },
  sonar:      () => { [280, 380, 480].forEach((f, i) => setTimeout(() => tone(f, 0.08, 'sine', 0.05), i * 90)); },
  click:      () => playSfx(SFX.click, () => tone(380, 0.04, 'triangle', 0.05)),
  win:        () => playSfx(SFX.win, () => { [262, 330, 392, 523].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.09), i * 120)); }),
  lose:       () => playSfx(SFX.lose, () => { [280, 220, 170].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.07), i * 150)); }),
};

export function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem('ss_sfx_vol', String(sfxVolume));
}

export function getSfxVolume() { return sfxVolume; }

let ctx = null;

export function initAudio() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { /* silent */ }
  return ctx;
}

function tone(freq, duration, type = 'sine', vol = 0.15) {
  const ac = initAudio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  gain.gain.setValueAtTime(vol, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export const sounds = {
  hit:     () => { tone(180, 0.15, 'square', 0.12); tone(90, 0.3, 'sawtooth', 0.08); },
  miss:    () => { tone(300, 0.08, 'sine', 0.06); tone(150, 0.15, 'sine', 0.04); },
  sunk:    () => { [220, 165, 110].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.1), i * 100)); },
  combo:   () => { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.08), i * 60)); },
  powerup: () => tone(660, 0.1, 'triangle', 0.1),
  storm:   () => { tone(80, 0.5, 'sawtooth', 0.06); setTimeout(() => tone(60, 0.8, 'sawtooth', 0.05), 200); },
  sonar:   () => { for (let i = 0; i < 4; i++) setTimeout(() => tone(400 + i * 100, 0.08, 'sine', 0.05), i * 80); },
  click:   () => tone(800, 0.04, 'sine', 0.04),
  win:     () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.1), i * 150)); },
  lose:    () => { [400, 350, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sawtooth', 0.08), i * 200)); },
};

export function resumeAudio() {
  if (ctx?.state === 'suspended') ctx.resume();
}

const MUSIC_BASE = `${import.meta.env.BASE_URL}audio/music/`;

const TRACKS = [
  { id: 'wellerman', title: 'Wellerman', src: `${MUSIC_BASE}wellerman.mp3` },
  { id: 'against', title: 'Against the Tide — Sail North', src: `${MUSIC_BASE}against-the-tide.mp3` },
  { id: 'calypso', title: 'Calypso — Sail North', src: `${MUSIC_BASE}calypso.mp3` },
  { id: 'skull', title: 'Skull and Bones — The Bass Gang', src: `${MUSIC_BASE}skull-and-bones.mp3` },
  { id: 'leave', title: 'Leave Her Johnny (AC)', src: `${MUSIC_BASE}leave-her-johnny.mp3` },
  { id: 'randy', title: 'Randy Dandy Oh', src: `${MUSIC_BASE}randy-dandy.mp3` },
  { id: 'drunken', title: 'Drunken Sailor', src: `${MUSIC_BASE}drunken-sailor.ogg` },
];

class MusicPlayer {
  constructor() {
    this.tracks = TRACKS;
    this.index = 0;
    this.audio = new Audio();
    let vol = parseFloat(localStorage.getItem('ss_music_vol') ?? '0.4');
    if (!Number.isFinite(vol) || vol < 0) vol = 0.4;
    // Слишком тихая сохранённая громкость — почти не слышно
    if (vol > 0 && vol < 0.12 && localStorage.getItem('ss_music_muted') !== '1') vol = 0.35;
    this.volume = vol;
    this.muted = localStorage.getItem('ss_music_muted') === '1';
    this.started = false;
    this.failStreak = 0;
    this.onTrackChange = null;

    this.audio.addEventListener('ended', () => {
      this.failStreak = 0;
      this.next();
    });
    this.audio.addEventListener('error', () => {
      this.failStreak += 1;
      if (this.failStreak < this.tracks.length) this.next();
    });
    this.applyVolume();
  }

  applyVolume() {
    this.audio.volume = this.muted ? 0 : this.volume;
  }

  get currentTrack() {
    return this.tracks[this.index];
  }

  async play() {
    if (this.muted || !this.tracks.length) return false;
    const track = this.currentTrack;
    if (!track) return false;

    this.audio.src = track.src;
    this.audio.load();
    try {
      await this.audio.play();
      this.started = true;
      this.failStreak = 0;
      this.onTrackChange?.();
      return true;
    } catch {
      return false;
    }
  }

  async ensurePlaying() {
    if (this.muted) return;
    if (!this.started || this.audio.paused) {
      const ok = await this.play();
      if (!ok) this.next();
    }
  }

  next() {
    this.index = (this.index + 1) % this.tracks.length;
    this.onTrackChange?.();
    if (!this.muted) this.play();
  }

  prev() {
    this.index = (this.index - 1 + this.tracks.length) % this.tracks.length;
    this.onTrackChange?.();
    if (!this.muted) this.play();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('ss_music_vol', String(this.volume));
    if (this.volume === 0) {
      this.muted = true;
      localStorage.setItem('ss_music_muted', '1');
      this.audio.pause();
    } else if (this.muted) {
      this.muted = false;
      localStorage.setItem('ss_music_muted', '0');
    }
    this.applyVolume();
    if (!this.muted && this.audio.paused) this.play();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('ss_music_muted', this.muted ? '1' : '0');
    this.applyVolume();
    if (!this.muted) this.ensurePlaying();
    else this.audio.pause();
    return this.muted;
  }

  isMuted() { return this.muted; }
  getVolume() { return this.volume; }
  getTrackLabel() {
    const t = this.currentTrack;
    if (!t) return '';
    return `${this.index + 1}/${this.tracks.length} · ${t.title}`;
  }
}

export const music = new MusicPlayer();

let gestureBound = false;

/** Запуск музыки после первого клика/касания (политика браузера) */
export function bindMusicGesture(onResume) {
  if (gestureBound) return;
  gestureBound = true;

  const unlock = () => {
    onResume?.();
    music.ensurePlaying();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };

  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
}

export function createMusicControls() {
  const bar = document.createElement('div');
  bar.className = 'music-bar';
  bar.innerHTML = `
    <button type="button" class="music-bar__mute" id="music-mute" title="Музыка вкл/выкл">🎵</button>
    <button type="button" class="music-bar__skip" id="music-skip" title="Следующая песня">⏭</button>
    <input type="range" class="music-bar__slider" id="music-vol" min="0" max="100" value="${Math.round(music.getVolume() * 100)}" />
    <span class="music-bar__title" id="music-title">${music.getTrackLabel()}</span>
  `;

  const muteBtn = bar.querySelector('#music-mute');
  const skipBtn = bar.querySelector('#music-skip');
  const slider = bar.querySelector('#music-vol');
  const title = bar.querySelector('#music-title');

  const sync = () => {
    muteBtn.textContent = music.isMuted() ? '🔇' : '🎵';
    muteBtn.classList.toggle('music-bar__mute--off', music.isMuted());
    title.textContent = music.getTrackLabel();
    slider.value = String(Math.round(music.getVolume() * 100));
  };

  music.onTrackChange = sync;

  muteBtn.addEventListener('click', () => {
    music.toggleMute();
    sync();
  });

  skipBtn.addEventListener('click', () => {
    music.next();
    sync();
  });

  slider.addEventListener('input', () => {
    music.setVolume(+slider.value / 100);
    sync();
  });

  music.audio.addEventListener('play', sync);
  sync();
  return bar;
}

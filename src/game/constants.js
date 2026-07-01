export const GRID_SIZE = 10;

export const CELL = {
  EMPTY: 0,
  SHIP: 1,
  HIT: 2,
  MISS: 3,
  SUNK: 4,
  FOG: 5,
  SHIELD: 6,
};

export const SHIP_TYPES = {
  destroyer:  { id: 'destroyer',  name: 'Эсминец',    size: 2, icon: '⚡', ability: 'speed',   desc: '+1 энергия за ход' },
  cruiser:    { id: 'cruiser',    name: 'Крейсер',    size: 3, icon: '🛡', ability: 'armor',   desc: 'Первая атака — промах' },
  battleship: { id: 'battleship', name: 'Линкор',     size: 4, icon: '💥', ability: 'broadside', desc: 'Бортовой залп 1×3' },
  carrier:    { id: 'carrier',    name: 'Авианосец',  size: 5, icon: '✈', ability: 'drone',   desc: 'Дрон-разведка' },
  submarine:  { id: 'submarine',  name: 'Подлодка',   size: 3, icon: '🔱', ability: 'stealth', desc: 'Невидима до попадания рядом' },
};

export const FLEET = ['destroyer', 'destroyer', 'cruiser', 'cruiser', 'battleship', 'carrier', 'submarine'];

export const POWER_UPS = {
  sonar: {
    id: 'sonar',
    name: 'Сонар',
    icon: '📡',
    desc: 'Сканирует зону 3×3',
    cost: 0,
    color: '#00e5ff',
  },
  chain: {
    id: 'chain',
    name: 'Цепная молния',
    icon: '⚡',
    desc: 'Попадание бьёт соседние клетки',
    cost: 2,
    color: '#ffd700',
  },
  airstrike: {
    id: 'airstrike',
    name: 'Авиаудар',
    icon: '💣',
    desc: 'Крестообразная атака',
    cost: 3,
    color: '#ff4444',
  },
  shield: {
    id: 'shield',
    name: 'Щит',
    icon: '🛡',
    desc: 'Защищает клетку корабля',
    cost: 2,
    color: '#44ff88',
  },
  smoke: {
    id: 'smoke',
    name: 'Дымовая завеса',
    icon: '💨',
    desc: 'AI промахивается 1 ход',
    cost: 2,
    color: '#aaaacc',
  },
};

export const STORM_EVENTS = {
  fog:     { id: 'fog',     name: 'Туман',     icon: '🌫', desc: 'Скрывает 30% поля',  duration: 2 },
  lightning: { id: 'lightning', name: 'Молния', icon: '⚡', desc: 'Открывает случайную клетку', duration: 1 },
  tsunami: { id: 'tsunami', name: 'Цунами',    icon: '🌊', desc: 'Сдвигает непоражённые корабли', duration: 1 },
  calm:    { id: 'calm',    name: 'Штиль',     icon: '☀', desc: '+2 энергии обоим', duration: 1 },
};

export const PHASE = {
  MENU: 'menu',
  LOBBY: 'lobby',
  PLACEMENT: 'placement',
  BATTLE: 'battle',
  GAME_OVER: 'gameover',
};

export const GAME_MODE = {
  SINGLE: 'single',
  MULTIPLAYER: 'multiplayer',
};

export const DIFFICULTY = {
  easy:   { name: 'Лёгкий',   aiDelay: 1200, aiSmart: 0.3 },
  normal: { name: 'Средний',  aiDelay: 900,  aiSmart: 0.6 },
  hard:   { name: 'Адмирал',  aiDelay: 600,  aiSmart: 0.9 },
};

export const COMBO_THRESHOLDS = [
  { hits: 2, reward: 'sonar',   label: 'Комбо ×2!' },
  { hits: 3, reward: 'chain',   label: 'Комбо ×3!' },
  { hits: 5, reward: 'airstrike', label: 'МЕГА-КОМБО ×5!' },
];

export const MAX_ENERGY = 10;
export const ENERGY_PER_TURN = 3;

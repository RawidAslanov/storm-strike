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
  destroyer:  { id: 'destroyer',  name: 'Шлюп',         size: 2, icon: '⛵', ability: 'speed',   desc: 'Локатор сканирует 5×5' },
  cruiser:    { id: 'cruiser',    name: 'Бриг',         size: 3, icon: '🏴‍☠️', ability: 'armor',   desc: 'Первая пушка — рикошет' },
  battleship: { id: 'battleship', name: 'Галеон',       size: 4, icon: '💣', ability: 'broadside', desc: 'Бортовой залп 1×3' },
  carrier:    { id: 'carrier',    name: 'Флагман',      size: 5, icon: '👑', ability: 'drone',   desc: 'Каждый ход открывает клетку' },
  submarine:  { id: 'submarine',  name: 'Нырялка',    size: 3, icon: '🦑', ability: 'stealth', desc: 'Скрыта до первого попадания' },
};

export const FLEET = ['destroyer', 'destroyer', 'cruiser', 'cruiser', 'battleship', 'carrier', 'submarine'];

/** Сводка флота для UI — сколько кораблей каждого типа */
export const FLEET_COMPOSITION = [
  { typeId: 'destroyer',  count: 2, label: '2× Шлюп' },
  { typeId: 'cruiser',    count: 2, label: '2× Бриг' },
  { typeId: 'battleship', count: 1, label: '1× Галеон' },
  { typeId: 'carrier',    count: 1, label: '1× Флагман' },
  { typeId: 'submarine',  count: 1, label: '1× Нырялка' },
];

export const TOTAL_SHIPS = FLEET.length;

export const POWER_UPS = {
  sonar: {
    id: 'sonar',
    name: 'Локатор',
    icon: '📡',
    desc: 'Сканирует область 3×3 — пусто или есть корабль (1× за игру)',
    cost: 0,
    color: '#3dadc4',
  },
  chain: {
    id: 'chain',
    name: 'Цепная молния',
    icon: '⚡',
    desc: 'Уничтожает весь корабль (2× за игру)',
    cost: 0,
    color: '#ecc050',
  },
  shield: {
    id: 'shield',
    name: 'Щит',
    icon: '🛡',
    desc: 'Защищает весь корабль от 1 попадания',
    cost: 0,
    color: '#5cb85c',
  },
  smoke: {
    id: 'smoke',
    name: 'Дымовая завеса',
    icon: '💨',
    desc: 'Враг промахнётся 1 ход (2× за игру)',
    cost: 0,
    color: '#aaaacc',
  },
};

export const STORM_EVENTS = {
  fog:       { id: 'fog',       name: 'Туман',  icon: '🌫', desc: 'Скрывает 30% поля',           duration: 2 },
  lightning: { id: 'lightning', name: 'Молния', icon: '⚡', desc: 'Открывает случайную клетку', duration: 1 },
  calm:      { id: 'calm',      name: 'Штиль',  icon: '☀', desc: 'Ясная погода',                duration: 1 },
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
  { hits: 3, reward: 'chain', label: 'Комбо ×3! +Молния' },
  { hits: 5, reward: 'smoke', label: 'МЕГА-КОМБО ×5! +Дым' },
];

/** Стартовый запас способностей за игру */
export const STARTING_INVENTORY = { sonar: 1, chain: 2, shield: 2, smoke: 2 };

# ⚓ Storm Strike — Морской Бой

Динамичный морской бой с штормами, комбо-атаками, спецспособностями и **онлайн PvP**.

## Особенности

- Комбо-система (сонар, цепная молния, авиаудар)
- Штормовые события (туман, молния, штиль)
- 5 типов кораблей с уникальными способностями
- Энергия и 5 спецспособностей
- **Онлайн PvP** — играй с другом по коду комнаты
- PWA + Capacitor — готово к APK

## Быстрый старт

```bash
npm install
npm run dev        # клиент → http://localhost:5173
npm run server     # мультиплеер-сервер → ws://localhost:3001
```

Для одиночной игры достаточно `npm run dev`.

Для мультиплеера запустите **оба** процесса в разных терминалах.

## Мультиплеер

1. Игрок 1: «Онлайн PvP» → «Создать комнату» → получает код (например `AB3K7P`)
2. Игрок 2: «Онлайн PvP» → вводит код → «Войти»
3. Оба расставляют флот → бой по очереди

## APK для Android

```bash
npm run build
npm install @capacitor/android
npx cap add android
npm run cap:sync
npx cap open android
```

## Структура

```
src/game/          — игровой движок (одиночная игра)
src/multiplayer/   — WebSocket-клиент
src/ui/            — интерфейс и анимации
server/            — мультиплеер-сервер (Node.js + ws)
shared/            — общий протокол сообщений
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|--------------|
| `PORT` | Порт сервера | `3001` |
| `VITE_WS_URL` | URL WebSocket (обязателен в продакшене) | `ws://localhost:3001` в dev |

## Деплой в интернет (Vercel + Render)

Онлайн-игра с друзьями = **два сервиса**:

| Что | Площадка | Зачем |
|-----|----------|-------|
| Игра (сайт) | **Vercel** — бесплатно | HTML/JS/CSS, PWA |
| Мультиплеер | **Render** — бесплатно | WebSocket-сервер для комнат |

> Vercel не держит постоянные WebSocket-соединения — поэтому сервер отдельно на Render.

### 1. Залить код на GitHub

```bash
git add .
git commit -m "Storm Strike ready for deploy"
git push origin storm-strike
```

(или создай отдельный репозиторий только для игры)

### 2. Render — мультиплеер-сервер

1. Зайди на [render.com](https://render.com) → **New** → **Blueprint**
2. Подключи GitHub-репозиторий
3. Render подхватит `render.yaml` и создаст сервис `storm-strike-server`
4. После деплоя скопируй URL, например: `https://storm-strike-server-xxxx.onrender.com`
5. WebSocket-адрес для клиента: `wss://storm-strike-server-xxxx.onrender.com` (без `/ws`)

**Важно:** на бесплатном тарифе сервер «засыпает» после ~15 мин без игроков. Первое подключение может занять 30–60 сек.

### 3. Vercel — сайт с игрой

1. Зайди на [vercel.com](https://vercel.com) → **Add New Project**
2. Импортируй тот же репозиторий
3. Framework: **Vite** (подхватится из `vercel.json`)
4. **Environment Variables** → добавь:
   - `VITE_WS_URL` = `wss://storm-strike-server-xxxx.onrender.com`
5. **Deploy**

Готово — игра по ссылке `https://твой-проект.vercel.app`

### 4. Как играть с другом

1. Ты: **Онлайн PvP** → **Создать комнату** → отправь другу код (например `AB3K7P`)
2. Друг: открывает ту же ссылку Vercel → **Онлайн PvP** → вводит код → **Войти**
3. Оба расставляют корабли → бой

### Альтернатива Render

Тот же `npm start` можно запустить на [Railway](https://railway.app) или [Fly.io](https://fly.io) — тоже есть бесплатный уровень. Главное: постоянный Node.js с WebSocket, не serverless.

### Локально с продакшен-сервером

```bash
# .env
VITE_WS_URL=wss://storm-strike-server-xxxx.onrender.com
npm run dev
```

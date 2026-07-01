# Публикация на GitHub

Игра — **отдельный проект** в папке `storm-battleship/`. Она **не должна** быть в репозитории Barber-site.

## Шаг 1: Создайте репозиторий на GitHub

1. Откройте https://github.com/new
2. Имя репозитория: `storm-strike`
3. Описание: `Динамичный морской бой с онлайн PvP`
4. Public
5. **Без** README, .gitignore и лицензии (уже есть в проекте)
6. Нажмите **Create repository**

## Шаг 2: Загрузите код

```bash
cd storm-battleship
git remote add origin https://github.com/RawidAslanov/storm-strike.git
git push -u origin main
```

Если remote уже добавлен:

```bash
git push -u origin main
```

## Шаг 3: Удалите ветку из Barber-site (если PR ещё открыт)

Ветка `cursor/storm-battleship-game-00ac` уже удалена с GitHub.
Закройте PR #1 вручную, если он ещё виден.

Готово — игра живёт только в `RawidAslanov/storm-strike`.

---
name: release-warchi
description: Executes the full release cycle for warchi: commit changes, bump version in package.json, update CHANGELOG.md, create annotated git tag, push commit and tags. Use when the user asks to release warchi, make a release, tag a version, or publish; or when following MEMORY.md release playbook.
---

# Релиз warchi

Для warchi **«релизим»** — это полный цикл: коммит → подъём версий → CHANGELOG → тег → push. Не только `git push`.

## Чеклист с командами

Выполнять по порядку.

### 1. Проверить состояние

- `git status --short`
- Убедиться, что в релиз входят только нужные изменения

### 2. Зафиксировать изменения

- `git add <нужные файлы>`
- `git commit -m "..."` (релизный или предрелизный коммит)

### 3. Поднять версии

- Обновить `version` в `package.json`
- При необходимости — связанные версии в соседних проектах (papirus, arepos-server)
- Если используется зависимость papirus на локальный проект, перевести на последную версию с npmjs
- **Важно:** после переключения papirus с `file:../papirus` на npm-версию выполнить `rm -rf node_modules package-lock.json && npm install` — иначе в `package-lock.json` остаются локальные ссылки (`"../papirus"` в `packages`, `"node_modules/@ngroznykh/papirus": { "resolved": "../papirus", "link": true }`), из-за которых сборка Docker-образа падает с `TS2307: Cannot find module '@ngroznykh/papirus'` (локальный путь недоступен в контексте сборки образа)
- При изменении зависимостей зафиксировать `package-lock.json`
- Если изменения маленькие поднимаем патч-версию, если большие — мажорную или минорную, в зависимости от семантики изменений

### 4. Обновить CHANGELOG.md, CHANGELOG.ru.md и CHANGELOG.fr.md

- Добавить секцию `## [X.Y.Z] - YYYY-MM-DD`
- Заполнить Added / Changed / Fixed (и эквиваленты в RU/FR)
- Обновить ссылки внизу: `[Unreleased]`, `[X.Y.Z]`
- Включать в три файла changelog только функциональные изменения, а не технические детали релиза (например, «обновили зависимости» не должно попадать в changelog)

### 5. Проверки перед релизом

- `npm install`
- `npm run lint`
- `npm run build`
- `npm run test`

### 6. Релизный коммит

- `git add CHANGELOG.md CHANGELOG.ru.md CHANGELOG.fr.md package.json package-lock.json <прочие релизные файлы>`
- `git commit -m "Release X.Y.Z."`

### 7. Аннотированный тег

- `git tag -a vX.Y.Z -m "Release vX.Y.Z."`

### 8. Публикация в remote

- `git push`
- `git push --tags`

### 9. Проверка

- `git log --oneline -1`
- `git tag --list "vX.Y.Z"`
- Убедиться, что тег и коммит есть в remote

## Заметки

- Если пользователь не уточнил иное, релиз = все шаги выше, а не только push.
- Шаблон коммита и тега: `Release vX.Y.Z.`
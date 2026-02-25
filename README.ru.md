# Warchi

SPA для управления архитектурными моделями и нотациями. Предоставляет интерфейс для создания, редактирования и версионирования доменных моделей с поддержкой компонентов, связей и пользовательских свойств.

English version: `README.md`

## Ключевые возможности

- Редактор нотаций на canvas (Papirus) с выделением, трансформацией и авторазмещением
- Импорт/экспорт нотаций в JSON
- Настройка стилей узлов и связей (включая базовые фигуры компонентов)
- Редактирование тегов, кастомных свойств и правил связей между компонентами нотации
- Гибкая панель свойств со сворачиваемыми секциями и изменяемой высотой
- Версионирование сущностей моделей и нотаций

## Стек технологий

- Vue 3 (`<script setup>`, Composition API)
- TypeScript (strict mode)
- Vite
- Vue Router 4
- Vitest
- Playwright

## Требования

- Node.js 18+
- npm 9+
- NPM-пакет Papirus (`@ngroznykh/papirus`) для рендеринга canvas/диаграмм

## Быстрый старт

```bash
npm install
cp .env.example .env.local
npm run dev
```

Приложение будет доступно по адресу `http://localhost:5173`. Dev-сервер проксирует запросы `/api/*` на бэкенд.

## Скрипты

| Команда | Описание |
|---|---|
| `npm run dev` | Запуск dev-сервера |
| `npm run lint` | Проверка ESLint |
| `npm run lint:fix` | Автоисправление ESLint |
| `npm run build` | Проверка типов и продакшен-сборка |
| `npm run preview` | Предпросмотр собранного приложения |
| `npm run test` | Запуск юнит-тестов |
| `npm run test:watch` | Тесты в watch-режиме |
| `npm run test:e2e` | E2E-тесты Playwright |

## Деплой (`deploy.sh`)

Скрипт `./deploy.sh` поддерживает два режима:

- **Обычный (legacy)** — пересоздаёт release
- **Blue/Green** — выкатывает неактивный цвет, проверяет готовность, опционально переключает трафик

Ключевые флаги:

| Переменная | По умолчанию | Для чего |
|---|---|---|
| `NAMESPACE` | `arch` | Kubernetes namespace |
| `RELEASE_NAME` | `warchi` | Имя Helm release |
| `CHART_PATH` | `charts/warchi` | Путь к Helm chart |
| `VALUES_FILE` | `charts/warchi/values.yaml` | Файл values |
| `BUILD_IMAGE` | `true` | Сборка Docker-образа перед деплоем |
| `WAIT_TIMEOUT` | `180` | Таймаут ожидания готовности (сек) |
| `INGRESS_HOST` | `warchi.local` | Хост ingress в подсказках скрипта |
| `IMAGE_TAG` | `""` | Переопределение тега образа |
| `BLUE_GREEN` | `false` | Включение blue/green режима |
| `BG_SWITCH` | `true` | Переключать ли трафик после проверки |
| `SERVICE_NAME` | `warchi` | Сервис для определения активного цвета |

Примеры:

```bash
./deploy.sh
BUILD_IMAGE=false ./deploy.sh
BLUE_GREEN=true BG_SWITCH=true IMAGE_TAG=0.0.17 ./deploy.sh
BLUE_GREEN=true BG_SWITCH=false IMAGE_TAG=0.0.17 ./deploy.sh
```

## Переменные окружения

Настраиваются в `.env.local`:

| Переменная | По умолчанию | Описание |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | URL backend API |
| `VITE_API_BASE_URL` | пусто | Базовый URL API |
| `VITE_API_VERSION` | `v1` | Версия API |
| `VITE_CANVAS_*` | пусто | Настройки canvas/редактора |

## Архитектура

- Управление состоянием через composables (без глобального store)
- API-слой на типизированной обёртке `ApiResult<T>`
- Сущности версионируются и группируются по имени
- Редактор нотаций построен на Papirus

## Подготовка к Open Source

Для подготовки публичного релиза используйте:

- `docs/OPEN_SOURCE_PREPARATION.ru.md`
- `CONTRIBUTING.ru.md`
- `SECURITY.ru.md`
- `CODE_OF_CONDUCT.ru.md`

## Лицензия

Проект использует dual licensing:

- `AGPL-3.0-or-later` для open-source использования
- Коммерческая лицензия для проприетарного/закрытого коммерческого использования

См.:

- `LICENSE` / `LICENSE.ru.md`
- `LICENSE_COMMERCIAL.md` / `LICENSE_COMMERCIAL.ru.md`

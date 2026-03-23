# Индекс: коллаборация в редакторе модели

Сводный черновик разбит на **три независимых плана**. Реализовывать по очереди (рекомендуемый порядок ниже).

## Статус на сейчас

| План | Статус |
|------|--------|
| **1. Блокировки диаграмм** | **Сделано** (API, TTL, `useDiagramEditLock`, дерево, админка, тесты). Детали — [diagram-edit-locks.md](diagram-edit-locks.md). |
| **2. Live sync** | **MVP сделан:** poll + merge в [`useModelLiveSync`](../../src/features/models/composables/useModelLiveSync.ts) ([model-live-sync.md](model-live-sync.md)). Push (SSE/WS), коалесцер событий, `revision` — **впереди**. |
| **3. Конфликты batch-save** | **Не сделано** (409 / `baseUpdatedAt` / UI мержа). Частично связанный **багфикс:** remap temp id в `instances.*` диаграммы при batch-save — **сделан** на arepos-server (см. [model-batch-save-conflicts.md](model-batch-save-conflicts.md)). |
| **Real-time canvas** | Не начато — [collaborative-editing-plan.md](../collaborative-editing-plan.md). |

## Что логично дальше

1. **[model-batch-save-conflicts.md](model-batch-save-conflicts.md)** — если важно не затирать чужие правки при одновременном «Сохранить» по одной сущности.
2. **Расширение live sync** — SSE/WebSocket + события после commit (меньше задержка и трафик, чем poll).
3. **Совместный canvas** — после ослабления эксклюзивного lock или отдельным каналом `diagram:{id}`.

---

| План | Файл | Суть |
|------|------|------|
| **1. Блокировки диаграмм** | [diagram-edit-locks.md](diagram-edit-locks.md) | Lock по `diagramId`, heartbeat/TTL, view-only, дерево, админ force-release |
| **2. Live sync модели** | [model-live-sync.md](model-live-sync.md) | Актуальность дерева/нод/связей у нескольких клиентов (poll или push по `modelId`). **MVP:** poll + merge в warchi (`useModelLiveSync`). |
| **3. Конфликты batch-save** | [model-batch-save-conflicts.md](model-batch-save-conflicts.md) | `baseUpdatedAt`, 409 с `conflicts`, refetch и мерж в `state` |

Отдельно от трёх эпиков выше — **real-time canvas** (несколько пользователей на одной диаграмме, WebSocket, курсоры, ops): это не дублирует live sync модели; см. **[collaborative-editing-plan.md](../collaborative-editing-plan.md)**. Имеет смысл после или параллельно с п.2, когда отпадёт необходимость в эксклюзивном lock (п.1) для сценария «все редактируют одну диаграмму».

## Рекомендуемый порядок внедрения

**Уже сделано:** п.1 **diagram-edit-locks**; **MVP** п.2 **model-live-sync** (poll + merge).

**Дальше** — по приоритету продукта:

1. **model-batch-save-conflicts** — если критично не затирать чужие правки при одновременном «Сохранить».
2. **Расширение model-live-sync** — push (SSE/WS), серверные события после commit, меньше poll.
3. **collaborative-editing-plan** — real-time canvas, когда нужен совместный канвас без полной эксклюзивности lock.

*Исторический черновик порядка:* сначала locks (изолированно), затем на выбор конфликты save или live sync — так и шли по факту.

### С чего начать, если приоритет — «шина»

Имеет смысл, если хочется **сначала заложить контур событий** в коде (подписки, коалесценция, один редьюсер в `useModelEditor`), а продуктовую пользу наращивать поэтапно.

1. **Клиентский каркас** [model-live-sync.md](model-live-sync.md): `ModelSyncSession` (или аналог), `subscribe` + **коалесценция по сущности**, доставка в существующий state (с учётом `_isDirty` и echo, даже если echo пока только от своего save).
2. **MVP-транспорт без WS:** периодический **poll** снимка модели → либо один псевдо-событие `model_refreshed`, либо простой **diff** до событий `node_updated` / … — чтобы шина уже «кормилась» реальными данными.
3. Затем **серверная публикация** после commit (обёртка + `events[]` из [model-live-sync.md](model-live-sync.md)) и замена/дополнение poll **SSE/WebSocket**.
4. **diagram-edit-locks** можно вести **параллельно** или сразу после каркаса — они почти не мешают шине; наоборот, view-only режим удобно тестировать, когда в state прилетают чужие события.

Итого: **начать с шины — ок**, если первым шагом считать **клиент + poll**, а не сразу полный бэкенд push. Чистый push без клиентского слоя даёт мало; чистые locks без шины дают быстрый UX «кто редактирует диаграмму».

## Доп. материал

- [collaborative-editing-plan.md](../collaborative-editing-plan.md) — **основной** план real-time **canvas** (комната `diagram:{id}`); в начале файла — как он стыкуется с [model-live-sync.md](model-live-sync.md) и [diagram-edit-locks.md](diagram-edit-locks.md).

## Копия в Cursor

Дубли с frontmatter для трекинга в IDE могут лежать в `.cursor/plans/`; источник правды в репозитории — эта папка `docs/plans/`.

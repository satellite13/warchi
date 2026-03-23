# Конфликты при сохранении модели (batch-save и мерж)

**Связанные планы:** [индекс](modeling-collaboration-index.md) · [live sync](model-live-sync.md) · [блокировки диаграмм](diagram-edit-locks.md)

## Проблема

Сохранение по кнопке «Сохранить» ([useModelEditor.ts](../../src/features/models/composables/useModelEditor.ts)): два пользователя меняли **одну и ту же ноду** — второй не должен **молча** перезаписать первого.

Текущий путь: **`POST /models/{modelId}/batch-save`** ([useModelBatchSave.ts](../../src/features/models/composables/useModelBatchSave.ts) → [ModelBatchSaveController.kt](../../../arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelBatchSaveController.kt)); fallback — пошаговые POST/PUT/DELETE.

## Базовая идея: условное обновление

- Клиент хранит **базовый `updatedAt`** (или ETag) с последней успешной синхронизации для каждой сохранённой сущности.
- В **update** / **delete** в batch передаётся **`baseUpdatedAt`** (на сущность).
- Несовпадение с БД → конфликт.

## Ответ сервера при конфликте в batch

- Откат **всего** batch (проще для целостности).
- **409** с телом, например:
  - `conflicts: [{ kind: 'node'|'link'|'diagram', id, serverRow, clientBaseUpdatedAt }]`
  - опционально **полные снимки всех id, участвовавших в запросе**, чтобы избежать N+1 GET.
- Альтернатива (сложнее): **207** + per-item статусы — только если продукт готов к частично применённой модели.

**Create** с `tempId`: проверка `updatedAt` обычно не нужна; порядок операций в batch как сейчас (ноды → связи → диаграммы, remap id).

## Одиночные PUT (fallback без batch)

- Те же правила: `baseUpdatedAt` или If-Match / ETag.
- 409 + тело для UI.

## Frontend: «умный» мерж

1. Получен **409** + `conflicts` и/или серверный снимок набора из батча.
2. **Мерж в `state`:**
   - Разные поля (сервер `parentNodeId`, локально только `attrs`) → объединить; `_isDirty` снять только для разрешённых полей.
   - Одно поле (`name`, пересечение в `attrs`) → диалог «сервер / моё / выбрать»; для JSON `attrs` — мерж по **ключам верхнего уровня**; конфликт ключа с двух сторон → выбор пользователя.
   - На сервере **удалили**, локально правили — отдельное сообщение и сценарий (отбросить локальное / не сохранять).
3. Повторное «Сохранить» с **актуальными** `baseUpdatedAt` с сервера.
4. **Fallback:** «Загрузить с сервера всё из батча» — заменить строки в state, потеря локальных правок по конфликтным сущностям.

## MVP без полного мержа

- Модалка: **«Загрузить с сервера»** | **«Перезаписать»** (`force`, если разрешено политикой).

## Связь с live sync

- После успешного save события live sync разошлют изменения другим; **409** обрабатывается локально до повторного save.

## Тесты

- Два пользователя, один batch, два конфликтующих узла.
- Мерж `attrs` по ключам.
- Полный refetch fallback.
- Пошаговый save при `batchSave === null`.

## Чеклист задач (кратко)

- [x] **Целостность attrs диаграммы при batch-save:** remap временных id нод и связей внутри **`instances.nodes` / `instances.edges`** (формат warchi). Раньше обрабатывались только корневые `nodes`/`edges` в JSON — в БД сохранялись temp UUID, что ломало канвас после poll live sync. См. `ModelBatchSaveController.remapDiagramAttrs` (arepos-server).
- `baseUpdatedAt`/ETag в batch и в CRUD fallback
- Backend: 409 + `conflicts[]` (+ опционально снимки)
- Frontend: мерж, модалки, повтор save
- Единые правила для пошагового save
- Тесты

# Large Model Editor Load Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести этапы 1–2 до устойчивого состояния в HTTP/2-контуре: применить
pageable properties, ограничить суммарную нагрузку страничных запросов, исключить
потерю live-sync событий и результаты устаревших загрузок.

**Architecture:** Страничные GET nodes/links/diagrams проходят через один семафор,
общий для всех одновременных коллекций редактора. `loadModel` и live-sync pull имеют
generation id; старые результаты не применяются. Live sync выполняет один pull и
хранит один накопленный повтор вместо отбрасывания события при `inFlight`.

**Tech Stack:** Vue 3, TypeScript, Vitest, Kotlin, Spring Boot 3.5, MockMvc, nginx 1.29.

---

### Task 1: Зафиксировать pageable defaults и overrides

**Files:**
- Modify: `../arepos-server/src/test/kotlin/ru/kavader/arepos/controller/NodesControllerTest.kt`
- Create: `../arepos-server/src/test/kotlin/ru/kavader/arepos/controller/NodesControllerPageableOverrideTest.kt`
- Verify: `../arepos-server/src/main/kotlin/ru/kavader/arepos/config/PageableWebConfig.kt`

- [x] Добавить в `NodesControllerTest` тест запроса без `size`, ожидающий
  `$.page.size == 50`.
- [x] Запустить только новый тест и подтвердить RED без активного customizer либо
  задокументировать, что он уже GREEN на существующей предварительной реализации.
- [x] Создать отдельный `@SpringBootTest` с
  `@TestPropertySource(max-page-size=100, default-page-size=10)`.
- [x] Проверить без `size` значение 10 и cap `size=500 → 100`.
- [x] Выполнить:

```bash
./gradlew test --tests "ru.kavader.arepos.controller.NodesControllerTest" \
  --tests "ru.kavader.arepos.controller.NodesControllerPageableOverrideTest"
```

Ожидается: `BUILD SUCCESSFUL`.

### Task 2: Ввести глобальный page-request pool

**Files:**
- Create: `src/features/models/utils/modelEditorPagePool.ts`
- Create: `src/features/models/utils/modelEditorPagePool.test.ts`
- Modify: `src/features/models/composables/modelEditorLoadModel.ts`
- Modify: `src/features/models/composables/modelEditorLoadModel.test.ts`
- Modify: `src/api/queryHelpers.ts`

- [x] Написать тест семафора: две независимые серии задач одновременно не превышают
  `MODEL_PAGE_FETCH_CONCURRENCY`.
- [x] Запустить тест и получить RED из-за отсутствующего API.
- [x] Реализовать `withModelEditorPageSlot<T>(operation)` с FIFO-очередью и
  освобождением слота в `finally`.
- [x] Подключить слот только вокруг `fetchModelPage`; короткие GET модели/каталога
  оставить вне пула.
- [x] Заменить проверку per-collection concurrency на глобальную:
  параллельные nodes + links + diagrams суммарно держат не больше лимита.
- [x] Выполнить:

```bash
npx vitest run \
  src/features/models/utils/modelEditorPagePool.test.ts \
  src/features/models/composables/modelEditorLoadModel.test.ts
```

Ожидается: все тесты проходят, observed maximum равен или меньше configured limit.

### Task 3: Защитить readiness от устаревшей load session

**Files:**
- Modify: `src/features/models/composables/useModelEditor.ts`
- Modify: `src/features/models/composables/modelEditorLoadModel.ts`
- Modify: `src/features/models/composables/modelEditorLoadModel.test.ts`
- Test: существующий или новый focused test рядом с `useModelEditor.ts`

- [x] Написать тест: load A задержан, начинается load B, затем фон A завершается;
  `initialSnapshotReady` B остаётся `false`.
- [x] Запустить и подтвердить RED.
- [x] Добавить монотонный `loadGeneration`; все завершения shell/catalog/links и
  `markBackgroundReady` проверяют generation + model id.
- [x] Передать в постраничный обход `isCancelled`; проверять его перед выдачей
  следующей страницы и перед применением результата.
- [x] Добавить тест прекращения обхода после cancellation.
- [x] Выполнить focused Vitest-команды для изменённых composables.

### Task 4: Сделать readiness обязательным

**Files:**
- Modify: `src/features/models/composables/useModelLiveSync.ts`
- Modify: `src/features/models/composables/useModelEditorSync.ts`
- Modify: `src/features/models/composables/useModelLiveSync.test.ts`

- [x] Обновить тестовые вызовы: каждый явно передаёт
  `initialSnapshotReady: ref(true|false)`.
- [x] Сделать поле обязательным в `UseModelLiveSyncOptions`.
- [x] Удалить fallback `?? true`.
- [x] Запустить typecheck/tests и исправить все реальные call sites.

### Task 5: Не терять события во время pull

**Files:**
- Modify: `src/features/models/composables/useModelLiveSync.ts`
- Modify: `src/features/models/utils/modelLiveSyncPullGate.ts`
- Modify: `src/features/models/composables/useModelLiveSync.test.ts`
- Modify: `src/features/models/utils/modelLiveSyncPullGate.test.ts`

- [x] Написать тест: первый collection pull задержан; приходит чужой
  `stomp_model_changed`; после завершения выполняется ровно второй pull.
- [x] Запустить и подтвердить RED: сейчас событие отбрасывается на `inFlight`.
- [x] Заменить ранний `if (inFlight) return` на scheduler с одним pending repeat.
- [x] Коалесцировать `ws_connect`, `session_resync`, `visibility`, `poll_timer`;
  чужой `model_changed` имеет приоритет и не теряется.
- [x] В `finally` запускать максимум один повтор через microtask.
- [x] Добавить pull generation и тест: результат model A после перехода на B не merge-ится.
- [x] Проверить poll mode: до readiness pull отсутствует; после readiness первый pull
  приходит по интервалу, без немедленного дубля.

### Task 6: Проверить интеграцию и HTTP/2 baseline

**Files:**
- Modify if needed: `CHANGELOG.md`, `CHANGELOG.ru.md`
- Source of truth: `docs/large-model-editor-load.md`

- [x] Выполнить frontend verification:

```bash
npm run build
npm run test -- --run
npm run lint
```

- [x] Выполнить backend focused tests и затем `./gradlew build`.
- [x] Пересобрать локальный warchi и проверить:

```bash
curl --http2 -k -o /dev/null -w 'HTTP/%{http_version} %{http_code}\n' \
  https://warchi.arch.svc.cluster.local/api/v1/auth/sso/config
```

- [x] На синтетической эталонной модели снять HTTP/2 baseline для concurrency 4 и
  page size 8000: backend 1 GiB / JVM heap 247,5 MiB получил `OutOfMemoryError`.
- [x] Проверить исходную матрицу **4 / 6 / 8** × **5000 / 8000 / 12000**:
  минимальная ячейка 4 × 5000 не прошла пороги даже при backend 4 GiB
  (nodes p95 9,65 с, links p95 13,33 с, locks p95 2,24 с), остальные ячейки
  остановлены по доминированию.
- [x] Для текущего профиля 1 CPU / 1 GiB проверить безопасные значения вниз и выбрать
  concurrency **1**, page size **5000**: request span 32,01 с, без OOM.
- [x] Не утверждать оптимальность 4/8000 без результатов замера.

### Task 8: Убрать измеренный Vue long task полного snapshot

**Files:**
- Modify: `src/features/models/composables/modelEditorMappers.ts`
- Modify: `src/features/models/composables/useModelEditorStateHelpers.ts`
- Modify: `src/features/models/ModelEditor.vue`
- Add: `src/features/models/components/ModelEditorLoadProgress.vue`
- Add: `src/features/models/utils/modelEditorLoadProgress.ts`
- Test: editor state, tree, dirty/rename/watchers regression tests

- [x] Снять CPU profile участка после последней страницы nodes: `mapInChunks`,
  присвоение `state.nodes`, создание reactive proxies и пересчёт индексов.
- [x] Сначала добавить регрессионные тесты для замены массивов и точечных изменений
  node/link/diagram при `shallowRef` или `markRaw`.
- [x] Оставить массовые nodes/links вне глубокой реактивности через `markRaw`;
  изменения пользователя публиковать заменой записи, diagrams оставить reactive.
- [x] Добавить реальный progress bar по метаданным страниц и фазам shell/catalog/links:
  блокирующий до готовности shell, затем неблокирующий.
- [x] Уменьшить повторяемый long task 2,1–2,3 с без изменения API и полного snapshot:
  контрольный max long task **303 мс**.
- [x] Повторить 1 × 5000 application baseline: max long task **303 мс**,
  p95 `GET /diagram-locks` **65 мс** (49 проб, без ошибок), used JS heap после
  полной загрузки **339 MiB**. Контрольный браузерный прогон выполнялся через
  HTTP/1.1 URL сервиса из-за trust scope сертификата; ранее подтверждённый HTTP/2
  transport baseline и backend-профиль не менялись.

### Task 7: Проверить документацию этапа 3

**Files:**
- Modify: `docs/large-model-editor-load.md`

- [x] Проверить отсутствие утверждений `root = parent_node IS NULL` для новых моделей.
- [x] Проверить ссылку на реальный search endpoint.
- [x] Проверить явный unresolved choice для scoped links.
- [x] Проверить список full-load исключений и partial merge semantics.
- [x] Проверить, что этап 3 остаётся отдельной реализацией и веткой.


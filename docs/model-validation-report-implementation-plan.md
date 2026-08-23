# Model Validation Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Встроенный отчёт дубликатов модели и атомарное схлопывание пары на сервере, без выгрузки графа в браузер.

**Architecture:** arepos считает `GROUP BY` и делает merge в одной транзакции (typeProperties only, remap instance, reparent диаграмм, sync-события как batch-save). wArchi открывает соседнюю страницу модели (как матрица), рисует группы и мастер, ходит только в report / references / preview / merge.

**Tech Stack:** Kotlin 2.2 / Spring Boot / JPA / PostgreSQL / JUnit / Testcontainers; Vue 3 / TypeScript / Vitest / Vue Router / Vue I18n.

**Design:** `docs/model-validation-report-design.md`

---

## Правила выполнения

- Одна ветка `feat/model-validation-report` в `warchi` и `arepos-server`. papirus не трогать.
- Каждый task: failing test → implement → focused tests → commit.
- Не тащить полный editor state на страницу отчёта. Не исполнять JS по дереву.
- Не добавлять API-ключи и не менять диаграммные скрипты.
- После каждого backend-task: `./gradlew test --tests "<класс>"` из `arepos-server`.
- После каждого frontend-task: `npx vitest run <файл>` из `warchi`.

## Карта файлов

**arepos-server (новые):**

- `src/main/kotlin/ru/kavader/arepos/dto/model/ModelValidationDtos.kt` — report / preview / merge request-response
- `src/main/kotlin/ru/kavader/arepos/service/ModelValidationReportService.kt` — GET report
- `src/main/kotlin/ru/kavader/arepos/service/ModelValidationMergeService.kt` — preview + merge узлов и связей
- `src/main/kotlin/ru/kavader/arepos/controller/ModelValidationController.kt` — маршруты под `/api/v1/models/{modelId}`
- `src/test/kotlin/ru/kavader/arepos/controller/ModelValidationControllerTest.kt`
- `src/test/kotlin/ru/kavader/arepos/service/ModelValidationMergeServiceTest.kt`

**arepos-server (изменить):**

- `src/main/kotlin/ru/kavader/arepos/repository/NodesRepository.kt` — native grouping query
- `src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt` — native grouping query
- `src/main/kotlin/ru/kavader/arepos/repository/DiagramsRepository.kt` — `findDiagramReferences` по `linkJsonPath`
- `src/main/kotlin/ru/kavader/arepos/controller/ModelTraceabilityController.kt`
- `src/main/kotlin/ru/kavader/arepos/service/ModelTraceabilityService.kt`
- `src/main/kotlin/ru/kavader/arepos/service/ModelTraceabilityReader.kt`
- `src/test/kotlin/ru/kavader/arepos/controller/ModelTraceabilityControllerTest.kt`

**warchi (новые):**

- `src/features/models-validation/types.ts`
- `src/features/models-validation/api.ts`
- `src/features/models-validation/utils/typePropertiesDiff.ts`
- `src/features/models-validation/utils/typePropertiesDiff.test.ts`
- `src/features/models-validation/composables/useAllDiagramReferences.ts`
- `src/features/models-validation/composables/useAllDiagramReferences.test.ts`
- `src/views/ModelValidationView.vue`
- `src/features/models-validation/components/ValidationDuplicateGroup.vue`
- `src/features/models-validation/components/ValidationMergeWizard.vue`

**warchi (изменить):**

- `src/router/index.ts` — маршрут `model-validation`
- `src/features/models/components/ModelEditorHeader.vue`
- `src/features/models/ModelEditor.vue` — кнопка + query `nodeId` / `linkId`
- `src/features/models/composables/modelScopedApi.ts` — `fetchDiagramReferences` принимает `nodeId | linkId`
- `src/i18n/locales/models.ts` — ключи `models.validationReport.*`
- `src/features/docs/content/models.md` и `models.en.md`
- `src/features/docs/composables/useDocsNavigation.ts` — только если нужна отдельная страница help; иначе секция в models

---

### Task 0: Ветки

**Files:** git в `warchi` и `arepos-server`

- [ ] **Step 1: Создать одну ветку в обоих репозиториях**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/model-validation-report
cd /Users/nikolaygroznyh/Work/arepos-server && git checkout -b feat/model-validation-report
```

Expected: обе ветки `feat/model-validation-report`, papirus не переключать.

---

### Task 1: GET validation-report

**Files:**

- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/model/ModelValidationDtos.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelValidationReportService.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelValidationController.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/NodesRepository.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ModelValidationControllerTest.kt`

- [ ] **Step 1: Написать падающий интеграционный тест**

Класс наследует `ControllerIntegrationTest`, как `ModelTraceabilityControllerTest`. Сценарии:

```kotlin
@Test
fun `groups nodes by type and case-insensitive trimmed name and skips directory`() {
    // Directory "Apps", two Application Component "CRM" / " crm ", one "Other"
    mockMvc.perform(get("/api/v1/models/${model.id}/validation-report").with(auth))
        .andExpect(status().isOk)
        .andExpect(jsonPath("$.duplicateNodes.length()").value(1))
        .andExpect(jsonPath("$.duplicateNodes[0].count").value(2))
        .andExpect(jsonPath("$.duplicateNodes[0].nodes[0].parentName").value("Apps"))
}

@Test
fun `groups directed links and ignores reverse pair`() {
    // A→B Serving ×2, B→A Serving ×1
    mockMvc.perform(get("/api/v1/models/${model.id}/validation-report").with(auth))
        .andExpect(jsonPath("$.duplicateLinks.length()").value(1))
        .andExpect(jsonPath("$.duplicateLinks[0].count").value(2))
}

@Test
fun `excludes deleted nodes and forbidden viewer gets 403`() { /* ... */ }
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "ru.kavader.arepos.controller.ModelValidationControllerTest"
```

Expected: FAIL (404 / класс не найден).

- [ ] **Step 3: Реализовать DTO, native grouping, сервис и контроллер**

DTO (имена полей как в spec, UUID как UUID):

```kotlin
data class ValidationReportResponse(
    val modelId: UUID,
    val generatedAt: Instant,
    val duplicateNodes: List<DuplicateNodeGroup>,
    val duplicateLinks: List<DuplicateLinkGroup>
)

data class DuplicateNodeMember(
    val id: UUID,
    val name: String,
    val parentId: UUID?,
    val parentName: String?
)
```

Группировка узлов — native SQL:

```sql
SELECT n.node_type AS node_type_id,
       lower(trim(n.name)) AS name_key,
       COUNT(*) AS cnt
FROM nodes n
JOIN node_types t ON t.id = n.node_type
WHERE n.model = :modelId
  AND (n.deleted = false OR n.deleted IS NULL)
  AND lower(t.name) <> 'directory'
GROUP BY n.node_type, lower(trim(n.name))
HAVING COUNT(*) > 1
```

Если у `nodes` нет колонки `deleted` — фильтровать только то, что есть в схеме. Члены группы: `ORDER BY n.id ASC`, в JSON не больше 50, `count` = полный COUNT. Имя группы = `name` первого члена.

Связи:

```sql
SELECT l.source, l.target, l.link_type, COUNT(*)
FROM links l
WHERE l.model = :modelId
GROUP BY l.source, l.target, l.link_type
HAVING COUNT(*) > 1
```

Контроллер:

```kotlin
@RestController
@RequestMapping("/api/v1/models/{modelId}")
class ModelValidationController(
    private val reportService: ModelValidationReportService
) {
    @GetMapping("/validation-report")
    fun report(@PathVariable modelId: UUID): ValidationReportResponse =
        reportService.report(modelId)
}
```

Сервис: `modelsRepository.findById` + `accessService.requireCanViewModel`. Системный tree root в `parentName` не показывать: если `parent_node` равен configured root / hidden root — `parentId` и `parentName` = null (взять ту же семантику, что search path в `SearchService`).

- [ ] **Step 4: Тесты зелёные**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.ModelValidationControllerTest"
```

Expected: PASS.

- [ ] **Step 5: Commit в arepos-server**

```bash
git add src/main/kotlin/ru/kavader/arepos/dto/model/ModelValidationDtos.kt \
        src/main/kotlin/ru/kavader/arepos/service/ModelValidationReportService.kt \
        src/main/kotlin/ru/kavader/arepos/controller/ModelValidationController.kt \
        src/main/kotlin/ru/kavader/arepos/repository/NodesRepository.kt \
        src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt \
        src/test/kotlin/ru/kavader/arepos/controller/ModelValidationControllerTest.kt
git commit -m "Add model validation-report endpoint for duplicate nodes and links."
```

---

### Task 2: diagram-references по linkId

**Files:**

- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelTraceabilityController.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelTraceabilityService.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelTraceabilityReader.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/DiagramsRepository.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ModelTraceabilityControllerTest.kt`

- [ ] **Step 1: Падающие тесты**

```kotlin
@Test
fun `diagram-references accepts linkId and rejects both params`() {
    mockMvc.perform(
        get("/api/v1/models/${model.id}/diagram-references")
            .param("linkId", link.id.toString())
    ).andExpect(status().isOk)
        .andExpect(jsonPath("$.content[0].id").value(diagram.id.toString()))

    mockMvc.perform(
        get("/api/v1/models/${model.id}/diagram-references")
            .param("nodeId", node.id.toString())
            .param("linkId", link.id.toString())
    ).andExpect(status().isBadRequest)
}
```

Существующий тест с `nodeId` не должен сломаться.

- [ ] **Step 2: Запустить — FAIL на linkId**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.ModelTraceabilityControllerTest"
```

- [ ] **Step 3: Реализовать**

Контроллер: ровно один query param.

```kotlin
fun diagramReferences(
    @PathVariable modelId: UUID,
    @RequestParam(required = false) nodeId: UUID?,
    @RequestParam(required = false) linkId: UUID?,
    @PageableDefault(size = 50) pageable: Pageable
): Page<DiagramReferenceResponse> {
    if ((nodeId == null) == (linkId == null)) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide exactly one of nodeId or linkId")
    }
    return if (nodeId != null) service.diagramReferences(modelId, nodeId, pageable)
    else service.diagramReferencesForLink(modelId, linkId!!, pageable)
}
```

Reader: тот же `findDiagramReferences`, jsonpath

```text
exists($.instances.edges[*] ? (@.modelLinkId == "<uuid>"))
```

Проверка, что link принадлежит модели (`existsByIdAndModel_Id`). Soft-deleted диаграммы уже отфильтрованы запросом.

- [ ] **Step 4: Тесты зелёные**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.ModelTraceabilityControllerTest"
```

- [ ] **Step 5: Commit**

```bash
git commit -m "Allow diagram-references lookup by linkId."
```

---

### Task 3: Preview merge

**Files:**

- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/model/ModelValidationDtos.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelValidationMergeService.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelValidationController.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ModelValidationControllerTest.kt`

- [ ] **Step 1: Падающие тесты preview**

```kotlin
@Test
fun `nodes preview splits unique matching and AB links and reads typeProperties only`() {
    // keep/drop CRM; drop has documentFileId; drop→X unique; drop→Y matching; drop→keep
    mockMvc.perform(
        get("/api/v1/models/${model.id}/validation/merge-nodes-preview")
            .param("keepId", keep.id.toString())
            .param("dropId", drop.id.toString())
    ).andExpect(status().isOk)
        .andExpect(jsonPath("$.keepTypeProperties.owner").value("a"))
        .andExpect(jsonPath("$.uniqueLinks.length()").value(1))
        .andExpect(jsonPath("$.linksToDelete.length()").value(2))
        .andExpect(jsonPath("$.hasDocuments").value(true))
        .andExpect(jsonPath("$.hasChildren").value(false))
}

@Test
fun `preview same id or non-duplicate returns 400`() { /* keepId==dropId; different names */ }
```

- [ ] **Step 2: Запустить — FAIL**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.ModelValidationControllerTest"
```

- [ ] **Step 3: Реализовать preview**

Парсинг attrs: `ObjectMapper.readTree(node.attrs)` → объект `typeProperties`. `hasDocuments` = текстовое поле `documentFileId` не пустое.

Классификация связей drop (source или target = drop):

```kotlin
fun classify(drop: Nodes, keep: Nodes, link: Links): Kind {
    val a = keep.id!!
    val b = drop.id!!
    if ((link.source.id == a && link.target.id == b) || (link.source.id == b && link.target.id == a))
        return Kind.AB
    val other = if (link.source.id == b) link.target.id!! else link.source.id!!
    val outgoing = link.source.id == b
    val existsOnKeep = links.any {
        it.linkType.id == link.linkType.id &&
            if (outgoing) it.source.id == a && it.target.id == other
            else it.source.id == other && it.target.id == a
    }
    return if (existsOnKeep) Kind.MATCHING else Kind.UNIQUE
}
```

`diagramsToReparentCount` = `diagramsRepository.countByNode_IdAndDeletedFalse(drop.id)`.
Список `{diagramId, diagramName}` — все неудалённые диаграммы, где instance `modelNodeId` равен keep или drop (jsonpath, без лимита 50; если много — всё равно полный список, это preview одной пары).

В оба preview DTO обязательно включить `keepUpdatedAt` и `dropUpdatedAt` (ISO Instant сущности). Мастер Task 9 шлёт их обратно в POST без повторного GET сущности.

GET:

- `/validation/merge-nodes-preview?keepId=&dropId=`
- `/validation/merge-links-preview?keepId=&dropId=`

Право: `requireCanViewModel`.

- [ ] **Step 4: Тесты зелёные + commit**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.ModelValidationControllerTest"
git commit -m "Add merge preview for duplicate nodes and links."
```

---

### Task 4: POST merge-nodes

**Files:**

- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelValidationMergeService.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelValidationController.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/model/ModelValidationDtos.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/service/ModelValidationMergeServiceTest.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ModelValidationControllerTest.kt`

- [ ] **Step 1: Падающие тесты сервиса**

Покрыть правила spec по одному assert на кейс:

1. unique link в `transferLinkIds` — тот же id, `source/target` теперь keep;
2. matching и A↔B удалены; их edge instance вычищены через тот же обход attrs, что `DiagramCanvasJsonCleanup` (удаление по `modelLinkId`);
3. instance `modelNodeId=B` → `A`; две фигуры A на одной диаграмме остаются;
4. `diagrams.node_id` B → A;
5. `typeProperties` записаны, `notationComponents` и `documentFileId` keep не изменились;
6. дети у drop → 400;
7. `updatedAt` keep устарел → 409;
8. `transferLinkIds` с matching id → 400;
9. после успеха вызван `modelSyncBroadcaster.broadcastModelChanged` с `node_updated`, `node_deleted`, `link_updated`/`link_deleted`, `diagram_updated` (`ModelSyncEventType`).

Lock: если `DiagramEditLocks` на затронутой диаграмме принадлежит другому пользователю и не истёк — 409. Смотреть `DiagramEditLocksRepository` и ответ `LOCKED_BY_OTHER` / `DIAGRAM_LOCK_HELD_BY_ANOTHER_USER`. Свой lock не блокирует.

- [ ] **Step 2: Запустить — FAIL**

```bash
./gradlew test --tests "ru.kavader.arepos.service.ModelValidationMergeServiceTest"
```

- [ ] **Step 3: Реализовать транзакцию merge**

Порядок внутри `@Transactional`:

1. `requireCanEditModel`
2. загрузить keep/drop, проверить модель, не Directory, всё ещё дубликат (`nodeType` + `lower(trim(name))`)
3. сравнить `keepUpdatedAt` / `dropUpdatedAt` с `updatedAt` (или `createdAt` если null)
4. `hasChildren` → 400
5. классифицировать связи; валидировать `transferLinkIds ⊆ unique`
6. собрать id затронутых диаграмм (instance keep/drop + edges удаляемых связей + `node_id=drop`); проверить чужие lock
7. записать `typeProperties` в JSON keep (`ObjectNode.putObject` / replace только этот ключ)
8. UPDATE концов transfer-связей
9. удалить остальные инцидентные связи drop
10. в attrs диаграмм: remap `modelNodeId` B→A; вычистить edges удаленных link id (`DiagramCanvasJsonCleanup.cleanupDiagramAttrs` для deleted links; remap нод — отдельный helper рядом, не удалять instance B)
11. `diagram.node = keep` где было drop
12. удалить drop
13. `broadcastModelChanged(modelId, "validation_merge_nodes", events)`

Контроллер: `@PostMapping("/validation/merge-nodes")`.

Request:

```kotlin
data class MergeNodesRequest(
    val keepId: UUID,
    val dropId: UUID,
    val typeProperties: Map<String, Any?> = emptyMap(),
    val transferLinkIds: List<UUID> = emptyList(),
    val keepUpdatedAt: Instant,
    val dropUpdatedAt: Instant
)
```

- [ ] **Step 4: Тесты зелёные**

```bash
./gradlew test --tests "*ModelValidationMergeServiceTest" --tests "*ModelValidationControllerTest"
```

- [ ] **Step 5: Commit**

```bash
git commit -m "Merge duplicate model nodes atomically with sync events."
```

---

### Task 5: POST merge-links

**Files:** те же merge service / controller / DTOs / тесты

- [ ] **Step 1: Падающий тест**

Две Serving A→B на диаграммах D1 и D2; разные `typeProperties`. После POST:

- drop нет;
- оба edge `modelLinkId = keep`;
- keep.typeProperties = тело запроса;
- `notationRelations` keep не изменились;
- 400 если не дубликат (разный type или reverse).

- [ ] **Step 2: Реализовать**

`@PostMapping("/validation/merge-links")`. Право edit. Lock на диаграммах, где есть keep или drop edge. Remap `modelLinkId` drop→keep; если keep уже есть на холсте — удалить edge drop. `broadcastModelChanged(..., "validation_merge_links", ...)`.

- [ ] **Step 3: Тесты + commit**

```bash
./gradlew test --tests "*ModelValidation*"
git commit -m "Merge duplicate model links and remap diagram edges."
```

---

### Task 6: wArchi API-клиент и типы

**Files:**

- Create: `warchi/src/features/models-validation/types.ts`
- Create: `warchi/src/features/models-validation/api.ts`
- Create: `warchi/src/features/models-validation/api.test.ts`
- Modify: `warchi/src/features/models/composables/modelScopedApi.ts`
- Test: `warchi/src/features/models/composables/modelScopedApi.test.ts`

- [ ] **Step 1: Падающие тесты клиента**

`api.test.ts` мокает `apiGet` / `apiPost` из `@/composables/useApi`:

```ts
it('fetches report', async () => {
  vi.mocked(apiGet).mockResolvedValue({ success: true, data: sampleReport })
  const result = await fetchValidationReport('m1')
  expect(apiGet).toHaveBeenCalledWith('/models/m1/validation-report')
  expect(result.success && result.data.duplicateNodes).toHaveLength(1)
})
```

`modelScopedApi.test.ts`: `fetchDiagramReferences(modelId, { linkId })` → query `linkId`, без `nodeId`. Оба сразу — не вызывать (assert throw / не слать).

- [ ] **Step 2: `npx vitest run` — FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models-validation/api.test.ts src/features/models/composables/modelScopedApi.test.ts
```

- [ ] **Step 3: Типы 1:1 со spec + функции**

`fetchValidationReport`, `fetchMergeNodesPreview`, `fetchMergeLinksPreview`, `mergeNodes`, `mergeLinks` в `api.ts` через `apiGet` / `apiPost`. Даты — ISO string как в остальных API-типах wArchi.

`fetchDiagramReferences` сигнатуру сменить на:

```ts
export function fetchDiagramReferences(
  modelId: string,
  target: { nodeId: string } | { linkId: string },
  options?: FetchDiagramReferencesOptions
): Promise<ApiResult<PaginatedResponse<DiagramReferenceResponse>>>
```

Поправить всех текущих вызывающих (`useLazyTraceability.ts` и тесты) на `{ nodeId }`.

- [ ] **Step 4: Тесты зелёные + commit в warchi**

```bash
npx vitest run src/features/models-validation/api.test.ts src/features/models/composables/modelScopedApi.test.ts src/features/models/composables/useLazyTraceability.ts
git commit -m "Add validation-report API client and linkId diagram-references."
```

(Если `useLazyTraceability` тесты в другом файле — гонять его.)

---

### Task 7: Страница-оболочка и кнопка

**Files:**

- Create: `warchi/src/views/ModelValidationView.vue`
- Modify: `warchi/src/router/index.ts`
- Modify: `warchi/src/features/models/components/ModelEditorHeader.vue`
- Modify: `warchi/src/features/models/ModelEditor.vue`
- Modify: `warchi/src/i18n/locales/models.ts`

- [ ] **Step 1: Ключи i18n ru+en**

В оба блока `models` (`ru` и `en`) добавить:

```ts
validationReportOpen: 'Валидация',
validationReportTitle: 'Валидация модели',
validationReportEmpty: 'Дубликатов не найдено',
validationReportNodes: 'Экземпляры',
validationReportLinks: 'Связи',
validationReportCopies: '{count} копий',
validationReportMergeInto: 'Слить в выбранный',
validationReportKeep: 'Оставить этот',
// мастер, ошибки 409, documents warning — сразу все строки из UI Tasks 8–9
```

Не оставлять ключ только в `ru`.

- [ ] **Step 2: Маршрут и кнопка**

В `router/index.ts` сразу после `model-relation-matrix`:

```ts
{
  path: '/models/:id/validation',
  name: 'model-validation',
  component: () => import('../views/ModelValidationView.vue'),
}
```

В `ModelEditorHeader` рядом с кнопкой матрицы — иконка `fact_check` (или `rule`), emit `openValidation`. В `ModelEditor.vue`:

```ts
function handleOpenValidation(): void {
  if (!modelId) return
  router.push({ name: 'model-validation', params: { id: modelId } })
}
```

`onBeforeRouteLeave` уже спросит про unsaved — не дублировать.

- [ ] **Step 3: Оболочка страницы**

Скопировать каркас шапки у `ModelRelationMatrixView.vue` (назад в `model-editor`, `AppHeader`, имя модели из `GET /models/{id}` — один `apiGet`, не `loadModelEditorData`). Состояния: loading / error / empty / две секции-заглушки с `duplicateNodes.length` и `duplicateLinks.length`.

- [ ] **Step 4: Commit**

```bash
git commit -m "Add model validation page route and toolbar button."
```

Прогнать `npx vitest run src/features/models/utils/modelEditorToolbarLock.test.ts` если кнопка попадает в lock-список — не добавлять туда, валидация не save.

---

### Task 8: Группы, чипы диаграмм, навигация

**Files:**

- Create: `warchi/src/features/models-validation/composables/useAllDiagramReferences.ts`
- Create: `warchi/src/features/models-validation/composables/useAllDiagramReferences.test.ts`
- Create: `warchi/src/features/models-validation/components/ValidationDuplicateGroup.vue`
- Modify: `warchi/src/views/ModelValidationView.vue`

- [ ] **Step 1: Тест пагинации references**

```ts
it('pages until last', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ success: true, data: { content: [{ id: 'd1' }], last: false } })
    .mockResolvedValueOnce({ success: true, data: { content: [{ id: 'd2' }], last: true } })
  const rows = await loadAllDiagramReferences('m', { nodeId: 'n' }, fetch)
  expect(rows.map(r => r.id)).toEqual(['d1', 'd2'])
  expect(fetch).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Компонент группы**

Карточка: тип + имя + бейдж count. Список членов (`id ASC` как в ответе). `parentName` серым. Keep = radio. У остальных кнопка «Слить в выбранный» → emit `{ keepId, dropId }`.

Чипы диаграмм: грузить references при первом раскрытии члена (`useAllDiagramReferences`). Клик чипа:

```ts
router.push({
  name: 'model-editor',
  params: { id: modelId },
  query: { diagramId, nodeId } // или linkId для группы связей
})
```

Клик по имени узла:

```ts
router.push({ name: 'model-editor', params: { id: modelId }, query: { nodeId } })
```

- [ ] **Step 3: Vitest + commit**

```bash
npx vitest run src/features/models-validation
git commit -m "Render validation duplicate groups with diagram chips."
```

---

### Task 9: Мастер merge

**Files:**

- Create: `warchi/src/features/models-validation/utils/typePropertiesDiff.ts`
- Create: `warchi/src/features/models-validation/utils/typePropertiesDiff.test.ts`
- Create: `warchi/src/features/models-validation/components/ValidationMergeWizard.vue`

- [ ] **Step 1: Тест diff**

```ts
it('builds rows and default picks keep when values differ', () => {
  const rows = buildTypePropertyDiff({ a: 1, shared: 'x' }, { b: 2, shared: 'x' })
  expect(rows.filter(r => r.same).map(r => r.key)).toEqual(['shared'])
  expect(rows.find(r => r.key === 'a')?.choice).toBe('keep')
})
```

Собрать итоговый объект: все ключи keep∪drop; same → значение keep; иначе выбранная сторона. Не включать `documentFileId`.

- [ ] **Step 2: Мастер на BaseModal, 3 шага**

1. Таблица поле / A / B / итог; same свёрнуты.
2. Только узлы: checkbox на `uniqueLinks`; текст про `linksToDelete` и `diagramsToReparentCount`.
3. Подтверждение + `hasDocuments` warning.

Submit: `mergeNodes` / `mergeLinks` с `keepUpdatedAt` / `dropUpdatedAt` из preview Task 3.

Успех: emit `merged` → родитель закрывает модалку и заново `fetchValidationReport`. 409: показать `t('models.validationReportConflict')`, кнопка «Обновить отчёт», POST не ретраить.

- [ ] **Step 3: Тесты diff + commit**

```bash
npx vitest run src/features/models-validation
git commit -m "Add validation merge wizard with typeProperties diff."
```

---

### Task 10: Фокус editor по nodeId / linkId

**Files:**

- Modify: `warchi/src/features/models/ModelEditor.vue`
- Modify: существующий composable route navigation рядом с `useModelEditorRouteNavigation` (найти файл через grep `useModelEditorRouteNavigation`)
- Test: существующий `*RouteNavigation*.test.ts` или новый рядом

- [ ] **Step 1: Падающий тест навигации**

При `query.nodeId` без `diagramId`: вызывается догрузка предков + `focusNode`, `applyDiagramSelection` не вызывается.

При `query.diagramId` + `nodeId`: текущий diagram path + после него `selectedNodeId` / `focusNode`.

При `query.linkId` + `diagramId`: после открытия диаграммы `selectedModelLinkId = linkId`.

- [ ] **Step 2: Реализовать минимально**

Расширить `useModelEditorRouteNavigation` query `nodeId` / `linkId` (string | ''). Не изобретать второй router-watch. Lock диаграммы — только если есть `diagramId` (уже так при открытии холста).

- [ ] **Step 3: Тесты + commit**

```bash
npx vitest run src/features/models
git commit -m "Focus model editor from validation report query params."
```

---

### Task 11: Справка in-app

**Files:**

- Modify: `warchi/src/features/docs/content/models.md`
- Modify: `warchi/src/features/docs/content/models.en.md`

- [ ] **Step 1: Секция «Валидация»**

После блока про матрицу / тулбар: кнопка валидации, две проверки, мастер слияния, что скрипты диаграммы — отдельно. Без упоминания runner и ключей.

- [ ] **Step 2: Commit**

```bash
git commit -m "Document model validation report in in-app help."
```

---

## Порядок и зависимости

```
Task 0 ветки
  → Task 1 report
  → Task 2 linkId references
  → Task 3 preview (нужен report-дубликат check)
  → Task 4 merge-nodes
  → Task 5 merge-links
  → Task 6 client (нужны стабильные URL)
  → Task 7 page shell
  → Task 8 groups (нужен client + references)
  → Task 9 wizard (нужен preview + merge)
  → Task 10 editor query
  → Task 11 docs
```

Task 2 можно параллелить с Task 1 после веток. Frontend не начинать до зелёного Task 3 (preview отдаёт `updatedAt` и списки связей).

## Покрытие spec

| Spec | Task |
|---|---|
| GET validation-report, grouping, parentName, cap 50 | 1 |
| Directory / deleted вне выборки | 1 |
| diagram-references nodeId xor linkId, paging | 2, 8 |
| preview unique / matching / AB, typeProperties, hasDocuments, reparent count | 3 |
| merge nodes rules + sync events + lock | 4 |
| merge links | 5 |
| страница, кнопка, не full-load | 7 |
| группы, чипы, клики | 8, 10 |
| мастер diff / transfer / 409 | 9 |
| возврат в editor — обычный mount | 7 (отдельный route) |
| i18n ru+en | 7, 9 |
| in-app docs | 11 |
| не скрипты / не ключи / не runner | границы, ничего не делать |

## Проверка плана

- Плейсхолдеров TBD нет.
- Имена полей `typeProperties` / `transferLinkIds` / `keepUpdatedAt` совпадают в Tasks 3–9.
- Preview обязан отдать `keepUpdatedAt` и `dropUpdatedAt` — это часть Task 3 DTO, не «добавить потом».

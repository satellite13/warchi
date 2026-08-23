# Stage 3 Lazy Model Editor Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открывать редактор большой модели через materialized tree/diagram
scopes без автоматической полной загрузки nodes и links.

**Architecture:** Backend предоставляет model-scoped lazy tree, batch resolve,
ancestors и graph endpoints. Frontend сохраняет совместимые arrays как
materialized subset, но все записи проходят через partial store с явными
`partial`, `childrenPage`, `childrenScope` и `full` merge modes. Полные снимки
остаются detached read models для validation/matrix/compare.

**Tech Stack:** Kotlin/Spring Boot/PostgreSQL/Liquibase/JUnit/Testcontainers;
Vue 3/TypeScript/Vitest/Playwright.

**Design:** `docs/large-model-editor-load-stage-3-design.md`

---

## Правила выполнения

- Одинаковая ветка `feat/large-model-editor-load-stage-3` в `warchi` и
  `arepos-server`.
- Каждый task выполняется RED → GREEN → REFACTOR.
- Существующие full-list endpoints не удалять: они нужны detached consumers.
- Не отключать background full links до готовности diagram scope.
- После каждого task: focused tests, spec review, quality review, отдельный commit.

## Task 1: Backend lazy-tree query

**Files:**
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/model/ModelDtos.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/mapper/ModelMapper.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/NodesController.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/NodesRepository.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelTreeQueryService.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/NodesControllerTest.kt`
- Test: `arepos-server/src/test/kotlin/ru/kavader/arepos/repository/NodesRepositoryTest.kt`

- [ ] **Step 1: Add failing DTO/repository tests**

Зафиксировать `NodeResponse.hasChildren: Boolean? = null` и projection:

```kotlin
interface NodeTreePageProjection {
    fun getId(): UUID
    fun getHasChildren(): Boolean
}
```

Тесты: `treeOrder,id`; parent-only total; `excludeSystem`; `foldersOnly`; при
`foldersOnly=true` `hasChildren` учитывает только Directory; Page 1 не повторяет
Page 0.

- [ ] **Step 2: Verify RED**

```bash
./gradlew test --tests "*NodesRepositoryTest"
```

Expected: compilation/test failure — projection/query отсутствуют.

- [ ] **Step 3: Implement one ACL-safe parent query**

```kotlin
fun findDirectChildrenPage(
    modelId: UUID,
    parentNodeId: UUID?,
    excludeSystem: Boolean,
    foldersOnly: Boolean,
    pageable: Pageable,
): Page<NodeTreePageProjection>
```

Native SQL ограничивает model/parent, сортирует
`COALESCE((attrs->>'treeOrder')::int,0),id`; correlated `EXISTS` повторяет
visibility/folder predicates. `countQuery` повторяет filters без order.

- [ ] **Step 4: Add failing controller/service tests**

Покрыть configured root, legacy NULL root, dangling root `409`, parent другой
модели `404`, parent без model `400`, owner/shared/admin/MCP одинаковые
ids/order/total, stranger `403`, full list без parent не меняется.

- [ ] **Step 5: Implement service/controller**

```kotlin
fun listChildren(
    modelId: UUID,
    parentRef: String,
    excludeSystem: Boolean,
    foldersOnly: Boolean,
    pageable: Pageable,
): Page<NodeResponse>
```

`requireCanViewModel` выполняется до query. Scoped page size: 1..500,
caller sort игнорируется.

- [ ] **Step 6: Verify GREEN**

```bash
./gradlew test --tests "*NodesRepositoryTest" --tests "*NodesControllerTest"
```

- [ ] **Step 7: Commit backend task**

```bash
git add src/main src/test
git commit -m "Add lazy model tree queries."
```

## Task 2: Frontend scoped API and pure partial store

**Files:**
- Modify: `warchi/src/types/api.ts`
- Modify: `warchi/src/api/queryHelpers.ts`
- Create: `warchi/src/features/models/composables/modelScopedApi.ts`
- Create: `warchi/src/features/models/composables/modelScopedApi.test.ts`
- Create: `warchi/src/features/models/utils/modelPartialStore.ts`
- Create: `warchi/src/features/models/utils/modelPartialStore.test.ts`
- Modify: `warchi/src/features/models/types.ts`

- [ ] **Step 1: Write API contract RED tests**

```typescript
export const MODEL_TREE_PAGE_SIZE = 500
export const MODEL_RESOLVE_CHUNK_SIZE = 2000

export type TreeParentScope =
  | { kind: 'root' }
  | { kind: 'node'; nodeId: string }
```

Проверить root/folders query, page/size, AbortSignal и chunking
2000/2000/remainder без дубликатов.

- [ ] **Step 2: Implement minimal scoped API**

Добавить `fetchNodeChildren`, `resolveModelNodes`, `resolveModelLinks`,
`fetchNodeAncestors`, `searchModelNodes`, `fetchGraphNeighbors`,
`fetchDiagramReferences`.

- [ ] **Step 3: Write merge RED tests**

```typescript
type EntityMergeMode =
  | { kind: 'partial' }
  | { kind: 'childrenPage'; scope: TreeParentScope; page: number; total: number; last: boolean; token: number }
  | { kind: 'childrenScope'; scope: TreeParentScope; token: number }
  | { kind: 'full' }
```

Проверить: page 1 не удаляет page 0; reconcile только complete scope; dirty
побеждает remote; stale token/generation no-op; tombstone блокирует resurrection.

- [ ] **Step 4: Implement `ModelPartialStore`**

Store владеет arrays/indexes/pages/completeness/tombstones. Все array replacement
идут через store.

- [ ] **Step 5: Verify**

```bash
npx vitest run \
 src/features/models/composables/modelScopedApi.test.ts \
 src/features/models/utils/modelPartialStore.test.ts \
 src/features/models/utils/modelEntityMerge.test.ts
```

- [ ] **Step 6: Commit frontend task**

```bash
git add src
git commit -m "Add partial model editor store."
```

## Task 3: Frontend lazy root and tree

**Files:**
- Create: `warchi/src/features/models/composables/useModelPartialStore.ts`
- Modify: `warchi/src/features/models/composables/modelEditorLoadModel.ts`
- Modify: `warchi/src/features/models/composables/useModelEditor.ts`
- Modify: `warchi/src/features/models/components/ModelTreePalettePanel.vue`
- Modify: `warchi/src/features/models/composables/useTreeSearch.ts`
- Test: corresponding `*.test.ts`

- [ ] **Step 1: RED lifecycle tests**

Два expand одного parent → один GET; model A response игнорируется после B;
retry локален; reset отменяет paging.

- [ ] **Step 2: Implement scoped loader**

Public API: `loadChildren`, `loadNextChildrenPage`, `refreshChildrenScope`,
`ensureChildrenScopeComplete`, `resetPartialScopes`.

- [ ] **Step 3: RED shell tests**

Shell вызывает только `parentId=root` + slim diagrams; `/links` отсутствует;
`initialSnapshotReady=true` после shell, catalog readiness независим.

- [ ] **Step 4: Switch normal opening to root shell**

`loadModelEditorData` оставить full escape hatch. Старый background links helper
не удалять до Task 6.

- [ ] **Step 5: RED tree UI tests**

Первый expand emits request; complete scope повторно не грузится; `hasChildren=false`
скрывает toggle; loading/error/load-more rows не draggable.

- [ ] **Step 6: Implement tree paging UI**

Page size 500, «Загрузить ещё», local retry/error, async `focusNode`.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run \
 src/features/models/composables/useModelPartialStore.test.ts \
 src/features/models/composables/modelEditorLoadModel.test.ts \
 src/features/models/components/ModelTreePalettePanel.test.ts \
 src/features/models/composables/useTreeSearch.test.ts
git add src
git commit -m "Load model tree scopes lazily."
```

## Task 4: Safe tree mutations and lazy copy folders

**Files:**
- Modify: `warchi/src/features/models/composables/useModelTreeOperations.ts`
- Modify: `warchi/src/features/models/composables/useModelDiagramInstances.ts`
- Create: `warchi/src/features/models/composables/useLazyFolderTree.ts`
- Modify: `warchi/src/features/models/components/DiagramCopyWizard.vue`
- Create: `warchi/src/features/models/composables/useModelTreeOperations.test.ts`
- Create: `warchi/src/features/models/composables/useLazyFolderTree.test.ts`
- Modify: `warchi/src/features/models/components/DiagramCopyWizard.test.ts`

- [ ] RED: create/move waits for complete siblings; failure leaves state unchanged.
- [ ] Implement parent-scoped `reindexTreeOrders(parentId)`.
- [ ] RED: copy target requests root folders then direct folder children only.
- [ ] Replace full target `/nodes` with `foldersOnly=true` lazy picker.
- [ ] Verify and commit:

```bash
npx vitest run \
 src/features/models/composables/useModelTreeOperations.test.ts \
 src/features/models/composables/useLazyFolderTree.test.ts \
 src/features/models/components/DiagramCopyWizard.test.ts
git add src
git commit -m "Load model folder trees lazily."
```

## Task 5: Backend resolve APIs and indexes

**Files:**
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/model/ModelResolveDtos.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelResolveController.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelResolveService.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/NodesRepository.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt`
- Create: `arepos-server/src/main/resources/db/changelog/055-large-model-link-read-indexes.sql`
- Modify: `arepos-server/src/main/resources/db/changelog/db.changelog-master.yaml`
- Create: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ModelResolveControllerTest.kt`
- Modify: `arepos-server/src/test/kotlin/ru/kavader/arepos/repository/LinksRepositoryTest.kt`

- [ ] RED: order/missing/foreign/empty/2001/dedup/ACL tests.
- [ ] Implement validated request/response DTOs and model-scoped service.
- [ ] Bound the resulting links union to 5,000; detect `limit + 1` before entity
  materialization and return `413 MODEL_LINK_RESOLVE_RESULT_LIMIT_EXCEEDED`
  without a partial response.
- [ ] Add `(model,source)` and `(model,target)` indexes and changelog entry.
- [ ] Verify:

```bash
./gradlew test --tests "*ModelResolveControllerTest" --tests "*LinksRepositoryTest"
```

- [ ] Commit: `Add bounded model entity resolve APIs.`

## Task 6: Frontend diagram scope

**Files:**
- Create: `warchi/src/features/models/composables/useDiagramScope.ts`
- Modify: `warchi/src/features/models/composables/ensureDiagramAttrs.ts`
- Modify: `warchi/src/features/models/ModelEditor.vue`
- Test: `useDiagramScope.test.ts`, attrs/load tests

- [ ] RED: 4501 ids chunk 2000/2000/501; only attrs IDs/incident links;
  dirty preserved; stale/cancel no-op.
- [ ] Implement hydrate → resolve nodes/links → resolve missing endpoints → partial merge.
- [ ] Replace selected-diagram watcher; expose local progress/error.
- [ ] Remove normal background full links only after tests pass.
- [ ] Verify and commit: `Resolve active diagram scope lazily.`

## Task 7: Backend ancestors and frontend search/deep-link

**Backend files:**
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelNavigationController.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelAncestorService.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/NodesRepository.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/SearchService.kt`
- Test: `ModelNavigationControllerTest.kt`, `SearchControllerTest.kt`

**Frontend files:**
- Create: `warchi/src/features/models/composables/useLazyTreeSearch.ts`
- Modify: `warchi/src/features/models/composables/useModelEditorRouteNavigation.ts`
- Modify: `warchi/src/features/models/components/ModelTreePalettePanel.vue`
- Modify: `warchi/src/features/models/composables/useModelSelection.ts`
- Test: corresponding colocated `*.test.ts`

- [ ] Backend RED: ordered ancestors, hidden root, depth 256, cycle `409`,
  foreign `404`, search excludes system.
- [ ] Implement `GET /models/{id}/nodes/{nodeId}/ancestors`.
- [ ] Frontend RED: server search, ancestor partial merge, stale query ignored,
  deep-link canvas before tree focus, selection point resolve.
- [ ] Implement search debounce 200ms and ancestor expansion.
- [ ] Verify `ModelNavigationControllerTest`, `SearchControllerTest`,
  `useLazyTreeSearch.test.ts`, `useModelEditorRouteNavigation.test.ts` and
  `useModelSelection.test.ts`.
- [ ] Commit backend `Add bounded model ancestor paths.`
- [ ] Commit frontend `Load model search paths lazily.`

## Task 8: Granular WS and bounded poll

**Files:**
- Create: `warchi/src/features/models/utils/modelGranularSyncReconciler.ts`
- Create: `warchi/src/features/models/composables/useBoundedModelReconcile.ts`
- Modify: `warchi/src/features/models/composables/useModelLiveSync.ts`
- Test: granular/coalesce/live sync/reconcile tests

- [ ] RED granular: no unscoped fetch; dirty wins; delete tombstone; stale point
  GET blocked; unknown invalidates known scope.
- [ ] Replace STOMP full pull with granular reconciler.
- [ ] RED poll: unchanged `updatedAt` no requests; changed revision refreshes
  slim diagrams, visible parent pages and open diagram only.
- [ ] Implement bounded poll/visibility/auth reconciliation.
- [ ] Backend regression test: broadcast increments model `updatedAt`.
- [ ] Remove `executeRemoteSnapshotPull` normal path.
- [ ] Verify and commit frontend/backend separately.

## Task 9: Backend graph and diagram references

**Files:**
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/model/ModelTraceabilityDtos.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/ModelTraceabilityController.kt`
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ModelTraceabilityService.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/repository/DiagramsRepository.kt`
- Create: `arepos-server/src/main/resources/db/changelog/056-diagram-reference-indexes.sql`
- Modify: `arepos-server/src/main/resources/db/changelog/db.changelog-master.yaml`
- Create: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ModelTraceabilityControllerTest.kt`
- Modify: repository tests for links and diagrams

- [ ] RED graph direction/type/order/Page/ACL/foreign/size.
- [ ] Implement direct neighbors Page `{link,node}`.
- [ ] RED diagram references JSON path/deleted/model/slim/order/Page/ACL.
- [ ] Implement JSONPath query and indexes.
- [ ] Verify and commit backend tasks independently.

## Task 10: Frontend lazy traceability

**Files:**
- Create: `warchi/src/features/models/composables/useLazyTraceability.ts`
- Modify: traceability panel/branch components
- Test: composable/components

- [ ] RED: selected node does not scan global links; branch states independent;
  direction/type forwarded; cycle no request; diagrams use reference endpoint.
- [ ] Implement paged branch key `nodeId+direction+linkTypeId+page`.
- [ ] Add load-more/retry and partial merge returned nodes/links.
- [ ] Verify and commit: `Page model traceability lazily.`

## Task 11: Detached validation and scoped reload

**Files:**
- Create: `warchi/src/features/models/composables/useDetachedModelSnapshot.ts`
- Create: `warchi/src/features/models/utils/applyLocalModelDelta.ts`
- Create: `warchi/src/features/models/composables/useModelScopedReload.ts`
- Modify: `warchi/src/features/models/ModelEditor.vue`
- Modify: `warchi/src/features/validation-scripts/sandbox/buildValidationSnapshot.ts`
- Modify: `warchi/src/features/models/composables/useModelBatchConflictResolution.ts`
- Modify: `warchi/src/features/models/composables/discardUnsavedModelChanges.ts`
- Modify: `warchi/src/features/models/composables/useOefImport.ts`
- Test: colocated detached/delta/reload/conflict/discard/OEF tests

- [ ] RED local dirty/new/deleted overlay and editor arrays unchanged.
- [ ] Implement cancellable full snapshot + local delta.
- [ ] RED conflict/OEF/discard/lock reloads avoid full nodes/links and reopen diagram.
- [ ] Implement common partial reset coordinator.
- [ ] Verify and commit in two GREEN commits.

## Task 12: Defaults and remaining consumers

**Files:**
- Modify: `warchi/src/features/models/ModelEditor.vue`
- Modify: `warchi/src/features/models/utils/syncDefaultsOnLoad.ts`
- Modify: `warchi/src/features/models/composables/modelEditorSaveCoordinator.ts`
- Test: `syncDefaultsOnLoad.test.ts`, `modelEditorSaveCoordinator.test.ts`,
  `useModelBatchSave.test.ts`, `useModelEditor.test.ts`

- [ ] RED: normal open does not run global defaults; materialized row receives defaults.
- [ ] Apply defaults in mappers/create/bind paths; remove global schedule.
- [ ] Проверить и классифицировать найденные `state.value.nodes/links` consumers:
  tree/selection/canvas используют partial store; matrix/compare/validation
  используют explicit detached/full loaders; прямой unscoped merge запрещён.
- [ ] Verify batch-save contains only materialized dirty/new/deleted.
- [ ] Run full unit tests, lint and build.

## Task 13: Integration, benchmark and docs

- [ ] Add Playwright network assertions for root, expand, diagram, sync, copy and trace.
- [ ] Run backend full build and frontend full suite.
- [ ] Deploy local Kubernetes.
- [ ] Benchmark model `6ce1a460-9863-41d3-8a26-74fe643f83b8`.
- [ ] Record opening/expand/diagram/sync network, heap, long tasks and lock p95.
- [ ] Require no unscoped opening `/nodes`/`/links`, heap below 339 MiB,
  max long task <2s, lock p95 <1s.
- [x] Update design, help and changelogs.

```bash
./gradlew build
npm run test -- --run
npm run lint
npm run build
npm run test:e2e -- tests/model-editor-lazy-load.spec.ts
```

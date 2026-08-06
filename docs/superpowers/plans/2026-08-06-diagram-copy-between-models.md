# Copy diagram between models — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user copy one diagram version into an existing target model via a wizard, with server-side preview matching and an atomic commit.

**Architecture:** arepos-server owns match/validation/remap/transactional create behind `POST …/diagram-copies/preview` and `…/commit`. warchi provides a multi-step wizard (target → elements → notation report → confirm) and navigates to the new diagram. Remap reuses `DiagramAttrsRemapper` plus notation component/relation remap-by-name (same idea as warchi’s `migrateDiagramNotation.ts`).

**Tech Stack:** Kotlin/Spring Boot (arepos-server), Vue 3 + TypeScript + Vitest (warchi), PostgreSQL/Testcontainers

**Spec:** `docs/superpowers/specs/2026-08-04-diagram-copy-between-models-design.md`

**Branches:** `feat/diagram-copy-between-models` in **warchi** and **arepos-server** (papirus unchanged)

### Spec clarification (links have no `name`)

`Links` has no name field. Implement link auto-match as:

1. Exact `stableId` in target model  
2. Else unique target link with same `linkTypeId` whose source/target nodes auto-match the source link’s endpoints (by the node rules: `stableId`, else name+`nodeTypeId`)

UI label for a link: `{sourceName} → {targetName}`.

---

## File map

### arepos-server — Create

| File | Responsibility |
|------|----------------|
| `src/main/kotlin/ru/kavader/arepos/dto/model/DiagramCopyDtos.kt` | Preview/commit request & response DTOs |
| `src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyMatcher.kt` | Pure-ish match + blocker computation |
| `src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyNotationRemapper.kt` | Component/relation id remap by name; strip `documentFileId` |
| `src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyService.kt` | Preview + `@Transactional` commit |
| `src/test/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyMatcherTest.kt` | Unit tests for match/blockers |
| `src/test/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyNotationRemapperTest.kt` | Unit tests for notation remap |
| `src/test/kotlin/ru/kavader/arepos/controller/DiagramCopyControllerTest.kt` | Integration tests for preview/commit |

### arepos-server — Modify

| File | Change |
|------|--------|
| `src/main/kotlin/ru/kavader/arepos/controller/ModelsController.kt` | Wire `POST /{targetModelId}/diagram-copies/preview` and `…/commit` |
| `src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt` | Add `findByModelIdAndStableIdIn` (mirror nodes) if missing |

### warchi — Create

| File | Responsibility |
|------|----------------|
| `src/features/models/composables/diagramCopyApi.ts` | `previewDiagramCopy` / `commitDiagramCopy` + TS types |
| `src/features/models/composables/useDiagramCopyWizard.ts` | Wizard state, preview refresh, commit |
| `src/features/models/components/DiagramCopyWizard.vue` | Multi-step modal UI |
| `src/features/models/composables/diagramCopyApi.test.ts` | Unit tests for Finish-disabled / resolution helpers if extracted |
| `src/features/models/composables/useDiagramCopyWizard.test.ts` | Wizard logic tests (mocked API) |

### warchi — Modify

| File | Change |
|------|--------|
| `src/features/models/components/ModelTreePalettePanel.vue` | Button/emit `copyDiagramToModel` |
| `src/features/models/ModelEditor.vue` | Open wizard, mount component, handle success nav |
| `src/features/models/composables/index.ts` | Re-export wizard composable if needed |
| `src/i18n/locales/models.ts` | `models.diagramCopy*` ru/en |
| `src/features/docs/content/diagrams.md` (+ `.en.md` if exists) | Short note on copy-to-model |

---

### Task 1: Feature branches

**Files:** git only (warchi + arepos-server)

- [ ] **Step 1: Ensure matching feature branches**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git checkout feat/diagram-copy-between-models

cd /Users/nikolaygroznyh/Work/arepos-server
git checkout feat/diagram-copy-between-models || git checkout -b feat/diagram-copy-between-models master
```

Expected: both repos on `feat/diagram-copy-between-models`.

- [ ] **Step 2: Commit N/A**

---

### Task 2: DTOs (arepos-server)

**Files:**
- Create: `src/main/kotlin/ru/kavader/arepos/dto/model/DiagramCopyDtos.kt`

- [ ] **Step 1: Add DTOs**

```kotlin
package ru.kavader.arepos.dto.model

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.util.UUID

enum class DiagramCopyMatchReason { STABLE_ID, NAME_AND_TYPE, ENDPOINTS_AND_TYPE }

enum class DiagramCopyResolutionAction { MATCH, CREATE, SKIP }

data class DiagramCopyResolution(
    @field:NotNull val sourceId: UUID,
    @field:NotNull val action: DiagramCopyResolutionAction,
    val targetId: UUID? = null, // required when action == MATCH
    val kind: DiagramCopyEntityKind
)

enum class DiagramCopyEntityKind { NODE, LINK }

data class DiagramCopyPreviewRequest(
    @field:NotNull val sourceDiagramId: UUID,
    @field:NotNull val targetNotationId: UUID,
    val resolutions: List<DiagramCopyResolution> = emptyList()
)

data class DiagramCopyCommitRequest(
    @field:NotNull val sourceDiagramId: UUID,
    @field:NotNull val targetNotationId: UUID,
    @field:NotBlank val name: String,
    @field:NotBlank val version: String,
    val nodeId: UUID? = null, // diagram folder in target tree
    val createParentNodeId: UUID? = null, // parent for created nodes (v1 folder/root)
    @field:NotNull val resolutions: List<DiagramCopyResolution>
)

data class DiagramCopyCandidate(
    val id: UUID,
    val label: String,
    val stableId: UUID?,
    val typeId: UUID?
)

data class DiagramCopyEntityPreview(
    val sourceId: UUID,
    val kind: DiagramCopyEntityKind,
    val label: String,
    val stableId: UUID?,
    val typeId: UUID?,
    val autoMatchTargetId: UUID? = null,
    val autoMatchReason: DiagramCopyMatchReason? = null,
    val candidates: List<DiagramCopyCandidate> = emptyList(),
    val effectiveAction: DiagramCopyResolutionAction? = null,
    val effectiveTargetId: UUID? = null,
    val isEndpointOfEdge: Boolean = false
)

data class DiagramCopyEdgeBlocker(
    val edgeInstanceId: String,
    val modelLinkId: UUID?,
    val sourceModelNodeId: UUID?,
    val targetModelNodeId: UUID?,
    val reason: String
)

data class DiagramCopyNotationRemapReport(
    val mappedComponents: Int,
    val unmappedComponents: List<String>,
    val mappedRelations: Int,
    val unmappedRelations: List<String>
)

data class DiagramCopyWarning(
    val code: String,
    val message: String
)

data class DiagramCopyPreviewResponse(
    val sourceDiagramId: UUID,
    val sourceDiagramName: String,
    val sourceDiagramVersion: String,
    val suggestedName: String,
    val suggestedVersion: String,
    val nodes: List<DiagramCopyEntityPreview>,
    val links: List<DiagramCopyEntityPreview>,
    val blockers: List<DiagramCopyEdgeBlocker>,
    val notationRemap: DiagramCopyNotationRemapReport,
    val warnings: List<DiagramCopyWarning>,
    val canCommit: Boolean
)

data class DiagramCopyCommitResponse(
    val diagram: DiagramResponse,
    val createdNodeIds: List<UUID>,
    val createdLinkIds: List<UUID>
)
```

- [ ] **Step 2: Compile check**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew compileKotlin -q
```

Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/main/kotlin/ru/kavader/arepos/dto/model/DiagramCopyDtos.kt
git commit -m "$(cat <<'EOF'
feat: add DTOs for diagram copy preview/commit

EOF
)"
```

---

### Task 3: Matcher unit tests + implementation

**Files:**
- Create: `src/test/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyMatcherTest.kt`
- Create: `src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyMatcher.kt`

- [ ] **Step 1: Write failing unit tests**

Cover at least:

```kotlin
@Test
fun `node matches by stableId over name`() { ... }

@Test
fun `node matches by name and type when stableId missing`() { ... }

@Test
fun `ambiguous name and type leaves unresolved with candidates`() { ... }

@Test
fun `link matches by stableId`() { ... }

@Test
fun `link matches by type and matched endpoints`() { ... }

@Test
fun `edge blocker when endpoint skipped`() { ... }

@Test
fun `canCommit false while blockers present`() { ... }
```

Use plain data holders inside the matcher API (not JPA entities) so tests stay fast:

```kotlin
data class MatchableNode(
    val id: UUID,
    val stableId: UUID,
    val name: String,
    val nodeTypeId: UUID,
    val deleted: Boolean = false
)

data class MatchableLink(
    val id: UUID,
    val stableId: UUID,
    val linkTypeId: UUID,
    val sourceNodeId: UUID,
    val targetNodeId: UUID,
    val deleted: Boolean = false
)

data class DiagramEdgeRef(
    val edgeInstanceId: String,
    val modelLinkId: UUID?,
    val sourceModelNodeId: UUID?,
    val targetModelNodeId: UUID?
)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./gradlew test --tests "ru.kavader.arepos.service.diagramcopy.DiagramCopyMatcherTest"
```

Expected: FAIL (class missing or stub).

- [ ] **Step 3: Implement matcher**

```kotlin
package ru.kavader.arepos.service.diagramcopy

import org.springframework.stereotype.Component
import ru.kavader.arepos.dto.model.*
import java.util.UUID

@Component
class DiagramCopyMatcher {

    fun buildPreview(
        sourceNodes: List<MatchableNode>,
        sourceLinks: List<MatchableLink>,
        targetNodes: List<MatchableNode>,
        targetLinks: List<MatchableLink>,
        edges: List<DiagramEdgeRef>,
        resolutions: List<DiagramCopyResolution>
    ): MatcherResult {
        // 1) Auto-match nodes: stableId, else unique name+type
        // 2) Auto-match links: stableId, else unique linkTypeId + both endpoints auto-matched
        // 3) Apply resolutions overlay (MATCH/CREATE/SKIP)
        // 4) Compute blockers for edges whose ends are not MATCH/CREATE
        // 5) canCommit = blockers.isEmpty() && every referenced node/link has effective action
        ...
    }
}
```

Rules to encode exactly:

- One target entity may only be claimed once in auto-match (first wins by deterministic sort on source id).  
- Ambiguity (>1 candidate) → no auto-match, expose `candidates`.  
- `isEndpointOfEdge` true if node id appears as endpoint of any edge with a `modelLinkId` being copied (or edge endpoints from instance graph).  
- `SKIP` on an endpoint ⇒ blocker.

- [ ] **Step 4: Run tests — expect PASS**

```bash
./gradlew test --tests "ru.kavader.arepos.service.diagramcopy.DiagramCopyMatcherTest"
```

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyMatcher.kt \
        src/test/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyMatcherTest.kt
git commit -m "$(cat <<'EOF'
feat: add diagram-copy entity matcher with blockers

EOF
)"
```

---

### Task 4: Notation remapper + strip documents

**Files:**
- Create: `src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyNotationRemapper.kt`
- Create: `src/test/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyNotationRemapperTest.kt`

- [ ] **Step 1: Failing tests**

```kotlin
@Test
fun `remaps instance notationComponentId by component name`() { ... }

@Test
fun `unmapped component becomes warning and clears binding`() { ... }

@Test
fun `strips documentFileId and reports warning`() { ... }

@Test
fun `remaps notationComponents keys on node attrs from sourceNotationId to targetNotationId`() { ... }
```

- [ ] **Step 2: Run — FAIL**

```bash
./gradlew test --tests "ru.kavader.arepos.service.diagramcopy.DiagramCopyNotationRemapperTest"
```

- [ ] **Step 3: Implement**

Use Jackson `ObjectMapper` (inject). Build component/relation maps like warchi `buildComponentIdRemap` / `buildRelationIdRemap` (unique name, else name+type).

Public API sketch:

```kotlin
@Component
class DiagramCopyNotationRemapper(private val objectMapper: ObjectMapper) {
    fun remapDiagramAttrs(
        attrs: String?,
        componentIdMap: Map<UUID, UUID>,
        relationIdMap: Map<UUID, UUID>
    ): RemapAttrsResult // attrs + warnings

    fun remapNodeAttrs(
        attrs: String?,
        sourceNotationId: UUID,
        targetNotationId: UUID,
        componentIdMap: Map<UUID, UUID>
    ): RemapAttrsResult

    fun remapLinkAttrs(
        attrs: String?,
        sourceNotationId: UUID,
        targetNotationId: UUID,
        relationIdMap: Map<UUID, UUID>
    ): RemapAttrsResult

    fun buildComponentIdMap(source: List<Components>, target: List<Components>): Pair<Map<UUID, UUID>, List<String>>
    fun buildRelationIdMap(source: List<Relations>, target: List<Relations>): Pair<Map<UUID, UUID>, List<String>>
}
```

Strip top-level `documentFileId` from diagram attrs always in v1.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: remap notation bindings for diagram copy

EOF
)"
```

---

### Task 5: DiagramCopyService preview + commit

**Files:**
- Create: `src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyService.kt`
- Modify: `src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt` (add stableId query if needed)

- [ ] **Step 1: Add repository helper if missing**

```kotlin
// LinksRepository.kt
fun findByModelIdAndStableIdIn(modelId: UUID, stableIds: Collection<UUID>): List<Links>
```

(If Spring Data naming works without custom `@Query`, prefer derived method. Mirror `NodesRepository.findByModelIdAndStableIdIn`.)

- [ ] **Step 2: Implement service**

```kotlin
@Service
class DiagramCopyService(
    private val diagramsRepository: DiagramsRepository,
    private val modelsRepository: ModelsRepository,
    private val nodesRepository: NodesRepository,
    private val linksRepository: LinksRepository,
    private val notationsRepository: NotationsRepository,
    private val componentsRepository: ComponentsRepository,
    private val relationsRepository: RelationsRepository,
    private val nodeTypesRepository: NodeTypesRepository,
    private val linkTypesRepository: LinkTypesRepository,
    private val accessService: ResourceAccessService,
    private val ownerResolutionService: OwnerResolutionService,
    private val matcher: DiagramCopyMatcher,
    private val notationRemapper: DiagramCopyNotationRemapper,
    private val diagramAttrsRemapper: DiagramAttrsRemapper,
    private val modelMapper: ModelMapper,
    private val objectMapper: ObjectMapper,
    private val mdFileLinkValidator: MdFileLinkValidator
) {
    fun preview(targetModelId: UUID, request: DiagramCopyPreviewRequest): DiagramCopyPreviewResponse

    @Transactional
    fun commit(targetModelId: UUID, request: DiagramCopyCommitRequest): DiagramCopyCommitResponse
}
```

**preview algorithm:**

1. Load source diagram; `requireCanViewDiagram` / view model.  
2. `requireCanEditModel(target)`.  
3. Load `targetNotation`; `requireCanReferenceNotationForModelDiagram`.  
4. Parse diagram attrs → collect referenced `modelNodeId` / `modelLinkId` (+ edge endpoint node ids from linked model links and instance ends).  
5. Load those source nodes/links; load all non-deleted target nodes/links (or at least candidates by stableId + name).  
6. Load source/target components & relations for remap report.  
7. `matcher.buildPreview(...)` with optional resolutions.  
8. Suggest diagram name = source name; version = next free version in target for that name (scan existing versions, bump patch/minor simply: if `"1.0.0"` taken try `"1.0.1"` / use same helper as elsewhere if present).  
9. Warnings: document strip, unbound notation, create-type missing later.  
10. `canCommit` from matcher.

**commit algorithm (one transaction):**

1. Re-run authz + build effective resolutions (must cover every referenced node/link).  
2. If blockers → `400`.  
3. If `existsByModelAndNameAndVersion` → `409`.  
4. For each `CREATE` node (deterministic order): copy name/type/attrs (notation-remapped); parent = `createParentNodeId` or target system root if required by model invariants; reuse `stableId` if free else `UUID.randomUUID()`; save; record id map.  
5. For each `CREATE` link: require both ends in id map (match or create); copy type/attrs; stableId same rule; save.  
6. For `SKIP` nodes/links: omit their instances from diagram attrs (filter instances whose model id is skipped).  
7. Remap remaining instances with `diagramAttrsRemapper.remap` using string→UUID maps; then `notationRemapper.remapDiagramAttrs`.  
8. Validate attrs (`mdFileLinkValidator`); save `Diagrams` on target.  
9. Return `DiagramCopyCommitResponse`.  
10. Do **not** mutate source.

Use patterns from `ModelCopyService` for node/link construction and `DiagramEnsureService.createInternal` for diagram row fields (`owner`, `deleted=false`, timestamps).

- [ ] **Step 3: Compile**

```bash
./gradlew compileKotlin compileTestKotlin -q
```

- [ ] **Step 4: Commit**

```bash
git add src/main/kotlin/ru/kavader/arepos/service/diagramcopy/DiagramCopyService.kt \
        src/main/kotlin/ru/kavader/arepos/repository/LinksRepository.kt
git commit -m "$(cat <<'EOF'
feat: implement diagram copy preview and commit service

EOF
)"
```

---

### Task 6: Controller endpoints + integration tests

**Files:**
- Modify: `src/main/kotlin/ru/kavader/arepos/controller/ModelsController.kt`
- Create: `src/test/kotlin/ru/kavader/arepos/controller/DiagramCopyControllerTest.kt`

- [ ] **Step 1: Wire controller**

```kotlin
@PostMapping("/{targetModelId}/diagram-copies/preview")
fun previewDiagramCopy(
    @PathVariable targetModelId: UUID,
    @RequestBody @Valid request: DiagramCopyPreviewRequest
): DiagramCopyPreviewResponse =
    diagramCopyService.preview(targetModelId, request)

@PostMapping("/{targetModelId}/diagram-copies/commit")
@ResponseStatus(HttpStatus.CREATED)
fun commitDiagramCopy(
    @PathVariable targetModelId: UUID,
    @RequestBody @Valid request: DiagramCopyCommitRequest
): DiagramCopyCommitResponse =
    diagramCopyService.commit(targetModelId, request)
```

Inject `DiagramCopyService` into `ModelsController`.

- [ ] **Step 2: Write integration tests** (extend `ControllerIntegrationTest`)

Minimum cases:

1. **Preview stableId match** — same stableId node in target → autoMatchReason `STABLE_ID`, `canCommit` true when edges ok.  
2. **Preview name+type match** — different stableId, same name+type → `NAME_AND_TYPE`.  
3. **Commit match-only** — remaps `modelNodeId`/`modelLinkId`; source diagram attrs unchanged; target has new diagram.  
4. **Commit create node+link** — creates rows; preserves free stableId.  
5. **Commit 400** — resolution SKIP on edge endpoint.  
6. **Authz 403** — user without edit on target.  
7. **409** — diagram name+version exists on target.

Bootstrap like `ModelsControllerTest` copy-model test: create two models, notation, components/relations as needed, nodes/links/diagram attrs JSON with `instances`.

- [ ] **Step 3: Run tests**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.DiagramCopyControllerTest" \
  --tests "ru.kavader.arepos.service.diagramcopy.*"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: expose diagram-copies preview and commit API

EOF
)"
```

---

### Task 7: Frontend API types + client

**Files:**
- Create: `src/features/models/composables/diagramCopyApi.ts`
- Create: `src/features/models/composables/diagramCopyApi.test.ts` (optional small pure helpers)

- [ ] **Step 1: Add client**

```ts
// src/features/models/composables/diagramCopyApi.ts
import { apiPost } from '@/composables/useApi'
import type { DiagramResponse } from '@/types/api'

export type DiagramCopyResolutionAction = 'MATCH' | 'CREATE' | 'SKIP'
export type DiagramCopyEntityKind = 'NODE' | 'LINK'

export interface DiagramCopyResolution {
  sourceId: string
  action: DiagramCopyResolutionAction
  targetId?: string | null
  kind: DiagramCopyEntityKind
}

export interface DiagramCopyPreviewRequest {
  sourceDiagramId: string
  targetNotationId: string
  resolutions?: DiagramCopyResolution[]
}

export interface DiagramCopyCommitRequest {
  sourceDiagramId: string
  targetNotationId: string
  name: string
  version: string
  nodeId?: string | null
  createParentNodeId?: string | null
  resolutions: DiagramCopyResolution[]
}

// Mirror backend preview/commit response fields used by UI…
export interface DiagramCopyPreviewResponse {
  sourceDiagramId: string
  sourceDiagramName: string
  sourceDiagramVersion: string
  suggestedName: string
  suggestedVersion: string
  nodes: DiagramCopyEntityPreview[]
  links: DiagramCopyEntityPreview[]
  blockers: DiagramCopyEdgeBlocker[]
  notationRemap: DiagramCopyNotationRemapReport
  warnings: DiagramCopyWarning[]
  canCommit: boolean
}

export interface DiagramCopyCommitResponse {
  diagram: DiagramResponse
  createdNodeIds: string[]
  createdLinkIds: string[]
}

export async function previewDiagramCopy(
  targetModelId: string,
  body: DiagramCopyPreviewRequest
) {
  return apiPost<DiagramCopyPreviewResponse>(
    `/models/${targetModelId}/diagram-copies/preview`,
    body
  )
}

export async function commitDiagramCopy(
  targetModelId: string,
  body: DiagramCopyCommitRequest
) {
  return apiPost<DiagramCopyCommitResponse>(
    `/models/${targetModelId}/diagram-copies/commit`,
    body
  )
}

export function buildResolutionsFromPreview(
  preview: DiagramCopyPreviewResponse,
  overrides: Map<string, DiagramCopyResolution>
): DiagramCopyResolution[] {
  // For each node/link: override or effectiveAction or default CREATE if unresolved else MATCH
  ...
}
```

- [ ] **Step 2: Unit-test `buildResolutionsFromPreview`**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models/composables/diagramCopyApi.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/features/models/composables/diagramCopyApi.ts \
        src/features/models/composables/diagramCopyApi.test.ts
git commit -m "$(cat <<'EOF'
feat: add diagram copy API client

EOF
)"
```

---

### Task 8: Wizard composable

**Files:**
- Create: `src/features/models/composables/useDiagramCopyWizard.ts`
- Create: `src/features/models/composables/useDiagramCopyWizard.test.ts`

- [ ] **Step 1: Failing tests for gating logic**

```ts
it('disables finish when preview.canCommit is false', () => { ... })
it('resets resolutions when target model changes', () => { ... })
it('maps commit success to navigation target', () => { ... })
```

- [ ] **Step 2: Implement composable**

```ts
export function useDiagramCopyWizard(options: {
  sourceModelId: Ref<string>
  getSourceDiagramId: () => string | null
}) {
  const show = ref(false)
  const step = ref(1) // 1 target, 2 elements, 3 notation, 4 confirm
  const targetModelId = ref<string>('')
  const targetNotationId = ref<string>('')
  const diagramName = ref('')
  const diagramVersion = ref('')
  const folderNodeId = ref<string | null>(null)
  const resolutions = ref<Map<string, DiagramCopyResolution>>(new Map())
  const preview = ref<DiagramCopyPreviewResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function open(diagramId: string) { ... }
  async function refreshPreview() { ... } // call previewDiagramCopy
  watch([targetModelId, targetNotationId], () => {
    resolutions.value = new Map()
    void refreshPreview()
  })
  async function commit(): Promise<{ targetModelId: string; diagramId: string } | null> { ... }

  const canFinish = computed(() => !!preview.value?.canCommit && !loading.value)

  return { show, step, open, close, refreshPreview, commit, canFinish, ... }
}
```

Load editable models via existing list endpoint (`GET /models` + filter by permission if API returns only accessible; otherwise same approach as `ApiKeysSection` model multi-select). Load notations the user can pick (catalog list / notations the user can view — mirror create-diagram notation select data source in `ModelEditor`).

- [ ] **Step 3: Tests PASS**

```bash
npx vitest run src/features/models/composables/useDiagramCopyWizard.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add diagram copy wizard state composable

EOF
)"
```

---

### Task 9: Wizard UI component

**Files:**
- Create: `src/features/models/components/DiagramCopyWizard.vue`
- Modify: `src/i18n/locales/models.ts`

- [ ] **Step 1: Add i18n keys** (`ru` + `en`) under `models.diagramCopy`:

- `title`, `stepTarget`, `stepElements`, `stepNotation`, `stepConfirm`  
- `targetModel`, `targetNotation`, `diagramName`, `diagramVersion`, `folder`  
- `actionMatch`, `actionCreate`, `actionSkip`  
- `blockersTitle`, `warningsTitle`, `confirmSummary`  
- `finish`, `back`, `next`, `cancel`, `success`, `error`

- [ ] **Step 2: Build modal**

Shell: `BaseModal` like `ModelImportWizard.vue`.

- Step 1: `SearchableSelect` for model; `<select>` or `SearchableSelect` for notation; name/version inputs; optional folder select (nodes of target — load on model change via `GET /nodes?modelId=`).  
- Step 2: tables for nodes/links — status color, action radios, candidate select when needed; blockers list.  
- Step 3: notation remap counts + unbound names.  
- Step 4: summary counts → Finish calls `commit()`.

Finish button `:disabled="!canFinish"`.

- [ ] **Step 3: Manual typecheck**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add diagram copy wizard UI

EOF
)"
```

---

### Task 10: Tree entry + ModelEditor wiring

**Files:**
- Modify: `src/features/models/components/ModelTreePalettePanel.vue`
- Modify: `src/features/models/ModelEditor.vue`

- [ ] **Step 1: Emit from tree**

Add emit `copyDiagramToModel: [diagramId: string]` and a button next to delete/rename on diagram rows (icon `content_copy` or `drive_file_move`), title `t('models.diagramCopy.title')`.

- [ ] **Step 2: Wire ModelEditor**

```ts
const diagramCopy = useDiagramCopyWizard({
  sourceModelId: computed(() => modelId.value),
  getSourceDiagramId: () => selectedDiagramId.value
})

async function handleCopyDiagramToModel(diagramId: string) {
  await diagramCopy.open(diagramId)
}

async function onDiagramCopyCommitted(payload: { targetModelId: string; diagramId: string }) {
  // toast success
  await router.push({
    name: 'model-editor',
    params: { id: payload.targetModelId },
    query: { diagramId: payload.diagramId }
  })
}
```

Mount `<DiagramCopyWizard ... />` bound to composable state. On successful commit from wizard emit/callback → navigate as above (same pattern as `ModelRelationMatrixView.vue`).

- [ ] **Step 3: Smoke**

```bash
npm run test -- --run src/features/models/composables/useDiagramCopyWizard.test.ts src/features/models/composables/diagramCopyApi.test.ts
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: wire diagram copy wizard into model editor

EOF
)"
```

---

### Task 11: In-app docs + final verification

**Files:**
- Modify: `src/features/docs/content/diagrams.md` (and English counterpart if present)
- Possibly update design spec status line to “planned”

- [ ] **Step 1: Document user-facing behavior**

Short section: Copy diagram to another model — wizard, matching rules, notation choice, documents not copied in v1.

- [ ] **Step 2: Full verification**

```bash
# arepos-server
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "ru.kavader.arepos.controller.DiagramCopyControllerTest" \
  --tests "ru.kavader.arepos.service.diagramcopy.*"

# warchi
cd /Users/nikolaygroznyh/Work/warchi
npm run test -- --run src/features/models/composables/diagramCopyApi.test.ts \
  src/features/models/composables/useDiagramCopyWizard.test.ts
npm run build
```

Expected: all PASS / build OK.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: describe copy diagram between models

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Copy only, existing target model | 5, 8–10 |
| preview + commit API | 2, 5, 6 |
| Match stableId → name+type (nodes) | 3 |
| Link match stableId → type+endpoints | 3 (clarification) |
| Resolutions MATCH/CREATE/SKIP | 3, 5, 8 |
| Edge blockers / Finish gated | 3, 8, 9 |
| User-selected target notation + remap by name | 4, 5, 9 |
| Unbound binding = warning | 4, 5 |
| Strip documentFileId | 4, 5 |
| Atomic commit, source untouched | 5, 6 |
| 403/400/409 mapping | 5, 6 |
| Wizard UX 4 steps + nav | 8–10 |
| i18n ru/en | 9 |
| Backend + frontend tests | 3, 4, 6, 7, 8, 11 |
| Out of scope (move, new model, files, folder tree, baselines) | not scheduled |

---

## Out of scope (do not implement in this plan)

- Move diagram  
- Create new model from wizard  
- Copy document files  
- Recreate source parent folder hierarchy  
- Copy baseline version chain  
- Papirus changes  

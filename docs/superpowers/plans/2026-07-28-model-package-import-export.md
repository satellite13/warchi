# Model package import/export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native ZIP package to export/import a model with used notations (types, components, relations, rules, shapes), wiki files (`document_refs` + `mdfile://` rewrite), creating a new owned model on the target.

**Architecture:** Server builds/parses ZIP atomically (`ModelPackageExportService` / `ModelPackageImportService`). Notation slices reuse `NotationImportService`. Graph remap follows `ModelCopyService` + `DiagramAttrsRemapper`, extended for `documentFileId`, `notationComponents.*.componentId`, and relation ids. wArchi is a thin download/upload UI (catalog card export + editor import/export).

**Tech Stack:** Kotlin/Spring Boot + JUnit/MockMvc/Testcontainers (arepos-server); Vue 3 + TypeScript + Vitest (warchi); ZIP via `java.util.zip`

**Spec:** `docs/superpowers/specs/2026-07-28-model-package-import-export-design.md`

**Branches:** create matching `feat/model-package-import-export` in **warchi** and **arepos-server** (per feature-branch workflow). Local papirus `file:` link not required (no papirus changes).

---

## File map

### arepos-server (new)

| File | Responsibility |
|------|----------------|
| `dto/modelpackage/ModelPackageDtos.kt` | Manifest, model.json DTOs, import response, document-ref item, file meta |
| `service/modelpackage/MdFileLinkRewriter.kt` | Extract/rewrite `mdfile://UUID` in plain text + JSON attrs |
| `service/modelpackage/NotationPackageAssembler.kt` | Build flat `NotationImportRequest` + client `warchi-notation-export` v2 from notation id |
| `service/modelpackage/ModelPackageExportService.kt` | Assemble ZIP bytes/stream |
| `service/modelpackage/ModelPackageImportService.kt` | Parse ZIP, orchestrate import + remap |
| `service/modelpackage/ModelPackageLimits.kt` | Max ZIP size / counts |
| `controller/ModelPackageController.kt` | `GET …/models/{id}/package`, `POST …/models/package` |
| `controller/NotationExportController.kt` | `GET …/notations/{id}/export` (or method on existing notations controller) |
| Tests under `src/test/kotlin/.../service/modelpackage/` and controller tests | Round-trip, 409, 400 orphan types, mdfile remap |

### arepos-server (modify)

| File | Change |
|------|--------|
| `repository/DocumentRefsRepository.kt` | Query refs by modelId / entity id sets (no `createdBy` filter) |
| `service/DocumentRefsService.kt` | Package-friendly create/list helpers if needed |
| `service/modelbatch/DiagramAttrsRemapper.kt` | Optional: also remap component/relation string maps if kept here; otherwise package-local remapper |
| nginx / deploy docs if present | Allow 100MB on `/api/v1/models/package` (same as OEF) |

### warchi (new)

| File | Responsibility |
|------|----------------|
| `src/features/models/composables/useModelPackage.ts` | download ZIP, upload ZIP, error mapping |
| `src/features/models/composables/useModelPackage.test.ts` | Mock api client |

### warchi (modify)

| File | Change |
|------|--------|
| `src/components/cards/EntityCard.vue` | `canExport` + `@export` button |
| `src/components/catalog/EntityCatalog.vue` | Pass through export for models/notations |
| `src/features/models/ModelsCatalog.vue` / views wiring | Call package download |
| `src/features/notations/NotationsCatalog.vue` | Call notation export download |
| `src/features/models/components/ModelEditorHeader.vue` | Toolbar buttons export/import package |
| `src/features/models/ModelEditor.vue` | Handlers + hidden file input |
| `src/api/apiClient.ts` | binary download helper if missing; multipart upload reuse |
| `src/i18n/locales/models.ts`, `notations.ts`, `common.ts` | Labels/errors |
| `src/features/docs/content/models.md` (+ `.en.md`), `notations.md` (+ `.en.md`) | Short sections |

---

### Task 0: Feature branches

**Files:** git only (warchi, arepos-server)

- [ ] **Step 1: Create branches**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
git checkout master && git pull --ff-only || true
git checkout -b feat/model-package-import-export

cd /Users/nikolaygroznyh/Work/warchi
git checkout master && git pull --ff-only || true
git checkout -b feat/model-package-import-export
```

- [ ] **Step 2: Confirm both on same branch name**

```bash
git -C /Users/nikolaygroznyh/Work/arepos-server branch --show-current
git -C /Users/nikolaygroznyh/Work/warchi branch --show-current
```

Expected: `feat/model-package-import-export` twice.

---

### Task 1: DTOs + limits + mdfile rewriter (arepos-server)

**Files:**
- Create: `src/main/kotlin/ru/kavader/arepos/dto/modelpackage/ModelPackageDtos.kt`
- Create: `src/main/kotlin/ru/kavader/arepos/service/modelpackage/ModelPackageLimits.kt`
- Create: `src/main/kotlin/ru/kavader/arepos/service/modelpackage/MdFileLinkRewriter.kt`
- Create: `src/test/kotlin/ru/kavader/arepos/service/modelpackage/MdFileLinkRewriterTest.kt`

- [ ] **Step 1: Write failing rewriter test**

```kotlin
package ru.kavader.arepos.service.modelpackage

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class MdFileLinkRewriterTest {
    private val rewriter = MdFileLinkRewriter()

    @Test
    fun extractFromMarkdown() {
        val a = UUID.fromString("11111111-1111-1111-1111-111111111111")
        val text = "See [x](mdfile://$a) and again mdfile://$a"
        assertEquals(setOf(a), rewriter.extractFileUuids(text))
    }

    @Test
    fun rewriteMarkdown() {
        val a = UUID.fromString("11111111-1111-1111-1111-111111111111")
        val b = UUID.fromString("22222222-2222-2222-2222-222222222222")
        val out = rewriter.rewrite("mdfile://$a", mapOf(a to b))
        assertEquals("mdfile://$b", out)
    }

    @Test
    fun rewriteDocumentFileIdInAttrsJson() {
        val a = UUID.fromString("11111111-1111-1111-1111-111111111111")
        val b = UUID.fromString("22222222-2222-2222-2222-222222222222")
        val attrs = """{"documentFileId":"$a","name":"n"}"""
        val out = rewriter.rewriteAttrsJson(attrs, mapOf(a to b))
        assertTrue(out!!.contains(b.toString()))
        assertTrue(!out.contains(a.toString()))
    }
}
```

- [ ] **Step 2: Run test — expect FAIL (class missing)**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "ru.kavader.arepos.service.modelpackage.MdFileLinkRewriterTest"
```

- [ ] **Step 3: Implement limits, DTOs, rewriter**

```kotlin
// ModelPackageLimits.kt
object ModelPackageLimits {
    const val MAX_ZIP_BYTES: Long = 100L * 1024L * 1024L
    const val MAX_NOTATIONS = 50
    const val MAX_FILES = 500
    const val MAX_NODES = 50_000
    const val MAX_LINKS = 100_000
    const val MAX_DIAGRAMS = 5_000
    const val FORMAT = "warchi-model-package"
    const val VERSION = 1
}
```

```kotlin
// MdFileLinkRewriter.kt — pattern identical to MdFileLinkValidator
class MdFileLinkRewriter {
    companion object {
        private val MDFILE_PATTERN = Regex("""mdfile://([0-9a-fA-F-]{36})""")
    }

    fun extractFileUuids(text: String?): Set<UUID> { /* findAll → UUID */ }

    fun rewrite(text: String, fileIdMap: Map<UUID, UUID>): String {
        return MDFILE_PATTERN.replace(text) { m ->
            val id = UUID.fromString(m.groupValues[1])
            val mapped = fileIdMap[id] ?: id
            "mdfile://$mapped"
        }
    }

    fun rewriteAttrsJson(attrs: String?, fileIdMap: Map<UUID, UUID>): String? {
        // parse JSON; if documentFileId present remap; also rewrite any textual mdfile:// via rewrite()
    }
}
```

DTOs (Jackson-friendly data classes): `ModelPackageManifest`, `PackagedModel`, `PackagedNode`, `PackagedLink`, `PackagedDiagram`, `PackagedDocumentRef`, `PackagedFileMeta`, `ModelPackageImportResponse`.

- [ ] **Step 4: Re-run test — expect PASS**

- [ ] **Step 5: Commit (arepos-server)**

```bash
git add src/main/kotlin/ru/kavader/arepos/dto/modelpackage \
  src/main/kotlin/ru/kavader/arepos/service/modelpackage \
  src/test/kotlin/ru/kavader/arepos/service/modelpackage
git commit -m "$(cat <<'EOF'
feat: add model package DTOs and mdfile rewriter

EOF
)"
```

---

### Task 2: NotationPackageAssembler + GET /notations/{id}/export

**Files:**
- Create: `src/main/kotlin/ru/kavader/arepos/service/modelpackage/NotationPackageAssembler.kt`
- Create: `src/test/kotlin/ru/kavader/arepos/service/modelpackage/NotationPackageAssemblerTest.kt` (or controller test)
- Modify: notations controller (add export endpoint) — prefer `NotationsController` or small `NotationExportController`
- Modify: repositories as needed to load components/relations/rules/shapes for a notation

- [ ] **Step 1: Write failing test — assembler returns flat import request with used types + shapes**

Use `RepositoryTestBase` builders: notation + component with customShapeId + shape row → `toImportRequest(notationId)` contains shape and nodeType.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement assembler**

```kotlin
@Service
class NotationPackageAssembler(
    private val notationsRepository: NotationsRepository,
    private val componentsRepository: ComponentsRepository,
    private val relationsRepository: RelationsRepository,
    private val relationRulesRepository: RelationRulesRepository,
    private val nodeTypesRepository: NodeTypesRepository,
    private val linkTypesRepository: LinkTypesRepository,
    private val nodeShapesRepository: NodeShapesRepository,
    private val objectMapper: ObjectMapper
) {
    /** Flat payload for model package `notations/<id>.json` and NotationImportService. */
    fun toImportRequest(notation: Notations): NotationImportRequest { /* … */ }

    /** Client download shape matching warchi `warchi-notation-export` v2. */
    fun toClientExportDocument(notation: Notations): Map<String, Any?> { /* format, version:2, state, shapes */ }
}
```

Rules for `toImportRequest`:
- Non-deleted components/relations only
- Include only node/link types referenced by those entities
- Collect `customShapeId` from component attrs → load shapes (same idea as warchi `buildExportShapes`)
- `relationRules` with source component/relation ids as strings

For `toClientExportDocument`: emit structure compatible with existing client import (`format: warchi-notation-export`, `version: 2`). Prefer building from the same entity load as `toImportRequest`, mapping into the nested `state` shape the client already understands — or document that card export returns flat import JSON and update client catalog to use server import format. **Decision for this plan:** card export returns **v2 client format** (spec); package ZIP stores **flat `NotationImportRequest`**.

- [ ] **Step 4: Endpoint**

```kotlin
@GetMapping("/{id}/export")
fun exportNotation(@PathVariable id: UUID): ResponseEntity<ByteArray> {
    val notation = notationsRepository.findById(id).orElseThrow { /* 404 */ }
    accessService.requireCanViewNotation(notation) // use existing view helper name
    val json = objectMapper.writeValueAsBytes(assembler.toClientExportDocument(notation))
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"notation-export.json\"")
        .contentType(MediaType.APPLICATION_JSON)
        .body(json)
}
```

- [ ] **Step 5: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add notation package assembler and export endpoint

EOF
)"
```

---

### Task 3: ModelPackageExportService + GET /models/{id}/package

**Files:**
- Create: `…/service/modelpackage/ModelPackageExportService.kt`
- Create: `…/controller/ModelPackageController.kt`
- Modify: `DocumentRefsRepository` — `findAllByModelId`, `findAllByNodeIdIn`, `findAllByDiagramIdIn`, plus notation-side if needed
- Test: `ModelPackageExportServiceTest` / `ModelPackageControllerTest`

- [ ] **Step 1: Failing test — export ZIP contains manifest, model.json, notations/, files/**

Seed: model + diagram referencing notation + node with `documentFileId` pointing to uploaded markdown file containing `mdfile://` to a second file. Assert zip entry names and manifest.format.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement export**

Algorithm:

1. `requireCanViewModel(model)`
2. Load nodes (`findByModelIdOrdered`), links, diagrams (`deleted == false`)
3. `notationIds = diagrams.mapNotNull { it.notation?.id }.toSet()`; for each `requireCanViewNotation`
4. For each notation → `assembler.toImportRequest` → write `notations/<id>.json`
5. Validate type coverage: every node.nodeType.id and link.linkType.id must appear in union of imported request type ids (as UUID strings). Else **400** `"Model references types not included in diagram notations: …"`
6. File closure:
   - parse `documentFileId` from model/node/diagram/notation entity attrs via rewriter/JSON
   - load document_refs for model + node ids + diagram ids (+ notation/component/relation ids in package)
   - BFS: read each blob text → extract `mdfile://` → enqueue
7. Missing blob → throw 500/503 with clear message (fail closed)
8. Write `files/<id>/meta.json` + `blob`
9. Write `document-refs.json`
10. Write `model.json` (source UUIDs)
11. Write `manifest.json`
12. Return zip bytes

Zip building:

```kotlin
ByteArrayOutputStream().use { baos ->
    ZipOutputStream(baos).use { zos ->
        fun put(name: String, bytes: ByteArray) {
            zos.putNextEntry(ZipEntry(name))
            zos.write(bytes)
            zos.closeEntry()
        }
        // …
    }
    baos.toByteArray()
}
```

Controller:

```kotlin
@GetMapping("/{id}/package")
fun exportPackage(@PathVariable id: UUID): ResponseEntity<ByteArray> {
    val bytes = exportService.export(id)
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"model-package.zip\"")
        .contentType(MediaType.parseMediaType("application/zip"))
        .body(bytes)
}
```

- [ ] **Step 4: Extra failing cases**

- Export 400 when node type not in diagram notations  
- Export 403 when notation not readable (mock access or second user setup)

- [ ] **Step 5: PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: export model package ZIP with notations and wiki files

EOF
)"
```

---

### Task 4: ModelPackageImportService + POST /models/package

**Files:**
- Create: `…/service/modelpackage/ModelPackageImportService.kt`
- Modify: `ModelPackageController.kt` — POST multipart
- Reuse: `NotationImportService`, `FileStorageService`, `ModelCopyService` patterns, `DiagramAttrsRemapper`, `MdFileLinkRewriter`, `SystemRootNodeTypeService`, `ModelAttrsService`
- Test: round-trip + 409 cases

- [ ] **Step 1: Write failing round-trip test**

```kotlin
@Test
fun roundTripPreservesGraphAndWikiLinks() {
    // export as user A → import as user B (or same owner after deleting? prefer second user)
    // assert: new modelId, node count, diagram.notationId remapped,
    // wiki blob contains mdfile://<newFileId>, document_refs exist
}
```

Also:

```kotlin
@Test
fun importConflictsOnExistingNotationNameVersion() { /* expect 409, no model created */ }

@Test
fun importConflictsOnExistingModelNameVersion() { /* expect 409 */ }
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement import**

```kotlin
@Transactional
fun importPackage(zipBytes: ByteArray, owner: Users): ModelPackageImportResponse {
    require(zipBytes.size <= ModelPackageLimits.MAX_ZIP_BYTES) {
        throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Package exceeds 100 MB limit")
    }
    val entries = readZip(zipBytes) // Map<String, ByteArray>
    val manifest = parseManifest(entries["manifest.json"])
    // validate format/version

    // 1) notations
    val notationIdMap = mutableMapOf<String, UUID>()
    val nodeTypeIdMap = mutableMapOf<String, UUID>()
    val linkTypeIdMap = mutableMapOf<String, UUID>()
    val componentIdMap = mutableMapOf<String, UUID>()
    val relationIdMap = mutableMapOf<String, UUID>()
    for (path in entries.keys.filter { it.startsWith("notations/") && it.endsWith(".json") }) {
        val req = objectMapper.readValue(entries[path], NotationImportRequest::class.java)
        val res = notationImportService.import(req, owner) // throws 409
        val sourceNotationId = path.removePrefix("notations/").removeSuffix(".json")
        notationIdMap[sourceNotationId] = res.notationId
        nodeTypeIdMap.putAll(res.nodeTypeIdMap)
        linkTypeIdMap.putAll(res.linkTypeIdMap)
        componentIdMap.putAll(res.componentIdMap.mapKeys { it.key })
        relationIdMap.putAll(res.relationIdMap)
    }

    // 2) files — create Files + putObject; rewrite mdfile in blob before upload
    val fileIdMap = mutableMapOf<UUID, UUID>()
    // First pass: allocate new File rows / ids for each files/<sourceId>/
    // Second pass: rewrite blob text with full fileIdMap, upload content
    // Prefer FileStorageService internal APIs; if only uploadMarkdown exists, use that for text/md

    // 3) Remap documentFileId on newly imported notation-side entities (components/relations/notation attrs)
    //    using fileIdMap — NotationImportService does not remap files

    // 4) model name+version conflict → 409
    val packaged = parseModelJson(entries["model.json"]!!)
    if (modelsRepository.existsByNameAndVersion(packaged.name, packaged.version)) {
        throw ResponseStatusException(HttpStatus.CONFLICT, "Model with name '${packaged.name}' and version '${packaged.version}' already exists")
    }

    // 5) Create model + graph like ModelCopyService:
    //    - create Models row (owner = importer, attrs remapped documentFileId + treeRoot later)
    //    - identify package root (parentNodeId == null)
    //    - create root with SystemRootNodeType (keep stableId/name from package root or "Root")
    //    - wave-create remaining nodes with remapped parent + nodeTypeIdMap + attrs
    //    - create links with remapped source/target + linkTypeIdMap
    //    - create diagrams with remapped notationId, nodeId, DiagramAttrsRemapper + component/relation remap + documentFileId

    // 6) document_refs from document-refs.json — remap ids; skip + warning if unmapped

    return ModelPackageImportResponse(/* maps + warnings */)
}
```

**Attrs remaps to implement (package-local helper `PackageAttrsRemapper`):**

- `documentFileId` via `fileIdMap`
- `notationComponents` map values `componentId` via `componentIdMap`
- link-side relation maps analogously if present in node/link attrs
- diagram attrs: reuse `DiagramAttrsRemapper.remap` for modelNodeId/modelLinkId; additionally walk instances for any `componentId`/`relationId` fields if stored there

**Controller POST:**

```kotlin
@PostMapping("/package", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
@ResponseStatus(HttpStatus.CREATED)
fun importPackage(@RequestParam("file") file: MultipartFile): ModelPackageImportResponse {
    if (file.size > ModelPackageLimits.MAX_ZIP_BYTES) {
        throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Package exceeds 100 MB limit")
    }
    val owner = /* current user */
    return importService.importPackage(file.bytes, owner)
}
```

Note: map controller under `/api/v1/models` so paths are `/models/{id}/package` and `/models/package` without clashing with `/{id}` — declare more specific routes carefully (class-level `/api/v1/models`).

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: import model package ZIP atomically with wiki remap

EOF
)"
```

---

### Task 5: Invalid package + access edge tests (arepos-server)

**Files:** controller/service tests only

- [ ] **Step 1: Add tests**

- wrong format/version → 400  
- empty zip → 400  
- export missing blob for referenced file → non-2xx (assert status)  
- counts over limit → 400  

- [ ] **Step 2: Run**

```bash
./gradlew test --tests "*ModelPackage*"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
test: cover model package validation and error paths

EOF
)"
```

---

### Task 6: warchi API client — `useModelPackage`

**Files:**
- Create: `src/features/models/composables/useModelPackage.ts`
- Create: `src/features/models/composables/useModelPackage.test.ts`
- Modify: `src/api/apiClient.ts` — ensure `apiDownload` / blob GET with cookies exists (add if missing)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/composables/useApi', () => ({
  apiUpload: vi.fn(),
}))
// mock download helper similarly

describe('useModelPackage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploadPackage returns modelId on 201', async () => {
    // mock apiUpload success → { modelId: '…' }
    // const { uploadModelPackage } = useModelPackage()
    // const res = await uploadModelPackage(new File([], 'p.zip'))
    // expect(res.ok).toBe(true)
  })

  it('maps 409 to conflict error code', async () => {
    // mock 409 → res.ok false, code CONFLICT
  })
})
```

- [ ] **Step 2: Run vitest — FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models/composables/useModelPackage.test.ts
```

- [ ] **Step 3: Implement**

```ts
export type ModelPackageImportResult =
  | { ok: true; modelId: string; modelName: string; modelVersion: string; warnings: string[] }
  | { ok: false; status: number; message: string; code?: 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'BAD_REQUEST' }

export async function downloadModelPackage(modelId: string, fileName?: string): Promise<void> {
  // GET /models/{id}/package as blob → <a download>
}

export async function uploadModelPackage(file: File, onProgress?: (pct: number) => void): Promise<ModelPackageImportResult> {
  const form = new FormData()
  form.append('file', file)
  // POST /models/package via apiUpload
}

export async function downloadNotationExport(notationId: string): Promise<void> {
  // GET /notations/{id}/export as blob
}
```

- [ ] **Step 4: PASS + commit (warchi)**

```bash
git add src/features/models/composables/useModelPackage.ts \
  src/features/models/composables/useModelPackage.test.ts src/api/apiClient.ts
git commit -m "$(cat <<'EOF'
feat: add model package download/upload client helpers

EOF
)"
```

---

### Task 7: Editor UI — export + import package

**Files:**
- Modify: `src/features/models/components/ModelEditorHeader.vue`
- Modify: `src/features/models/ModelEditor.vue`
- Modify: `src/i18n/locales/models.ts` (and toolbar keys in `common.ts` if used)

- [ ] **Step 1: Add toolbar buttons**

In `ModelEditorHeader` `toolbarButtons` array (near OEF import):

```ts
{ icon: 'download', event: 'export-model-package', title: t('toolbar.exportModelPackage') },
{ icon: 'upload', event: 'import-model-package', title: t('toolbar.importModelPackage') },
```

- [ ] **Step 2: Wire ModelEditor handlers**

```ts
case 'export-model-package':
  if (model.value?.id) await downloadModelPackage(model.value.id, `${sanitizeFileName(model.value.name)}.zip`)
  break
case 'import-model-package':
  modelPackageInputRef.value?.click()
  break
```

Hidden input:

```html
<input
  ref="modelPackageInputRef"
  type="file"
  accept=".zip,application/zip"
  class="visually-hidden"
  @change="onModelPackageSelected"
/>
```

`onModelPackageSelected`:
1. set importing flag / footer progress text
2. `uploadModelPackage(file)`
3. on ok → toast success → `router.push({ name: 'model-editor', params: { id: result.modelId } })` (use actual route name)
4. on CONFLICT → setUiError(t('models.packageImportConflict'))
5. clear input value

- [ ] **Step 3: Manual smoke** (dev server + backend) — export current model, import, land in new editor

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: model editor toolbar for package import/export

EOF
)"
```

---

### Task 8: Catalog card export (models + notations)

**Files:**
- Modify: `src/components/cards/EntityCard.vue` — prop `canExport?: boolean`, emit `export`, icon button `download`
- Modify: `src/components/catalog/EntityCatalog.vue` — props/emit plumbing
- Modify: models catalog wiring + notations catalog wiring
- i18n: `common.export` / entity-specific titles

- [ ] **Step 1: EntityCard button**

```vue
<button
  v-if="canExport"
  type="button"
  class="model-card__action"
  :title="t('common.export')"
  @click.stop="emit('export')"
>
  <UiIcon name="download" />
</button>
```

- [ ] **Step 2: Models catalog** — `@export="downloadModelPackage(item.id)"` for selected version id

- [ ] **Step 3: Notations catalog** — `@export="downloadNotationExport(item.id)"`

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: export package/notation from catalog cards

EOF
)"
```

---

### Task 9: In-app docs + i18n polish

**Files:**
- `src/features/docs/content/models.md`, `models.en.md`
- `src/features/docs/content/notations.md`, `notations.en.md`
- i18n strings review

- [ ] **Step 1: Docs section (models)**

Russian + English: what the ZIP contains (notations used by diagrams, wiki files, no diagram preview SVG); import always creates a new model; 409 on name+version clash; import only from editor; export from card or editor.

- [ ] **Step 2: Docs section (notations)** — card export downloads same JSON as editor export

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: document model package and notation card export

EOF
)"
```

---

### Task 10: Cross-repo verification

- [ ] **Step 1: arepos-server**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "*ModelPackage*" --tests "*NotationExport*" --tests "*NotationImport*"
```

Expected: PASS

- [ ] **Step 2: warchi**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npm run test -- --run src/features/models/composables/useModelPackage.test.ts
npm run lint
```

Expected: PASS / no new lint errors on touched files

- [ ] **Step 3: Manual checklist**

- [ ] Export model with 1 diagram notation + wiki page linking another wiki page → ZIP opens, `files/` has ≥2 entries, `document-refs.json` non-empty  
- [ ] Import as user without those entities → new model opens, wiki links work, diagram renders  
- [ ] Re-import same package → 409  
- [ ] Notation card export downloads JSON openable by notation editor import  
- [ ] Share-link after opening imported diagram still works (SVG regenerated)  

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| ZIP format + manifest | 1, 3 |
| notations as NotationImportRequest | 2, 3 |
| document-refs.json + mdfile closure/rewrite | 1, 3, 4 |
| No diagram preview SVG | documented; not implemented (out of scope) |
| GET/POST model package API | 3, 4 |
| GET notation export | 2 |
| 409 model/notation | 4 |
| Orphan type 400 on export | 3 |
| Shared notation 403 on export | 3 |
| UI card export models+notations | 8 |
| UI editor import+export models | 7 |
| Docs/i18n | 9 |
| Tests round-trip / wiki | 4, 5, 10 |

## Notes for implementers

1. **Root node:** Do not call `ModelLifecycleService.createModel` then also import a second root. Follow `ModelCopyService` (one root, `treeRootNodeId` in model attrs).
2. **NotationImportService** strips `documentFileId` from **shapes** only; component/notation wiki ids must be remapped after files exist.
3. **Package `notations/*.json` = flat import DTO**; card `GET /notations/{id}/export` = client v2 JSON.
4. **Transactional boundary:** DB work in `@Transactional`; MinIO puts should be ordered so a failed TX does not leave unreferenced public data when practical; orphan cleanup is a follow-up per spec.
5. **Nginx:** if prod limits body size, add location exception for `POST /api/v1/models/package` like OEF normalize.

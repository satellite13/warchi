# Notation catalog JSON import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept the same `warchi-notation-export` v2 JSON that notation export produces on `POST /notations/import`, and add a notations-catalog CreateCard that uploads that file to create a new notation (409 on name+version conflict).

**Architecture:** Server detects v2 wrapper vs legacy flat `NotationImportRequest`, maps v2 → flat request (including `diagramLayer` into notation attrs), then reuses `NotationImportService`. wArchi catalog mirrors model-package import UX but posts JSON via `apiPost` (not multipart ZIP).

**Tech Stack:** Kotlin/Spring Boot + MockMvc/Testcontainers (arepos-server); Vue 3 + TypeScript + Vitest (warchi)

**Spec:** `docs/superpowers/specs/2026-07-29-notation-catalog-json-import-design.md`

**Branches:** create matching `feat/notation-catalog-json-import` in **warchi** and **arepos-server**. Papirus `file:` link not required.

---

## File map

### arepos-server (new)

| File | Responsibility |
|------|----------------|
| `service/modelpackage/NotationExportDocumentMapper.kt` | Parse `JsonNode` v2 → `NotationImportRequest`; reject bad format/version |
| `service/modelpackage/NotationExportDocumentMapperTest.kt` | Unit tests for mapping + validation |

### arepos-server (modify)

| File | Change |
|------|--------|
| `controller/NotationImportController.kt` | Accept raw JSON body; if v2 map then import; else deserialize flat request |
| `controller/NotationImportControllerTest.kt` | Round-trip export→import; 409; 400 bad format; legacy flat still 201 |

### warchi (new)

| File | Responsibility |
|------|----------------|
| `src/features/notations/composables/uploadNotationExport.ts` | Read file / post JSON / map 409/400 |
| `src/features/notations/composables/uploadNotationExport.test.ts` | Vitest for success + conflict |

### warchi (modify)

| File | Change |
|------|--------|
| `src/features/notations/NotationsCatalog.vue` | CreateCard import + file input + navigate |
| `src/i18n/locales/notations.ts` | RU/EN strings |
| `src/features/docs/content/notations.md` (+ `.en.md`) | One short paragraph on catalog import |

---

### Task 0: Feature branches

**Files:** git only

- [ ] **Step 1: Create matching branches**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
git checkout master && git pull --ff-only || true
git checkout -b feat/notation-catalog-json-import

cd /Users/nikolaygroznyh/Work/warchi
git checkout master && git pull --ff-only || true
git checkout -b feat/notation-catalog-json-import
```

- [ ] **Step 2: Commit branch tip marker only if needed** — no code yet; skip empty commit.

---

### Task 1: Mapper unit tests (arepos) — TDD red

**Files:**
- Create: `arepos-server/src/test/kotlin/ru/kavader/arepos/service/modelpackage/NotationExportDocumentMapperTest.kt`
- Create (stub later): `arepos-server/src/main/kotlin/ru/kavader/arepos/service/modelpackage/NotationExportDocumentMapper.kt`

- [ ] **Step 1: Write failing tests**

```kotlin
package ru.kavader.arepos.service.modelpackage

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.server.ResponseStatusException
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NotationExportDocumentMapperTest {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()
    private val mapper = NotationExportDocumentMapper(objectMapper)

    @Test
    fun `maps v2 export document to NotationImportRequest`() {
        val json = """
            {
              "format": "warchi-notation-export",
              "version": 2,
              "exportedAt": "2026-07-29T00:00:00Z",
              "notation": { "id": "n1", "name": "Arch", "version": "1.2.0" },
              "state": {
                "notationId": "n1",
                "ownerId": "o1",
                "nodeTypes": [
                  { "id": "nt1", "name": "App", "parsedAttrs": { "icon": "hub" } }
                ],
                "linkTypes": [
                  { "id": "lt1", "name": "Flow", "parsedAttrs": {} }
                ],
                "components": [
                  {
                    "id": "c1",
                    "name": "App Comp",
                    "nodeTypeId": "nt1",
                    "version": "1.2.0",
                    "parsedAttrs": { "diagramStyle": { "customShapeId": "s1" } }
                  }
                ],
                "relations": [
                  {
                    "id": "r1",
                    "name": "Flows",
                    "linkTypeId": "lt1",
                    "version": "1.2.0",
                    "parsedAttrs": { "label": "x" }
                  }
                ],
                "relationRules": [
                  {
                    "fromComponentId": "c1",
                    "toComponentId": "c1",
                    "allowedRelationIds": ["r1"]
                  }
                ],
                "diagramLayer": { "version": 1, "nodes": [], "edges": [] }
              },
              "shapes": [
                {
                  "id": "s1",
                  "name": "Hex",
                  "outline": "[]",
                  "contentArea": null,
                  "attrs": null
                }
              ]
            }
        """.trimIndent()

        val request = mapper.toImportRequest(objectMapper.readTree(json))

        assertEquals("Arch", request.notation.name)
        assertEquals("1.2.0", request.notation.version)
        assertTrue(request.notation.attrs!!.contains("diagramLayer"))
        assertEquals(1, request.nodeTypes.size)
        assertEquals("nt1", request.nodeTypes[0].id)
        assertEquals("App", request.nodeTypes[0].name)
        assertTrue(request.nodeTypes[0].attrs!!.contains("hub"))
        assertEquals(1, request.linkTypes.size)
        assertEquals(1, request.components.size)
        assertEquals("nt1", request.components[0].nodeTypeId)
        assertTrue(request.components[0].attrs!!.contains("customShapeId"))
        assertEquals(1, request.relations.size)
        assertEquals(1, request.relationRules.size)
        assertEquals(listOf("r1"), request.relationRules[0].allowedRelationIds)
        assertEquals(1, request.shapes.size)
        assertEquals("s1", request.shapes[0].id)
    }

    @Test
    fun `rejects unknown format`() {
        val json = """{"format":"other","version":2,"notation":{"name":"A","version":"1.0.0"},"state":{}}"""
        val ex = assertThrows<ResponseStatusException> {
            mapper.toImportRequest(objectMapper.readTree(json))
        }
        assertEquals(400, ex.statusCode.value())
    }

    @Test
    fun `rejects unsupported version`() {
        val json = """{"format":"warchi-notation-export","version":1,"notation":{"name":"A","version":"1.0.0"},"state":{}}"""
        val ex = assertThrows<ResponseStatusException> {
            mapper.toImportRequest(objectMapper.readTree(json))
        }
        assertEquals(400, ex.statusCode.value())
    }

    @Test
    fun `isExportDocument detects v2 wrapper`() {
        val v2 = objectMapper.readTree("""{"format":"warchi-notation-export","version":2}""")
        val flat = objectMapper.readTree("""{"notation":{"name":"A","version":"1.0.0"}}""")
        assertTrue(NotationExportDocumentMapper.isExportDocument(v2))
        assertTrue(!NotationExportDocumentMapper.isExportDocument(flat))
    }
}
```

- [ ] **Step 2: Run tests — expect compile/fail**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests 'ru.kavader.arepos.service.modelpackage.NotationExportDocumentMapperTest'
```

Expected: FAIL (class missing)

- [ ] **Step 3: Implement mapper**

Create `NotationExportDocumentMapper.kt`:

```kotlin
package ru.kavader.arepos.service.modelpackage

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import ru.kavader.arepos.dto.import.ImportedComponent
import ru.kavader.arepos.dto.import.ImportedLinkType
import ru.kavader.arepos.dto.import.ImportedNodeShape
import ru.kavader.arepos.dto.import.ImportedNodeType
import ru.kavader.arepos.dto.import.ImportedRelation
import ru.kavader.arepos.dto.import.ImportedRelationRule
import ru.kavader.arepos.dto.import.NotationImportMeta
import ru.kavader.arepos.dto.import.NotationImportRequest

@Component
class NotationExportDocumentMapper(
    private val objectMapper: ObjectMapper
) {
    fun toImportRequest(root: JsonNode): NotationImportRequest {
        if (!isExportDocument(root)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a warchi-notation-export document")
        }
        val version = root.path("version").asInt(-1)
        if (version != 2) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported notation export version: $version")
        }
        val notationNode = root.path("notation")
        val name = notationNode.path("name").asText("").trim()
        if (name.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Notation name is required")
        }
        val notationVersion = notationNode.path("version").asText("").trim().ifEmpty { "1.0.0" }
        val state = root.path("state")

        val attrsObject = objectMapper.createObjectNode()
        val diagramLayer = state.path("diagramLayer")
        if (diagramLayer.isObject) {
            attrsObject.set<JsonNode>("diagramLayer", diagramLayer.deepCopy())
        }

        return NotationImportRequest(
            notation = NotationImportMeta(
                name = name,
                version = notationVersion,
                attrs = if (attrsObject.isEmpty) null else objectMapper.writeValueAsString(attrsObject)
            ),
            nodeTypes = mapTypes(state.path("nodeTypes")) { id, n, attrs ->
                ImportedNodeType(id = id, name = n, attrs = attrs)
            },
            linkTypes = mapTypes(state.path("linkTypes")) { id, n, attrs ->
                ImportedLinkType(id = id, name = n, attrs = attrs)
            },
            components = mapEntities(state.path("components")) { id, n, version, typeId, attrs ->
                ImportedComponent(
                    id = id,
                    name = n,
                    nodeTypeId = typeId ?: throw ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Component '$n' missing nodeTypeId"
                    ),
                    version = version,
                    attrs = attrs
                )
            },
            relations = mapEntities(state.path("relations")) { id, n, version, typeId, attrs ->
                ImportedRelation(
                    id = id,
                    name = n,
                    linkTypeId = typeId ?: throw ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Relation '$n' missing linkTypeId"
                    ),
                    version = version,
                    attrs = attrs
                )
            },
            relationRules = mapRelationRules(state.path("relationRules")),
            shapes = mapShapes(root.path("shapes"))
        )
    }

    companion object {
        fun isExportDocument(root: JsonNode): Boolean =
            root.path("format").asText(null) == "warchi-notation-export"
    }

    private fun <T> mapTypes(
        array: JsonNode,
        factory: (id: String, name: String, attrs: String?) -> T
    ): List<T> {
        if (!array.isArray) return emptyList()
        return array.mapNotNull { node ->
            val id = node.path("id").asText("").trim()
            val name = node.path("name").asText("").trim()
            if (id.isEmpty() || name.isEmpty()) return@mapNotNull null
            factory(id, name, attrsFromNode(node))
        }
    }

    private fun <T> mapEntities(
        array: JsonNode,
        factory: (id: String, name: String, version: String?, typeId: String?, attrs: String?) -> T
    ): List<T> {
        if (!array.isArray) return emptyList()
        return array.mapNotNull { node ->
            val id = node.path("id").asText("").trim()
            val name = node.path("name").asText("").trim()
            if (id.isEmpty() || name.isEmpty()) return@mapNotNull null
            val version = node.path("version").asText(null)?.trim()?.ifEmpty { null }
            val typeId = when {
                node.hasNonNull("nodeTypeId") -> node.path("nodeTypeId").asText(null)
                node.hasNonNull("linkTypeId") -> node.path("linkTypeId").asText(null)
                else -> null
            }?.trim()?.ifEmpty { null }
            factory(id, name, version, typeId, attrsFromNode(node))
        }
    }

    private fun mapRelationRules(array: JsonNode): List<ImportedRelationRule> {
        if (!array.isArray) return emptyList()
        return array.mapNotNull { node ->
            val from = node.path("fromComponentId").asText("").trim()
            val to = node.path("toComponentId").asText("").trim()
            if (from.isEmpty() || to.isEmpty()) return@mapNotNull null
            val allowed = node.path("allowedRelationIds")
                .takeIf { it.isArray }
                ?.mapNotNull { it.asText(null)?.trim()?.ifEmpty { null } }
                .orEmpty()
            ImportedRelationRule(fromComponentId = from, toComponentId = to, allowedRelationIds = allowed)
        }
    }

    private fun mapShapes(array: JsonNode): List<ImportedNodeShape> {
        if (!array.isArray) return emptyList()
        return array.mapNotNull { node ->
            val id = node.path("id").asText("").trim()
            val name = node.path("name").asText("").trim()
            if (id.isEmpty() || name.isEmpty()) return@mapNotNull null
            val attrsNode = node.get("attrs")
            val attrs = when {
                attrsNode == null || attrsNode.isNull -> null
                attrsNode.isTextual -> attrsNode.asText()
                else -> objectMapper.writeValueAsString(attrsNode)
            }
            ImportedNodeShape(
                id = id,
                name = name,
                outline = node.path("outline").asText(null),
                contentArea = node.path("contentArea").asText(null),
                attrs = attrs
            )
        }
    }

    /** Prefer `parsedAttrs` object (export v2); fall back to string `attrs`. */
    private fun attrsFromNode(node: JsonNode): String? {
        val parsed = node.get("parsedAttrs")
        if (parsed != null && parsed.isObject) {
            return objectMapper.writeValueAsString(parsed)
        }
        val attrs = node.get("attrs") ?: return null
        if (attrs.isNull) return null
        if (attrs.isTextual) return attrs.asText()
        if (attrs.isObject) return objectMapper.writeValueAsString(attrs)
        return null
    }
}
```

Fix `isEmpty` on `ObjectNode` if needed: use `attrsObject.size() == 0` for Jackson versions without `isEmpty`.

- [ ] **Step 4: Run mapper tests — expect PASS**

```bash
./gradlew test --tests 'ru.kavader.arepos.service.modelpackage.NotationExportDocumentMapperTest'
```

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/ru/kavader/arepos/service/modelpackage/NotationExportDocumentMapper.kt \
  src/test/kotlin/ru/kavader/arepos/service/modelpackage/NotationExportDocumentMapperTest.kt
git commit -m "feat: map warchi-notation-export v2 JSON to NotationImportRequest"
```

---

### Task 2: Controller accepts v2 + keep legacy flat

**Files:**
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/NotationImportController.kt`
- Modify: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/NotationImportControllerTest.kt`

- [ ] **Step 1: Add failing controller tests**

Append to `NotationImportControllerTest`:

```kotlin
@Autowired
lateinit var notationPackageAssembler: ru.kavader.arepos.service.modelpackage.NotationPackageAssembler

@Test
fun `import accepts warchi-notation-export v2 document`() {
    val caller = persistUser("notation-v2-import@test.com")
    val sourceOwner = persistUser("notation-v2-source@test.com")
    val source = persistNotation(owner = sourceOwner, name = "V2 Source", version = "1.0.0")
    val nodeType = persistNodeType(owner = sourceOwner, name = "V2 Node")
    persistComponent(notation = source, nodeType = nodeType, owner = sourceOwner, name = "V2 Comp")

    val doc = notationPackageAssembler.toClientExportDocument(source)
    // Avoid 409 against source name+version if same DB uniqueness is global:
    @Suppress("UNCHECKED_CAST")
    val notationMeta = (doc["notation"] as MutableMap<String, Any?>)
    notationMeta["name"] = "V2 Imported Copy"
    notationMeta["version"] = "1.0.0"

    mockMvc.perform(
        post("/api/v1/notations/import")
            .withAuth(caller.id!!, Role.USER)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(doc))
    )
        .andExpect(status().isCreated)
        .andExpect(jsonPath("$.notationId").isNotEmpty)
        .andExpect(jsonPath("$.componentIdMap").isMap)
}

@Test
fun `import v2 conflicts on existing name and version`() {
    val caller = persistUser("notation-v2-conflict@test.com")
    persistNotation(owner = caller, name = "Conflict Notation", version = "1.0.0")
    val doc = linkedMapOf(
        "format" to "warchi-notation-export",
        "version" to 2,
        "notation" to linkedMapOf("id" to "x", "name" to "Conflict Notation", "version" to "1.0.0"),
        "state" to linkedMapOf(
            "nodeTypes" to emptyList<Any>(),
            "linkTypes" to emptyList<Any>(),
            "components" to emptyList<Any>(),
            "relations" to emptyList<Any>(),
            "relationRules" to emptyList<Any>(),
            "diagramLayer" to linkedMapOf("version" to 1, "nodes" to emptyList<Any>(), "edges" to emptyList<Any>())
        ),
        "shapes" to emptyList<Any>()
    )

    mockMvc.perform(
        post("/api/v1/notations/import")
            .withAuth(caller.id!!, Role.USER)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(doc))
    ).andExpect(status().isConflict)
}

@Test
fun `import rejects unknown export format`() {
    val caller = persistUser("notation-bad-format@test.com")
    val doc = linkedMapOf(
        "format" to "not-a-real-format",
        "version" to 2,
        "notation" to linkedMapOf("name" to "X", "version" to "1.0.0"),
        "state" to emptyMap<String, Any>()
    )
    mockMvc.perform(
        post("/api/v1/notations/import")
            .withAuth(caller.id!!, Role.USER)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(doc))
    ).andExpect(status().isBadRequest)
}
```

Use existing `persist*` helpers from `ControllerIntegrationTest` / `RepositoryTestBase` (same as `NotationExportControllerTest`). If `doc["notation"]` is not mutable, rebuild map with new name instead of mutating.

- [ ] **Step 2: Run — expect FAIL** on v2 body (likely 400 validation)

```bash
./gradlew test --tests 'ru.kavader.arepos.controller.NotationImportControllerTest'
```

- [ ] **Step 3: Update controller**

```kotlin
@RestController
@RequestMapping("/api/v1/notations")
@Tag(name = "Notation Import", description = "Notation import and migration endpoints")
class NotationImportController(
    private val usersRepository: UsersRepository,
    private val accessService: ResourceAccessService,
    private val notationImportService: NotationImportService,
    private val exportDocumentMapper: NotationExportDocumentMapper,
    private val objectMapper: ObjectMapper
) {
    @PostMapping("/import")
    @Operation(summary = "Import notation package (flat NotationImportRequest or warchi-notation-export v2)")
    @ResponseStatus(HttpStatus.CREATED)
    fun importNotation(@RequestBody body: JsonNode): NotationImportResponse {
        val currentUserId = accessService.currentUserId()
        val owner = usersRepository.findById(currentUserId)
            .orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "User $currentUserId not found")
            }

        val request = if (NotationExportDocumentMapper.isExportDocument(body)) {
            exportDocumentMapper.toImportRequest(body)
        } else {
            try {
                objectMapper.treeToValue(body, NotationImportRequest::class.java)
            } catch (ex: Exception) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid notation import payload", ex)
            }
        }

        return notationImportService.import(request, owner)
    }
}
```

Add imports for `JsonNode`, mapper, `ObjectMapper`.

- [ ] **Step 4: Run controller tests — expect PASS**

```bash
./gradlew test --tests 'ru.kavader.arepos.controller.NotationImportControllerTest'
```

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/ru/kavader/arepos/controller/NotationImportController.kt \
  src/test/kotlin/ru/kavader/arepos/controller/NotationImportControllerTest.kt
git commit -m "feat: accept warchi-notation-export v2 on POST /notations/import"
```

---

### Task 3: wArchi upload helper — TDD

**Files:**
- Create: `warchi/src/features/notations/composables/uploadNotationExport.ts`
- Create: `warchi/src/features/notations/composables/uploadNotationExport.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPost } from '@/api/apiClient'
import { uploadNotationExportJson } from './uploadNotationExport'

vi.mock('@/api/apiClient', () => ({
  apiPost: vi.fn(),
}))

describe('uploadNotationExportJson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts parsed JSON and returns notationId', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { notationId: 'new-id', nodeTypeIdMap: {}, linkTypeIdMap: {}, componentIdMap: {}, relationIdMap: {} },
    })
    const file = new File(
      [JSON.stringify({ format: 'warchi-notation-export', version: 2, notation: { name: 'A', version: '1.0.0' }, state: {}, shapes: [] })],
      'a-export.json',
      { type: 'application/json' }
    )
    const result = await uploadNotationExportJson(file)
    expect(result).toEqual({ ok: true, notationId: 'new-id' })
    expect(apiPost).toHaveBeenCalledWith(
      '/notations/import',
      expect.objectContaining({ format: 'warchi-notation-export', version: 2 })
    )
  })

  it('maps 409 to CONFLICT', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'exists', code: 'CONFLICT' },
    })
    const file = new File(['{"format":"warchi-notation-export","version":2}'], 'x.json', {
      type: 'application/json',
    })
    const result = await uploadNotationExportJson(file)
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: 'CONFLICT',
      message: 'exists',
    })
  })

  it('rejects invalid JSON before posting', async () => {
    const file = new File(['not-json'], 'x.json', { type: 'application/json' })
    const result = await uploadNotationExportJson(file)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('BAD_REQUEST')
    }
    expect(apiPost).not.toHaveBeenCalled()
  })
})
```

Adjust `apiPost` mock import path to match project (`@/api/apiClient` vs `@/composables/useApi`) — use the same module `useNotationImportApi` uses (`@/api/apiClient`).

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/notations/composables/uploadNotationExport.test.ts
```

- [ ] **Step 3: Implement helper**

```typescript
import { apiPost } from '@/api/apiClient'
import type { NotationImportApiResponse } from './useNotationImportApi'

export type NotationExportImportResult =
  | { ok: true; notationId: string }
  | {
      ok: false
      status: number
      message: string
      code?: 'CONFLICT' | 'BAD_REQUEST'
    }

export async function uploadNotationExportJson(file: File): Promise<NotationExportImportResult> {
  let document: unknown
  try {
    document = JSON.parse(await file.text())
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON', code: 'BAD_REQUEST' }
  }

  const result = await apiPost<NotationImportApiResponse>('/notations/import', document)
  if (!result.success) {
    const status = result.error.status
    if (status === 409) {
      return { ok: false, status, message: result.error.message, code: 'CONFLICT' }
    }
    if (status === 400) {
      return { ok: false, status, message: result.error.message, code: 'BAD_REQUEST' }
    }
    return { ok: false, status, message: result.error.message }
  }
  if (!result.data?.notationId) {
    return { ok: false, status: 0, message: 'Invalid response', code: 'BAD_REQUEST' }
  }
  return { ok: true, notationId: result.data.notationId }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/notations/composables/uploadNotationExport.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/composables/uploadNotationExport.ts \
  src/features/notations/composables/uploadNotationExport.test.ts
git commit -m "feat: add notation export JSON upload helper"
```

---

### Task 4: Notations catalog CreateCard + i18n + docs

**Files:**
- Modify: `warchi/src/features/notations/NotationsCatalog.vue`
- Modify: `warchi/src/i18n/locales/notations.ts`
- Modify: `warchi/src/features/docs/content/notations.md`
- Modify: `warchi/src/features/docs/content/notations.en.md`

- [ ] **Step 1: Add i18n keys** (both `ru` and `en` blocks in `notations.ts`)

```ts
packageImportDescription: 'Создать новую нотацию из JSON-экспорта',
packageImportConflict: 'Нотация с таким именем и версией уже существует.',
packageImportBadRequest: 'Некорректный или повреждённый файл экспорта нотации.',
packageImportError: 'Не удалось импортировать нотацию: {message}',
packageImporting: 'Импорт нотации…',
```

English:

```ts
packageImportDescription: 'Create a new notation from a JSON export',
packageImportConflict: 'A notation with this name and version already exists.',
packageImportBadRequest: 'Invalid or corrupted notation export file.',
packageImportError: 'Could not import notation: {message}',
packageImporting: 'Importing notation…',
```

- [ ] **Step 2: Wire `NotationsCatalog.vue`** (mirror `ModelsCatalog.vue`)

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { NotationData } from "@/types/entities";
import type { EntityListConfig } from "@/composables/useEntityList";
import EntityCatalog from "@/components/catalog/EntityCatalog.vue";
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions";
import { downloadNotationExport } from "@/features/models/composables/useModelPackage";
import { uploadNotationExportJson } from "@/features/notations/composables/uploadNotationExport";

const { t } = useI18n();
const router = useRouter();
const exportError = ref<string | null>(null);
const actionStatusMessage = ref<string | null>(null);
const packageInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);

// ... existing config ...

async function handleExport(item: NotationData) { /* unchanged */ }

function openPackagePicker() {
  if (isImporting.value) return;
  exportError.value = null;
  actionStatusMessage.value = null;
  const input = packageInputRef.value;
  if (!input) return;
  input.value = "";
  const withPicker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof withPicker.showPicker === "function") withPicker.showPicker();
  else input.click();
}

async function onPackageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || isImporting.value) return;

  isImporting.value = true;
  exportError.value = null;
  actionStatusMessage.value = t("notations.packageImporting");
  try {
    const result = await uploadNotationExportJson(file);
    if (!result.ok) {
      actionStatusMessage.value = null;
      if (result.code === "CONFLICT") {
        exportError.value = t("notations.packageImportConflict");
      } else if (result.code === "BAD_REQUEST") {
        exportError.value = result.message?.trim()
          ? t("notations.packageImportError", { message: result.message })
          : t("notations.packageImportBadRequest");
      } else {
        exportError.value = t("notations.packageImportError", { message: result.message });
      }
      return;
    }
    actionStatusMessage.value = null;
    await router.push({ name: "notation-editor", params: { id: result.notationId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actionStatusMessage.value = null;
    exportError.value = t("notations.packageImportError", { message });
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <input
    ref="packageInputRef"
    class="notations-catalog__package-input"
    type="file"
    accept=".json,application/json"
    @change="onPackageSelected"
  />
  <EntityCatalog
    :entity-list-config="config"
    editor-route-name="notation-editor"
    i18n-prefix="notations"
    :icon="DEFAULT_ENTITY_ICONS.notation"
    resource-type="NOTATION"
    :show-version-tree="true"
    :show-create-from-version-button="true"
    can-export
    can-import-package
    :action-error-message="exportError"
    :action-status-message="actionStatusMessage"
    @export="handleExport"
    @import-package="openPackagePicker"
  />
</template>

<style scoped>
.notations-catalog__package-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
```

Confirm route name `notation-editor` matches `router/index.ts`.

- [ ] **Step 3: Docs** — add one short bullet under import/export in `notations.md` / `notations.en.md`: catalog CreateCard imports the same JSON export file and creates a new notation; conflict on name+version.

- [ ] **Step 4: Verify**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npm run lint
npx vitest run src/features/notations/composables/uploadNotationExport.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/NotationsCatalog.vue \
  src/features/notations/composables/uploadNotationExport.ts \
  src/features/notations/composables/uploadNotationExport.test.ts \
  src/i18n/locales/notations.ts \
  src/features/docs/content/notations.md \
  src/features/docs/content/notations.en.md
git commit -m "feat: import notation JSON export from catalog board"
```

---

### Task 5: Manual smoke + cross-repo check

- [ ] **Step 1: arepos full relevant tests**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests '*NotationImport*' --tests '*NotationExport*' --tests '*NotationPackageAssembler*' --tests '*NotationExportDocumentMapper*'
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 2: Manual smoke (local)**

1. Export notation from catalog card → `*-export.json`
2. Soft-delete or rename so name+version free, or import after changing nothing → expect 409 if same name+version exists
3. Import via CreateCard on empty name (or after deleting) → opens new notation editor with components/types

- [ ] **Step 3: No further commit unless smoke fixes needed**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Same format as export (`warchi-notation-export` v2) | Task 1–2 |
| Always create new notation | Task 2 (existing service) |
| 409 on name+version | Task 2 test + service |
| Catalog CreateCard + file picker JSON | Task 4 |
| Navigate to editor on success | Task 4 |
| Legacy flat `POST /notations/import` unbroken | Task 2 (branch + existing tests) |
| Editor merge-import unchanged | — (no tasks touch it) |
| Model package ZIP out of scope | — |

## Placeholder / consistency self-review

- No TBD steps; mapper + controller + catalog paths are concrete.
- Endpoint remains `POST /notations/import` (dual accept), matching the approved spec preference.
- Client helper name `uploadNotationExportJson` is used consistently in Task 3–4.
- Route name must be verified as `notation-editor` during Task 4 (already used by `NotationsCatalog` today).

# Notation export/import custom shapes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export used `node_shapes` with a notation package and recreate them in the target catalog on Save / `POST /notations/import`, remapping `customShapeId` so the shape select works after transfer.

**Architecture:** Pure TS helpers collect/synthesize/remap shapes. Client export writes top-level `shapes[]` (v2). Import stores `pendingShapes` outside wire `state`; `saveChanges` creates shapes via `/node-shapes` before components. Server import creates shapes in the same transaction and rewrites component attrs JSON.

**Tech Stack:** Vue 3 + TypeScript + Vitest (warchi); Kotlin/Spring + JUnit/MockMvc (arepos-server)

**Spec:** `docs/superpowers/specs/2026-07-23-notation-export-shapes-design.md`

**Branches:** `feat/notation-export-shapes` in **warchi** (exists) and **arepos-server** (create to match)

---

## File map

### warchi (new)

| File | Responsibility |
|------|----------------|
| `src/features/notations/utils/exportedNodeShape.ts` | `ExportedNodeShape` type + strip `documentFileId` from attrs JSON |
| `src/features/notations/utils/uniqueShapeName.ts` | Case-insensitive `Name` / `Name (2)` allocator |
| `src/features/notations/utils/notationShapePackage.ts` | Collect ids from components; synthesize from outline; merge package + fallback; remap `customShapeId` |
| `src/features/notations/utils/persistPendingShapes.ts` | Create shapes via API, conflict names, remap, compensating deletes |
| `*.test.ts` next to each util | Unit tests |

### warchi (modify)

| File | Change |
|------|--------|
| `src/features/notations/composables/useNotationExport.ts` | v2 payload + async export shapes; import → `pendingShapes` |
| `src/features/notations/composables/useNotationEditor.ts` | `pendingShapes` ref; persist before `saveComponents` |
| `src/features/notations/NotationEditorPage.vue` | Wire `pendingShapes`; await async export |
| `src/features/diagram-style/components/NodeStylePanel.vue` | Always refetch catalog when opening custom shape UI |
| `src/features/diagram-style/components/composite/CompositeStylePanel.vue` | Same refetch behavior |
| `src/features/notations/composables/useNotationImportApi.ts` | `shapes` + `shapeIdMap` on types; map export → API body |
| `src/i18n/locales/notations.ts` | Save/export shape error strings (ru/en) |

### arepos-server (modify)

| File | Change |
|------|--------|
| `dto/import/NotationImportDtos.kt` | `ImportedNodeShape`, `shapes` on request, `shapeIdMap` on response |
| `repository/NodeShapesRepository.kt` | `findByOwnerAndNameIgnoreCase` (and/or list-by-owner for conflict scan) |
| `service/NotationImportService.kt` | Create shapes, fallback synthesize, remap attrs, return map |
| `controller/NotationImportControllerTest.kt` (+ optional service test) | Shapes create + remap + name conflict + fallback |

---

### Task 0: Matching branch in arepos-server

**Files:** arepos-server git only

- [ ] **Step 1: Create branch**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
git checkout master
git pull --ff-only || true
git checkout -b feat/notation-export-shapes
```

- [ ] **Step 2: Confirm warchi branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git checkout feat/notation-export-shapes
```

- [ ] **Step 3: Commit is N/A** (branch only)

---

### Task 1: Pure helpers — unique name + attrs strip

**Files:**
- Create: `src/features/notations/utils/uniqueShapeName.ts`
- Create: `src/features/notations/utils/uniqueShapeName.test.ts`
- Create: `src/features/notations/utils/exportedNodeShape.ts`
- Create: `src/features/notations/utils/exportedNodeShape.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// uniqueShapeName.test.ts
import { describe, it, expect } from 'vitest'
import { nextUniqueShapeName } from './uniqueShapeName'

describe('nextUniqueShapeName', () => {
  it('returns base when free', () => {
    expect(nextUniqueShapeName('Hex', new Set())).toBe('Hex')
  })
  it('suffixes on case-insensitive conflict', () => {
    expect(nextUniqueShapeName('Hex', new Set(['hex']))).toBe('Hex (2)')
    expect(nextUniqueShapeName('Hex', new Set(['Hex', 'Hex (2)']))).toBe('Hex (3)')
  })
})
```

```ts
// exportedNodeShape.test.ts
import { describe, it, expect } from 'vitest'
import { stripShapeDocumentFileId, type ExportedNodeShape } from './exportedNodeShape'

describe('stripShapeDocumentFileId', () => {
  it('removes documentFileId from attrs JSON', () => {
    const shape: ExportedNodeShape = {
      id: 's1',
      name: 'A',
      outline: '[]',
      attrs: JSON.stringify({ documentFileId: 'f1', keep: true }),
    }
    expect(JSON.parse(stripShapeDocumentFileId(shape).attrs!)).toEqual({ keep: true })
  })
  it('leaves null attrs alone', () => {
    expect(stripShapeDocumentFileId({ id: 's1', name: 'A', outline: '[]', attrs: null }).attrs).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/notations/utils/uniqueShapeName.test.ts src/features/notations/utils/exportedNodeShape.test.ts
```

- [ ] **Step 3: Implement**

```ts
// uniqueShapeName.ts
export function nextUniqueShapeName(baseName: string, takenNames: Set<string>): string {
  const takenLower = new Set([...takenNames].map((n) => n.toLowerCase()))
  const base = baseName.trim() || 'Imported shape'
  if (!takenLower.has(base.toLowerCase())) return base
  let n = 2
  while (takenLower.has(`${base} (${n})`.toLowerCase())) n += 1
  return `${base} (${n})`
}
```

```ts
// exportedNodeShape.ts
export type ExportedNodeShape = {
  id: string
  name: string
  outline: string
  contentArea?: string | null
  attrs?: string | null
}

export function stripShapeDocumentFileId(shape: ExportedNodeShape): ExportedNodeShape {
  if (shape.attrs == null || shape.attrs === '') return shape
  try {
    const parsed = JSON.parse(shape.attrs) as Record<string, unknown>
    if (!('documentFileId' in parsed)) return shape
    const { documentFileId: _removed, ...rest } = parsed
    return { ...shape, attrs: JSON.stringify(rest) }
  } catch {
    return shape
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/features/notations/utils/uniqueShapeName.test.ts src/features/notations/utils/exportedNodeShape.test.ts
```

- [ ] **Step 5: Commit (warchi)**

```bash
git add src/features/notations/utils/uniqueShapeName.ts src/features/notations/utils/uniqueShapeName.test.ts \
  src/features/notations/utils/exportedNodeShape.ts src/features/notations/utils/exportedNodeShape.test.ts
git commit -m "$(cat <<'EOF'
Add shape name uniqueness and attrs strip helpers for notation export.

EOF
)"
```

---

### Task 2: Pure helpers — package collect / synthesize / remap

**Files:**
- Create: `src/features/notations/utils/notationShapePackage.ts`
- Create: `src/features/notations/utils/notationShapePackage.test.ts`

- [ ] **Step 1: Write failing tests** covering:

1. `collectCustomShapeIds(components)` — unique ids from `parsedAttrs.diagramStyle.customShapeId`, skip deleted / empty.
2. `synthesizeShapesFromComponents(components, existingIds)` — for ids not in `existingIds` (or missing id with outline only), build `ExportedNodeShape` with `outline: JSON.stringify(customOutline)`, name `"Imported shape"`.
3. `mergeShapePackage(packageShapes, components)` — package wins for known ids; synthesize missing.
4. `remapComponentCustomShapeIds(components, map)` — updates `diagramStyle.customShapeId` when in map; leaves others.

Example test sketch:

```ts
import { describe, it, expect } from 'vitest'
import {
  collectCustomShapeIds,
  mergeShapePackage,
  remapComponentCustomShapeIds,
} from './notationShapePackage'
import type { EditorComponent } from '../types'

const component = (partial: Partial<EditorComponent> & { id: string }): EditorComponent =>
  ({
    name: 'C',
    ownerId: 'o',
    notationId: 'n',
    nodeTypeId: 't',
    version: '1.0.0',
    parsedAttrs: {},
    ...partial,
  }) as EditorComponent

describe('notationShapePackage', () => {
  it('collects distinct customShapeIds', () => {
    const ids = collectCustomShapeIds([
      component({
        id: 'c1',
        parsedAttrs: { diagramStyle: { customShapeId: 's1', customOutline: [{ type: 'line', x: 0, y: 0 }] } },
      }),
      component({
        id: 'c2',
        parsedAttrs: { diagramStyle: { customShapeId: 's1', customOutline: [{ type: 'line', x: 1, y: 1 }] } },
      }),
      component({ id: 'c3', _isDeleted: true, parsedAttrs: { diagramStyle: { customShapeId: 's2' } } }),
    ])
    expect([...ids]).toEqual(['s1'])
  })

  it('merges package with outline fallback', () => {
    const shapes = mergeShapePackage(
      [{ id: 's1', name: 'Pack', outline: '[{"type":"line","x":0,"y":0}]' }],
      [
        component({
          id: 'c1',
          parsedAttrs: {
            diagramStyle: {
              customShapeId: 's1',
              customOutline: [{ type: 'line', x: 0, y: 0 }],
            },
          },
        }),
        component({
          id: 'c2',
          parsedAttrs: {
            diagramStyle: {
              customShapeId: 's2',
              customOutline: [{ type: 'line', x: 0.5, y: 0.5 }],
            },
          },
        }),
      ]
    )
    expect(shapes.map((s) => s.id).sort()).toEqual(['s1', 's2'])
    expect(shapes.find((s) => s.id === 's1')?.name).toBe('Pack')
    expect(shapes.find((s) => s.id === 's2')?.name).toBe('Imported shape')
  })

  it('remaps customShapeId on components', () => {
    const comps = [
      component({
        id: 'c1',
        parsedAttrs: { diagramStyle: { customShapeId: 'old', customOutline: [] } },
      }),
    ]
    remapComponentCustomShapeIds(comps, new Map([['old', 'new']]))
    expect(comps[0]?.parsedAttrs.diagramStyle?.customShapeId).toBe('new')
  })
})
```

Adjust `OutlineSegment` type import to match `notationAttrs` if the sketch segment shape differs — use a real valid segment from existing tests (`customOutlinePath.test.ts`).

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/notations/utils/notationShapePackage.test.ts
```

- [ ] **Step 3: Implement `notationShapePackage.ts`**

Public API:

```ts
export function collectCustomShapeIds(components: EditorComponent[]): Set<string>
export function synthesizeShapesFromComponents(
  components: EditorComponent[],
  alreadyHaveIds: Set<string>
): ExportedNodeShape[]
export function mergeShapePackage(
  packageShapes: ExportedNodeShape[],
  components: EditorComponent[]
): ExportedNodeShape[]
export function remapComponentCustomShapeIds(
  components: EditorComponent[],
  idMap: Map<string, string>
): void
```

Rules from spec: skip `_isDeleted`; require non-empty outline for synthesis; default name `"Imported shape"`; package entries win on id collision.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/utils/notationShapePackage.ts src/features/notations/utils/notationShapePackage.test.ts
git commit -m "$(cat <<'EOF'
Add notation shape package collect/merge/remap helpers.

EOF
)"
```

---

### Task 3: Persist pending shapes helper

**Files:**
- Create: `src/features/notations/utils/persistPendingShapes.ts`
- Create: `src/features/notations/utils/persistPendingShapes.test.ts`

- [ ] **Step 1: Failing tests** with mocked `create` / `remove` / `listNames`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { persistPendingShapes } from './persistPendingShapes'

describe('persistPendingShapes', () => {
  it('creates with unique names and returns id map', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'n1' })
      .mockResolvedValueOnce({ id: 'n2' })
    const remove = vi.fn()
    const map = await persistPendingShapes({
      shapes: [
        { id: 'o1', name: 'Hex', outline: '[]' },
        { id: 'o2', name: 'Hex', outline: '[]' },
      ],
      existingNames: ['Hex'],
      create: async (req) => create(req),
      remove: async (id) => {
        remove(id)
        return true
      },
    })
    expect(map.get('o1')).toBe('n1')
    expect(map.get('o2')).toBe('n2')
    expect(create.mock.calls[0]?.[0].name).toBe('Hex (2)')
    expect(create.mock.calls[1]?.[0].name).toBe('Hex (3)')
  })

  it('deletes earlier creates when a later create fails', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'n1' })
      .mockResolvedValueOnce(null)
    const remove = vi.fn().mockResolvedValue(true)
    await expect(
      persistPendingShapes({
        shapes: [
          { id: 'o1', name: 'A', outline: '[]' },
          { id: 'o2', name: 'B', outline: '[]' },
        ],
        existingNames: [],
        create: async (req) => create(req),
        remove,
      })
    ).rejects.toThrow()
    expect(remove).toHaveBeenCalledWith('n1')
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
import { nextUniqueShapeName } from './uniqueShapeName'
import { stripShapeDocumentFileId, type ExportedNodeShape } from './exportedNodeShape'
import type { NodeShapeRequest } from '@/types/api'

export type PersistPendingShapesDeps = {
  shapes: ExportedNodeShape[]
  existingNames: string[]
  create: (request: NodeShapeRequest) => Promise<{ id: string } | null>
  remove: (id: string) => Promise<boolean>
}

export async function persistPendingShapes(
  deps: PersistPendingShapesDeps
): Promise<Map<string, string>> {
  const taken = new Set(deps.existingNames)
  const createdIds: string[] = []
  const idMap = new Map<string, string>()
  try {
    for (const raw of deps.shapes) {
      const shape = stripShapeDocumentFileId(raw)
      const name = nextUniqueShapeName(shape.name, taken)
      taken.add(name)
      const created = await deps.create({
        name,
        outline: shape.outline,
        contentArea: shape.contentArea ?? null,
        attrs: shape.attrs ?? null,
      })
      if (!created) throw new Error(`Failed to create shape "${name}"`)
      createdIds.push(created.id)
      idMap.set(shape.id, created.id)
    }
    return idMap
  } catch (error) {
    for (const id of createdIds.reverse()) {
      try {
        await deps.remove(id)
      } catch {
        /* best effort */
      }
    }
    throw error
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
git add src/features/notations/utils/persistPendingShapes.ts src/features/notations/utils/persistPendingShapes.test.ts
git commit -m "$(cat <<'EOF'
Add persistPendingShapes with compensating delete on failure.

EOF
)"
```

---

### Task 4: Export v2 includes `shapes[]`

**Files:**
- Modify: `src/features/notations/composables/useNotationExport.ts`
- Create: `src/features/notations/composables/useNotationExport.shapes.test.ts` (unit-test extractable builders; or test pure `buildExportShapes` if extracted to util)

Prefer extracting async builder to util for testability:

- Create: `src/features/notations/utils/buildExportShapes.ts`
- Create: `src/features/notations/utils/buildExportShapes.test.ts`

- [ ] **Step 1: Failing tests for `buildExportShapes`**

```ts
// deps: fetchById(id) => Promise<NodeShapeResponse | null>
// inputs: components, pendingShapes?
// - uses pendingShapes when non-empty (re-export before save)
// - else fetchById per collected id; on null + outline → synthetic
// - never includes unused shapes
```

- [ ] **Step 2: Implement `buildExportShapes`**

```ts
export async function buildExportShapes(params: {
  components: EditorComponent[]
  pendingShapes: ExportedNodeShape[]
  fetchById: (id: string) => Promise<{
    id: string
    name: string
    outline: string | null
    contentArea?: string | null
    attrs?: string | null
  } | null>
}): Promise<ExportedNodeShape[]>
```

Algorithm:

1. If `pendingShapes.length > 0` → `mergeShapePackage(pendingShapes, components)` (already stripped on import).
2. Else for each `collectCustomShapeIds`: `fetchById`; on hit push stripped catalog row (`outline` must be string — use `outline ?? '[]'`); on miss synthesize from components via `mergeShapePackage([], …)` filtered to that id / use `synthesizeShapesFromComponents`.

- [ ] **Step 3: Wire `exportNotation` to async**

In `useNotationExport.ts`:

- Accept `pendingShapes: Ref<ExportedNodeShape[]>`.
- Change payload type to `version: 2` + `shapes`.
- `exportNotation` becomes `async` and sets `shapes: await buildExportShapes(...)`.
- Use `useNodeShapes().fetchById` (or inject `apiGet`).

- [ ] **Step 4: Update `NotationEditorPage.vue`** callers to `await exportNotation()` if needed.

- [ ] **Step 5: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
Include used custom shapes in notation export v2 payload.

EOF
)"
```

---

### Task 5: Import sets `pendingShapes`

**Files:**
- Modify: `src/features/notations/composables/useNotationExport.ts` (`normalizeImportedState` / import handler)
- Modify: `src/features/notations/composables/useNotationEditor.ts` (own `pendingShapes` ref, return it)
- Modify: `src/features/notations/NotationEditorPage.vue` (pass ref into export composable)

- [ ] **Step 1: Change normalize API**

Return `{ state, pendingShapes }` instead of only state:

```ts
export type NotationImportResult = {
  state: NotationEditorState
  pendingShapes: ExportedNodeShape[]
}
```

When wrapper present: `pendingShapes = mergeShapePackage(toExportedShapes(raw.shapes), components)` after components are remapped for type ids (shape ids stay as in file). Strip documentFileId on each shape. When no wrapper / no shapes: `mergeShapePackage([], components)` so v1 still gets synthetic pending entries when outlines exist.

- [ ] **Step 2: `handleNotationImportChange`**

```ts
const { state: nextState, pendingShapes: nextShapes } = normalizeImportedState(parsed)
state.value = nextState
pendingShapes.value = nextShapes
```

- [ ] **Step 3: Unit test normalize** (extract `normalizeImportedState` to testable export or test via dedicated `normalizeNotationImport.ts`)

Prefer move normalize to `src/features/notations/utils/normalizeNotationImport.ts` if the composable is hard to test — do that split if tests need it.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Load pendingShapes from notation import without creating catalog rows.

EOF
)"
```

---

### Task 6: Persist shapes in `saveChanges` + refresh select

**Files:**
- Modify: `src/features/notations/composables/useNotationEditor.ts`
- Modify: `src/features/diagram-style/components/NodeStylePanel.vue`
- Modify: `src/features/diagram-style/components/composite/CompositeStylePanel.vue`
- Modify: `src/i18n/locales/notations.ts`

- [ ] **Step 1: In `saveChanges`, after `resolveNewTypes` for links, before `saveComponents`:**

```ts
const shapesToPersist =
  pendingShapes.value.length > 0
    ? mergeShapePackage(pendingShapes.value, components)
    : mergeShapePackage([], components)

if (shapesToPersist.length > 0) {
  onProgress(/* i18n key notations.saveProgressShapes */)
  const { list, fetchList, create, remove } = useNodeShapes()
  await fetchList({ size: 200 }) // enough for name conflict soft check; page further if needed
  // If totalElements > list.length, loop pages or fetchAllPages pattern used elsewhere
  const existingNames = list.value.map((s) => s.name)
  let idMap: Map<string, string>
  try {
    idMap = await persistPendingShapes({
      shapes: shapesToPersist,
      existingNames,
      create: async (req) => {
        const row = await create(req)
        return row ? { id: row.id } : null
      },
      remove: async (id) => remove(id),
    })
  } catch (error) {
    throw new Error(
      t('notations.saveErrorShapes', {
        message: error instanceof Error ? error.message : String(error),
      })
    )
  }
  remapComponentCustomShapeIds(components, idMap)
  for (const c of components) {
    if (idMap.has(/* old — remap already wrote new; mark dirty if not new */)) {
      /* remap helper should set _isDirty when id changed and !_isNew */
    }
  }
  pendingShapes.value = []
  window.dispatchEvent(new CustomEvent('warchi-node-shapes-changed'))
}
```

Ensure `remapComponentCustomShapeIds` sets `_isDirty = true` when the id actually changes and the component is not purely `_isNew` (new components already save with new attrs).

Use `fetchAllPages` from `@/api/fetchAllPages` if the project already pages catalogs that way — prefer that over a single `size: 200` if available for `/node-shapes`.

- [ ] **Step 2: i18n**

```ts
// ru
saveProgressShapes: 'Создание форм…',
saveErrorShapes: 'Не удалось создать формы: {message}',
// en
saveProgressShapes: 'Creating shapes…',
saveErrorShapes: 'Failed to create shapes: {message}',
```

- [ ] **Step 3: Style panels — always refetch**

Replace:

```ts
function ensureCatalogShapesLoaded() {
  if (catalogShapes.value.length === 0) fetchNodeShapes({ size: 200 })
}
```

with:

```ts
function ensureCatalogShapesLoaded() {
  void fetchNodeShapes({ size: 200 })
}
```

And on mount (or `onMounted`):

```ts
window.addEventListener('warchi-node-shapes-changed', ensureCatalogShapesLoaded)
onBeforeUnmount(() => {
  window.removeEventListener('warchi-node-shapes-changed', ensureCatalogShapesLoaded)
})
```

Same in `CompositeStylePanel.vue`.

- [ ] **Step 4: Manual sanity** (optional in agent run): import v2 JSON → Save → open custom shape select → new names present; second Save does not duplicate.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Persist imported shapes on notation save and refresh shape selects.

EOF
)"
```

---

### Task 7: arepos-server — DTOs + repository

**Files:**
- Modify: `src/main/kotlin/ru/kavader/arepos/dto/import/NotationImportDtos.kt`
- Modify: `src/main/kotlin/ru/kavader/arepos/repository/NodeShapesRepository.kt`

- [ ] **Step 1: Extend DTOs**

```kotlin
// on NotationImportRequest:
@field:Size(max = 1000)
@field:Valid
val shapes: List<ImportedNodeShape> = emptyList(),

data class ImportedNodeShape(
    @field:NotBlank @field:Size(max = 255) val id: String,
    @field:NotBlank @field:Size(max = 255) val name: String,
    @field:Size(max = 500000) val outline: String? = null,
    @field:Size(max = 100000) val contentArea: String? = null,
    @field:Size(max = 100000) val attrs: String? = null
)

// on NotationImportResponse:
val shapeIdMap: Map<String, UUID> = emptyMap()
```

- [ ] **Step 2: Repository**

```kotlin
fun findByOwnerAndNameIgnoreCase(owner: Users, name: String): NodeShapes?
fun findByOwner(owner: Users): List<NodeShapes> // for loading all names if needed
```

Keep `findByOwner(owner, pageable)` — add non-page overload or use `findAll` filtered; simplest for import: `fun findByOwner(owner: Users): List<NodeShapes>`.

- [ ] **Step 3: Commit (arepos-server)**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
git add src/main/kotlin/ru/kavader/arepos/dto/import/NotationImportDtos.kt \
  src/main/kotlin/ru/kavader/arepos/repository/NodeShapesRepository.kt
git commit -m "$(cat <<'EOF'
Add shapes fields to notation import DTOs and node shape name lookup.

EOF
)"
```

---

### Task 8: arepos-server — import service shapes + attrs remap

**Files:**
- Modify: `src/main/kotlin/ru/kavader/arepos/service/NotationImportService.kt`
- Optionally create: `src/main/kotlin/ru/kavader/arepos/service/NotationImportShapeSupport.kt` if the service file gets too large

- [ ] **Step 1: Inject `NodeShapesRepository`**

- [ ] **Step 2: Before component loop**, build effective shapes:

1. Start from `request.shapes`.
2. Scan component attrs JSON for `diagramStyle.customShapeId` + `customOutline`; for missing ids with non-empty outline array, append synthetic `ImportedNodeShape(id, "Imported shape", outlineJson)`.
3. Load existing owner shape names (case-insensitive set).
4. For each shape: allocate unique name (`Name`, `Name (2)`, …); strip `documentFileId` from attrs via Jackson `ObjectMapper`; `save(NodeShapes(...))`; fill `shapeIdMap`.

- [ ] **Step 3: When saving each component**, set `attrs = remapCustomShapeIdInAttrs(importedComponent.attrs, shapeIdMap)`.

```kotlin
internal fun remapCustomShapeIdInAttrs(attrs: String?, shapeIdMap: Map<String, UUID>, objectMapper: ObjectMapper): String? {
    if (attrs.isNullOrBlank() || shapeIdMap.isEmpty()) return attrs
    return try {
        val root = objectMapper.readTree(attrs)
        if (!root.isObject) return attrs
        val diagramStyle = root.get("diagramStyle") ?: return attrs
        if (!diagramStyle.isObject) return attrs
        val oldId = diagramStyle.get("customShapeId")?.asText() ?: return attrs
        val newId = shapeIdMap[oldId] ?: return attrs
        (diagramStyle as ObjectNode).put("customShapeId", newId.toString())
        objectMapper.writeValueAsString(root)
    } catch (_: Exception) {
        attrs
    }
}
```

- [ ] **Step 4: Return `shapeIdMap` in response**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Create node shapes during notation import and remap customShapeId.

EOF
)"
```

---

### Task 9: arepos-server — integration tests

**Files:**
- Modify: `src/test/kotlin/ru/kavader/arepos/controller/NotationImportControllerTest.kt`
- Optionally: unit test for `remapCustomShapeIdInAttrs` / name allocator if extracted

- [ ] **Step 1: Test — import with shapes creates rows and remaps attrs**

Request includes one `ImportedNodeShape` and a component whose attrs reference that id. Assert:

- `shapeIdMap` present and old≠new
- `node_shapes` row owned by caller with expected outline
- saved component attrs have new `customShapeId`

- [ ] **Step 2: Test — name conflict gets ` (2)`**

Persist existing shape named `Hex` for caller; import shape named `Hex`; assert created name is `Hex (2)`.

- [ ] **Step 3: Test — fallback from component outline when `shapes` empty**

Component attrs: `diagramStyle: { customShapeId, customOutline: [...] }` only. Assert a shape is created and id remapped.

- [ ] **Step 4: Run**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "NotationImportControllerTest"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Cover notation import shape create, rename, and outline fallback.

EOF
)"
```

---

### Task 10: warchi API helper types

**Files:**
- Modify: `src/features/notations/composables/useNotationImportApi.ts`

- [ ] **Step 1: Update types**

```ts
export interface NotationImportApiRequest {
  notation: { name: string; version: string; attrs?: string | null }
  nodeTypes?: Array<{ id: string; name: string; attrs?: string | null }>
  linkTypes?: Array<{ id: string; name: string; attrs?: string | null }>
  components?: Array<{
    id: string
    name: string
    nodeTypeId: string
    version?: string | null
    attrs?: string | null
  }>
  relations?: Array<{
    id: string
    name: string
    linkTypeId: string
    version?: string | null
    attrs?: string | null
  }>
  relationRules?: Array<{
    fromComponentId: string
    toComponentId: string
    allowedRelationIds: string[]
  }>
  shapes?: Array<{
    id: string
    name: string
    outline?: string | null
    contentArea?: string | null
    attrs?: string | null
  }>
}

export interface NotationImportApiResponse {
  notationId: string
  nodeTypeIdMap: Record<string, string>
  linkTypeIdMap: Record<string, string>
  componentIdMap: Record<string, string>
  relationIdMap: Record<string, string>
  shapeIdMap?: Record<string, string>
}
```

Change `importNotationViaApi` to accept `NotationImportApiRequest` (not raw export JSON). Optionally add `notationExportToImportRequest(exportPayload): NotationImportApiRequest` in the same file or a util — only if needed for a caller; keep YAGNI unless a test/caller needs it.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
Align notation import API client types with shapes support.

EOF
)"
```

---

### Task 11: Verification

**warchi**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/notations/utils/
```

**arepos-server**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "NotationImportControllerTest"
```

- [ ] **Step 1: All targeted tests PASS**
- [ ] **Step 2: Spec coverage check** — every Success criteria row has a task above (export per-id fetch = T4; Save persist = T6; API = T8–T9; v1 fallback = T5/T6/T9; no duplicate on re-save = T6 clears `pendingShapes`)
- [ ] **Step 3: Final commit only if leftover fixes**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Export used shapes via GET by id | T4 |
| Synthetic export when fetch fails + outline | T4 / T2 |
| Top-level `shapes`, version 2 | T4 |
| `pendingShapes` outside wire state | T5 |
| Persist on Save before components | T6 |
| Name `(2)` case-insensitive | T1, T3, T8 |
| Compensating delete on client | T3 |
| Refresh shape select | T6 |
| Server shapes + remap + fallback | T8–T9 |
| Client API types | T10 |
| No DB unique constraint / no Import-button→API wiring | Out of scope ✓ |

No intentional TBD placeholders in tasks.

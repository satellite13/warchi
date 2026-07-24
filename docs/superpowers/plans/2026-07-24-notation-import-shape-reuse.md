# Notation import — reuse existing shapes by name — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On notation file import, when packaged custom shapes share a name with shapes already available to the user, show a hybrid resolve dialog (with geometry previews) so the user can reuse a catalog shape or create a new one before the import is applied.

**Architecture:** Pure helpers analyze name conflicts and apply resolutions. `useNotationExport` fetches `/node-shapes` after file pick, shows the shape dialog before the existing local-only merge dialog, then `normalizeNotationImport` + `applyShapeImportResolutions` remaps reused `customShapeId`s / syncs `customOutline` and leaves only create/unmatched shapes in `pendingShapes`. Save path unchanged.

**Tech Stack:** Vue 3 + TypeScript + Vitest; existing `BaseModal`, `customOutlineToSvgPath`, `fetchAllPages`

**Spec:** `docs/superpowers/specs/2026-07-24-notation-import-shape-reuse-design.md`

**Branch:** `feat/notation-import-shape-reuse` in **warchi** only (no arepos-server / papirus)

---

## File map

### Create

| File | Responsibility |
|------|----------------|
| `src/features/notations/utils/outlinesEquivalent.ts` | Parse outline JSON strings; stable equality |
| `src/features/notations/utils/outlinesEquivalent.test.ts` | Unit tests |
| `src/features/notations/utils/importShapeConflicts.ts` | Types, sort candidates, analyze conflicts, default resolutions, bulk action |
| `src/features/notations/utils/importShapeConflicts.test.ts` | Unit tests |
| `src/features/notations/utils/applyShapeImportResolutions.ts` | Filter `pendingShapes`, remap ids, sync `customOutline` from catalog |
| `src/features/notations/utils/applyShapeImportResolutions.test.ts` | Unit tests |
| `src/features/notations/components/OutlineShapePreview.vue` | Small SVG preview from outline JSON / segments |
| `src/features/notations/components/NotationImportShapeResolveDialog.vue` | Hybrid resolve modal UI |

### Modify

| File | Change |
|------|--------|
| `src/features/notations/utils/normalizeNotationImport.ts` | Export `collectImportShapes(raw)` used for pre-dialog analysis (same shapes as normalize’s pending package before resolutions) |
| `src/features/notations/composables/useNotationExport.ts` | Fetch catalog → shape dialog → then local-only dialog → apply with resolutions |
| `src/features/notations/NotationEditorPage.vue` | Mount shape-resolve dialog; wire props/events |
| `src/i18n/locales/notations.ts` | ru/en strings for the dialog |

---

### Task 0: Feature branch

**Files:** git only

- [ ] **Step 1: Create and checkout branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git checkout master
git checkout -b feat/notation-import-shape-reuse
```

- [ ] **Step 2: Confirm branch**

```bash
git branch --show-current
```

Expected: `feat/notation-import-shape-reuse`

---

### Task 1: `outlinesEquivalent`

**Files:**
- Create: `src/features/notations/utils/outlinesEquivalent.ts`
- Create: `src/features/notations/utils/outlinesEquivalent.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { outlinesEquivalent } from './outlinesEquivalent'

const rect = JSON.stringify([
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
])

describe('outlinesEquivalent', () => {
  it('returns true for identical JSON', () => {
    expect(outlinesEquivalent(rect, rect)).toBe(true)
  })

  it('returns true when whitespace differs but segments match', () => {
    const spaced = JSON.stringify(JSON.parse(rect), null, 2)
    expect(outlinesEquivalent(rect, spaced)).toBe(true)
  })

  it('returns false for different geometry', () => {
    const other = JSON.stringify([{ type: 'line', points: [[0, 0], [2, 0]] }])
    expect(outlinesEquivalent(rect, other)).toBe(false)
  })

  it('returns false for null/invalid/empty either side', () => {
    expect(outlinesEquivalent(null, rect)).toBe(false)
    expect(outlinesEquivalent(rect, null)).toBe(false)
    expect(outlinesEquivalent('not-json', rect)).toBe(false)
    expect(outlinesEquivalent('[]', rect)).toBe(false)
    expect(outlinesEquivalent(rect, '[]')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/notations/utils/outlinesEquivalent.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'

function parseOutlineSegments(raw: string | null | undefined): OutlineSegment[] | null {
  if (raw == null || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed as OutlineSegment[]
  } catch {
    return null
  }
}

/** Stable geometry compare: parse JSON outlines and deep-compare segments. */
export function outlinesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = parseOutlineSegments(a)
  const right = parseOutlineSegments(b)
  if (!left || !right) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

export function parseOutlineSegmentsOrEmpty(raw: string | null | undefined): OutlineSegment[] {
  return parseOutlineSegments(raw) ?? []
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/features/notations/utils/outlinesEquivalent.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/utils/outlinesEquivalent.ts src/features/notations/utils/outlinesEquivalent.test.ts
git commit -m "$(cat <<'EOF'
Add outline equality helper for import shape matching.

EOF
)"
```

---

### Task 2: Analyze conflicts + default / bulk resolutions

**Files:**
- Create: `src/features/notations/utils/importShapeConflicts.ts`
- Create: `src/features/notations/utils/importShapeConflicts.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { NodeShapeResponse } from '@/types/api'
import type { ExportedNodeShape } from './exportedNodeShape'
import {
  analyzeImportShapeConflicts,
  defaultShapeImportResolutions,
  setBulkShapeImportAction,
  sortShapeCandidates,
} from './importShapeConflicts'

const outlineA = JSON.stringify([{ type: 'line', points: [[0, 0], [1, 0]] }])
const outlineB = JSON.stringify([{ type: 'line', points: [[0, 0], [2, 0]] }])

function catalog(partial: Partial<NodeShapeResponse> & Pick<NodeShapeResponse, 'id' | 'name'>): NodeShapeResponse {
  return {
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ownerId: 'u1',
    outline: outlineA,
    accessPermission: 'OWNER',
    ...partial,
  }
}

function imported(partial: Partial<ExportedNodeShape> & Pick<ExportedNodeShape, 'id' | 'name'>): ExportedNodeShape {
  return { outline: outlineA, ...partial }
}

describe('sortShapeCandidates', () => {
  it('orders OWNER before EDIT before VIEW, then updatedAt desc', () => {
    const list = [
      catalog({ id: 'v', name: 'Hex', accessPermission: 'VIEW', updatedAt: '2026-03-01T00:00:00Z' }),
      catalog({ id: 'e-old', name: 'Hex', accessPermission: 'EDIT', updatedAt: '2026-01-01T00:00:00Z' }),
      catalog({ id: 'e-new', name: 'Hex', accessPermission: 'EDIT', updatedAt: '2026-02-01T00:00:00Z' }),
      catalog({ id: 'o', name: 'Hex', accessPermission: 'OWNER', updatedAt: '2026-01-01T00:00:00Z' }),
    ]
    expect(sortShapeCandidates(list).map((s) => s.id)).toEqual(['o', 'e-new', 'e-old', 'v'])
  })
})

describe('analyzeImportShapeConflicts', () => {
  it('matches names case-insensitively and skips unmatched', () => {
    const conflicts = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hexagon' }), imported({ id: 'i2', name: 'OnlyInFile' })],
      [catalog({ id: 'c1', name: 'hexagon' })]
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.imported.id).toBe('i1')
    expect(conflicts[0]!.candidates.map((c) => c.id)).toEqual(['c1'])
    expect(conflicts[0]!.geometryMatches).toEqual([true])
  })

  it('marks geometry mismatch per candidate', () => {
    const conflicts = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hex', outline: outlineA })],
      [catalog({ id: 'c1', name: 'Hex', outline: outlineB })]
    )
    expect(conflicts[0]!.geometryMatches).toEqual([false])
  })
})

describe('defaultShapeImportResolutions', () => {
  it('reuses first geometry match; otherwise create with first candidate selected', () => {
    const match = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hex', outline: outlineA })],
      [catalog({ id: 'c1', name: 'Hex', outline: outlineA })]
    )
    expect(defaultShapeImportResolutions(match)).toEqual([
      { importedId: 'i1', action: 'reuse', catalogShapeId: 'c1' },
    ])

    const differ = analyzeImportShapeConflicts(
      [imported({ id: 'i2', name: 'Hex', outline: outlineA })],
      [catalog({ id: 'c2', name: 'Hex', outline: outlineB })]
    )
    expect(defaultShapeImportResolutions(differ)).toEqual([
      { importedId: 'i2', action: 'create', catalogShapeId: 'c2' },
    ])
  })

  it('among multiple candidates prefers matching outline by sort order', () => {
    const conflicts = analyzeImportShapeConflicts(
      [imported({ id: 'i1', name: 'Hex', outline: outlineA })],
      [
        catalog({ id: 'owner-diff', name: 'Hex', outline: outlineB, accessPermission: 'OWNER' }),
        catalog({
          id: 'edit-match',
          name: 'Hex',
          outline: outlineA,
          accessPermission: 'EDIT',
          updatedAt: '2026-02-01T00:00:00Z',
        }),
      ]
    )
    expect(defaultShapeImportResolutions(conflicts)[0]).toEqual({
      importedId: 'i1',
      action: 'reuse',
      catalogShapeId: 'edit-match',
    })
  })
})

describe('setBulkShapeImportAction', () => {
  it('sets action on all rows without clearing catalogShapeId', () => {
    const resolutions = [
      { importedId: 'i1', action: 'reuse' as const, catalogShapeId: 'c1' },
      { importedId: 'i2', action: 'create' as const, catalogShapeId: 'c2' },
    ]
    expect(setBulkShapeImportAction(resolutions, 'create')).toEqual([
      { importedId: 'i1', action: 'create', catalogShapeId: 'c1' },
      { importedId: 'i2', action: 'create', catalogShapeId: 'c2' },
    ])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/features/notations/utils/importShapeConflicts.test.ts
```

- [ ] **Step 3: Implement `importShapeConflicts.ts`**

```ts
import type { NodeShapeResponse } from '@/types/api'
import type { ExportedNodeShape } from './exportedNodeShape'
import { outlinesEquivalent } from './outlinesEquivalent'

export type ShapeImportAction = 'reuse' | 'create'

export type ShapeImportConflict = {
  imported: ExportedNodeShape
  candidates: NodeShapeResponse[]
  geometryMatches: boolean[]
}

export type ShapeImportResolution = {
  importedId: string
  action: ShapeImportAction
  catalogShapeId?: string
}

const PERM_RANK: Record<string, number> = {
  OWNER: 0,
  ADMIN: 0,
  EDIT: 1,
  VIEW: 2,
}

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

export function sortShapeCandidates(candidates: NodeShapeResponse[]): NodeShapeResponse[] {
  return [...candidates].sort((a, b) => {
    const ra = PERM_RANK[a.accessPermission ?? 'VIEW'] ?? 3
    const rb = PERM_RANK[b.accessPermission ?? 'VIEW'] ?? 3
    if (ra !== rb) return ra - rb
    const ta = a.updatedAt ?? a.createdAt ?? ''
    const tb = b.updatedAt ?? b.createdAt ?? ''
    return tb.localeCompare(ta)
  })
}

export function analyzeImportShapeConflicts(
  importedShapes: ExportedNodeShape[],
  catalogShapes: NodeShapeResponse[]
): ShapeImportConflict[] {
  const byName = new Map<string, NodeShapeResponse[]>()
  for (const shape of catalogShapes) {
    const key = nameKey(shape.name)
    if (!key) continue
    const list = byName.get(key)
    if (list) list.push(shape)
    else byName.set(key, [shape])
  }

  const conflicts: ShapeImportConflict[] = []
  for (const imported of importedShapes) {
    const key = nameKey(imported.name)
    const rawCandidates = byName.get(key)
    if (!rawCandidates || rawCandidates.length === 0) continue
    const candidates = sortShapeCandidates(rawCandidates)
    const geometryMatches = candidates.map((c) => outlinesEquivalent(imported.outline, c.outline))
    conflicts.push({ imported, candidates, geometryMatches })
  }
  return conflicts
}

export function defaultShapeImportResolutions(
  conflicts: ShapeImportConflict[]
): ShapeImportResolution[] {
  return conflicts.map((conflict) => {
    const matchIndex = conflict.geometryMatches.findIndex(Boolean)
    if (matchIndex >= 0) {
      return {
        importedId: conflict.imported.id,
        action: 'reuse',
        catalogShapeId: conflict.candidates[matchIndex]!.id,
      }
    }
    return {
      importedId: conflict.imported.id,
      action: 'create',
      catalogShapeId: conflict.candidates[0]?.id,
    }
  })
}

export function setBulkShapeImportAction(
  resolutions: ShapeImportResolution[],
  action: ShapeImportAction
): ShapeImportResolution[] {
  return resolutions.map((row) => ({ ...row, action }))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/features/notations/utils/importShapeConflicts.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/utils/importShapeConflicts.ts src/features/notations/utils/importShapeConflicts.test.ts
git commit -m "$(cat <<'EOF'
Add import shape conflict analysis and default resolutions.

EOF
)"
```

---

### Task 3: Apply resolutions to components + pendingShapes

**Files:**
- Create: `src/features/notations/utils/applyShapeImportResolutions.ts`
- Create: `src/features/notations/utils/applyShapeImportResolutions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { NodeShapeResponse } from '@/types/api'
import type { EditorComponent } from '../types'
import { applyShapeImportResolutions } from './applyShapeImportResolutions'
import type { ExportedNodeShape } from './exportedNodeShape'

const fileOutline = [{ type: 'line' as const, points: [[0, 0], [1, 0]] as [number, number][] }]
const catalogOutline = [{ type: 'line' as const, points: [[0, 0], [3, 0]] as [number, number][] }]

function component(id: string, shapeId: string): EditorComponent {
  return {
    id,
    name: 'C',
    version: '1.0.0',
    notationId: 'n1',
    ownerId: 'u1',
    nodeTypeId: 't1',
    parsedAttrs: {
      diagramStyle: {
        customShapeId: shapeId,
        customOutline: fileOutline,
      },
    },
    _isNew: true,
  } as EditorComponent
}

describe('applyShapeImportResolutions', () => {
  it('reuses: remaps id, syncs outline from catalog, drops from pending', () => {
    const components = [component('c1', 'imported-s1')]
    const pending: ExportedNodeShape[] = [
      { id: 'imported-s1', name: 'Hex', outline: JSON.stringify(fileOutline) },
      { id: 'imported-s2', name: 'Other', outline: JSON.stringify(fileOutline) },
    ]
    const catalogById = new Map<string, NodeShapeResponse>([
      [
        'catalog-1',
        {
          id: 'catalog-1',
          name: 'Hex',
          ownerId: 'u1',
          createdAt: '2026-01-01T00:00:00Z',
          outline: JSON.stringify(catalogOutline),
        },
      ],
    ])

    const nextPending = applyShapeImportResolutions({
      components,
      pendingShapes: pending,
      resolutions: [{ importedId: 'imported-s1', action: 'reuse', catalogShapeId: 'catalog-1' }],
      catalogById,
    })

    expect(nextPending.map((s) => s.id)).toEqual(['imported-s2'])
    expect(components[0]!.parsedAttrs.diagramStyle?.customShapeId).toBe('catalog-1')
    expect(components[0]!.parsedAttrs.diagramStyle?.customOutline).toEqual(catalogOutline)
  })

  it('create: leaves pending entry and does not remap', () => {
    const components = [component('c1', 'imported-s1')]
    const pending: ExportedNodeShape[] = [
      { id: 'imported-s1', name: 'Hex', outline: JSON.stringify(fileOutline) },
    ]
    const nextPending = applyShapeImportResolutions({
      components,
      pendingShapes: pending,
      resolutions: [{ importedId: 'imported-s1', action: 'create', catalogShapeId: 'catalog-1' }],
      catalogById: new Map(),
    })
    expect(nextPending).toHaveLength(1)
    expect(components[0]!.parsedAttrs.diagramStyle?.customShapeId).toBe('imported-s1')
  })

  it('ignores reuse without catalogShapeId or missing catalog row', () => {
    const components = [component('c1', 'imported-s1')]
    const pending: ExportedNodeShape[] = [
      { id: 'imported-s1', name: 'Hex', outline: JSON.stringify(fileOutline) },
    ]
    const nextPending = applyShapeImportResolutions({
      components,
      pendingShapes: pending,
      resolutions: [{ importedId: 'imported-s1', action: 'reuse' }],
      catalogById: new Map(),
    })
    expect(nextPending).toHaveLength(1)
    expect(components[0]!.parsedAttrs.diagramStyle?.customShapeId).toBe('imported-s1')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/notations/utils/applyShapeImportResolutions.test.ts
```

- [ ] **Step 3: Implement**

```ts
import type { NodeShapeResponse } from '@/types/api'
import type { EditorComponent } from '../types'
import type { ExportedNodeShape } from './exportedNodeShape'
import type { ShapeImportResolution } from './importShapeConflicts'
import { parseOutlineSegmentsOrEmpty } from './outlinesEquivalent'
import { remapComponentCustomShapeIds } from './notationShapePackage'

export function applyShapeImportResolutions(params: {
  components: EditorComponent[]
  pendingShapes: ExportedNodeShape[]
  resolutions: ShapeImportResolution[]
  catalogById: Map<string, NodeShapeResponse>
}): ExportedNodeShape[] {
  const reuseIdMap = new Map<string, string>()
  const reusedImportedIds = new Set<string>()

  for (const resolution of params.resolutions) {
    if (resolution.action !== 'reuse') continue
    const catalogId = resolution.catalogShapeId
    if (!catalogId) continue
    if (!params.catalogById.has(catalogId)) continue
    reusedImportedIds.add(resolution.importedId)
    reuseIdMap.set(resolution.importedId, catalogId)
  }

  remapComponentCustomShapeIds(params.components, reuseIdMap)

  for (const resolution of params.resolutions) {
    if (resolution.action !== 'reuse' || !resolution.catalogShapeId) continue
    const catalogShape = params.catalogById.get(resolution.catalogShapeId)
    if (!catalogShape) continue
    const outline = parseOutlineSegmentsOrEmpty(catalogShape.outline)
    if (outline.length === 0) continue
    for (const component of params.components) {
      if (component._isDeleted) continue
      const style = component.parsedAttrs.diagramStyle
      if (style?.customShapeId !== resolution.catalogShapeId) continue
      component.parsedAttrs.diagramStyle = { ...style, customOutline: outline }
      if (!component._isNew) component._isDirty = true
    }
  }

  return params.pendingShapes.filter((shape) => !reusedImportedIds.has(shape.id))
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/notations/utils/applyShapeImportResolutions.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/utils/applyShapeImportResolutions.ts src/features/notations/utils/applyShapeImportResolutions.test.ts
git commit -m "$(cat <<'EOF'
Apply shape import resolutions to components and pendingShapes.

EOF
)"
```

---

### Task 4: Export `collectImportShapes` from normalize helper

**Files:**
- Modify: `src/features/notations/utils/normalizeNotationImport.ts`
- Modify: `src/features/notations/utils/normalizeNotationImport.test.ts` (one small test)

Goal: pre-dialog analysis must see the **same** shape list normalize would put into `pendingShapes` before resolutions (top-level `shapes[]` + synthesize from components).

- [ ] **Step 1: Add failing test**

In `normalizeNotationImport.test.ts`, reuse the existing fixture that expects `pendingShapes` ids `['s1','s2']` (the “package + synthesize” test). Append:

```ts
it('collectImportShapesFromRaw matches normalize pendingShapes', () => {
  // `raw` and `context` = same objects as in the neighboring package+synthesize test
  const fromHelper = collectImportShapesFromRaw(raw, context.t)
  const { pendingShapes } = normalizeNotationImport(raw, context)
  expect(fromHelper.map((s) => s.id).sort()).toEqual(pendingShapes.map((s) => s.id).sort())
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/notations/utils/normalizeNotationImport.test.ts -t collectImportShapesFromRaw
```

- [ ] **Step 3: Implement**

Refactor the end of `normalizeNotationImport` to use a shared builder:

```ts
export function collectImportShapes(
  raw: unknown,
  components: EditorComponent[]
): ExportedNodeShape[] {
  const parsedShapes = parseExportedShapesFromRaw(raw)
  const activeComponents = components.filter((c) => !c._isDeleted)
  return mergeShapePackage(parsedShapes.map(stripShapeDocumentFileId), activeComponents)
}
```

Inside `normalizeNotationImport`, replace the inline `parseExportedShapesFromRaw` + `mergeShapePackage` block with:

```ts
const pendingShapes = collectImportShapes(raw, components)
```

Add the pre-dialog convenience (full normalize against empty base — once per file pick):

```ts
export function collectImportShapesFromRaw(
  raw: unknown,
  t: ComposerTranslation
): ExportedNodeShape[] {
  const { pendingShapes } = normalizeNotationImport(raw, {
    baseOwnerId: 'preview',
    baseNotationId: 'preview',
    baseState: createEmptyEditorState(),
    localOnlyPolicy: 'keep',
    t,
  })
  return pendingShapes
}
```

On apply, call `normalizeNotationImport` once, then `applyShapeImportResolutions` — do not call `collectImportShapesFromRaw` again at apply time.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/features/notations/utils/normalizeNotationImport.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/notations/utils/normalizeNotationImport.ts src/features/notations/utils/normalizeNotationImport.test.ts
git commit -m "$(cat <<'EOF'
Expose import shape collection for pre-apply conflict analysis.

EOF
)"
```

---

### Task 5: `OutlineShapePreview` component

**Files:**
- Create: `src/features/notations/components/OutlineShapePreview.vue`

- [ ] **Step 1: Implement component** (no separate unit test; covered by dialog usage)

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import { customOutlineToSvgPath } from '@/utils/customOutlinePath'
import { parseOutlineSegmentsOrEmpty } from '@/features/notations/utils/outlinesEquivalent'

const props = withDefaults(
  defineProps<{
    outlineJson?: string | null
    segments?: OutlineSegment[]
    width?: number
    height?: number
    label?: string
  }>(),
  { width: 96, height: 72, outlineJson: null }
)

const pathD = computed(() => {
  const segments =
    props.segments && props.segments.length > 0
      ? props.segments
      : parseOutlineSegmentsOrEmpty(props.outlineJson)
  return customOutlineToSvgPath(segments, props.width, props.height)
})
</script>

<template>
  <div class="outline-shape-preview">
    <div v-if="label" class="outline-shape-preview__label">{{ label }}</div>
    <svg
      class="outline-shape-preview__svg"
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      aria-hidden="true"
    >
      <path
        v-if="pathD"
        :d="pathD"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <text
        v-else
        :x="width / 2"
        :y="height / 2"
        text-anchor="middle"
        dominant-baseline="middle"
        class="outline-shape-preview__empty"
      >
        —
      </text>
    </svg>
  </div>
</template>

<style scoped>
.outline-shape-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem;
  background: var(--surface-muted);
  border-radius: 6px;
}
.outline-shape-preview__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.outline-shape-preview__svg {
  color: var(--base-text);
}
.outline-shape-preview__empty {
  fill: var(--text-subtle);
  font-size: 0.85rem;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/notations/components/OutlineShapePreview.vue
git commit -m "$(cat <<'EOF'
Add SVG outline preview for shape import dialog.

EOF
)"
```

---

### Task 6: i18n strings

**Files:**
- Modify: `src/i18n/locales/notations.ts`

- [ ] **Step 1: Add keys (ru + en)** next to existing `importMerge*` keys

```ts
// ru
importShapeResolveTitle: 'Импорт: кастомные формы',
importShapeResolveText:
  'В файле есть формы с теми же именами, что уже доступны вам. Можно использовать существующую или создать новую.',
importShapeResolveBulkReuse: 'Все → существующие',
importShapeResolveBulkCreate: 'Все → новые',
importShapeResolveAction: 'Действие',
importShapeResolveReuse: 'Использовать существующую',
importShapeResolveCreate: 'Создать новую',
importShapeResolveCandidate: 'Кандидат',
importShapeResolveFromFile: 'Из файла',
importShapeResolveInCatalog: 'В каталоге',
importShapeResolveGeometryMatch: 'Геометрия совпадает',
importShapeResolveGeometryDiffer: 'Геометрия отличается',
importShapeResolveContinue: 'Продолжить импорт',
importShapeResolveCancel: 'Отмена',
importShapeResolveCatalogError: 'Не удалось загрузить каталог форм для импорта',
importShapeResolveCandidateOwner: 'ваша',
importShapeResolveCandidateShared: 'доступна',

// en
importShapeResolveTitle: 'Import: custom shapes',
importShapeResolveText:
  'The file includes shapes with the same names as shapes already available to you. Reuse an existing one or create a new copy.',
importShapeResolveBulkReuse: 'All → existing',
importShapeResolveBulkCreate: 'All → new',
importShapeResolveAction: 'Action',
importShapeResolveReuse: 'Use existing',
importShapeResolveCreate: 'Create new',
importShapeResolveCandidate: 'Candidate',
importShapeResolveFromFile: 'From file',
importShapeResolveInCatalog: 'In catalog',
importShapeResolveGeometryMatch: 'Geometry matches',
importShapeResolveGeometryDiffer: 'Geometry differs',
importShapeResolveContinue: 'Continue import',
importShapeResolveCancel: 'Cancel',
importShapeResolveCatalogError: 'Could not load the shape catalog for import',
importShapeResolveCandidateOwner: 'yours',
importShapeResolveCandidateShared: 'shared',
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n/locales/notations.ts
git commit -m "$(cat <<'EOF'
Add i18n strings for notation import shape reuse dialog.

EOF
)"
```

---

### Task 7: `NotationImportShapeResolveDialog.vue`

**Files:**
- Create: `src/features/notations/components/NotationImportShapeResolveDialog.vue`

- [ ] **Step 1: Implement dialog**

Props:
- `conflicts: ShapeImportConflict[]`
- `modelValue: ShapeImportResolution[]` (v-model)

Emits:
- `update:modelValue`
- `confirm`
- `cancel`

Behavior:
- Bulk buttons call `setBulkShapeImportAction` and emit updated resolutions
- Per-row action `<select>` updates that resolution’s `action`
- Candidate `<select>` only if `candidates.length > 1`; updates `catalogShapeId`
- Previews: file outline from `conflict.imported.outline`; catalog from selected candidate’s `outline`
- Geometry status from `geometryMatches[selectedIndex]`
- Candidate label: `name` + owner/shared hint via `accessPermission === 'OWNER'`
- Footer: Cancel → `cancel`; Continue → `confirm`
- Use `BaseModal` with `:title="t('notations.importShapeResolveTitle')"`, `max-width="720px"`

Skeleton:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import OutlineShapePreview from './OutlineShapePreview.vue'
import {
  setBulkShapeImportAction,
  type ShapeImportConflict,
  type ShapeImportResolution,
  type ShapeImportAction,
} from '@/features/notations/utils/importShapeConflicts'

const props = defineProps<{
  conflicts: ShapeImportConflict[]
  modelValue: ShapeImportResolution[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ShapeImportResolution[]]
  confirm: []
  cancel: []
}>()

const { t } = useI18n()

function resolutionFor(importedId: string): ShapeImportResolution | undefined {
  return props.modelValue.find((r) => r.importedId === importedId)
}

function patchResolution(importedId: string, patch: Partial<ShapeImportResolution>) {
  emit(
    'update:modelValue',
    props.modelValue.map((row) => (row.importedId === importedId ? { ...row, ...patch } : row))
  )
}

function bulk(action: ShapeImportAction) {
  emit('update:modelValue', setBulkShapeImportAction(props.modelValue, action))
}

function selectedCandidate(conflict: ShapeImportConflict) {
  const res = resolutionFor(conflict.imported.id)
  return (
    conflict.candidates.find((c) => c.id === res?.catalogShapeId) ?? conflict.candidates[0]
  )
}

function geometryMatchesSelected(conflict: ShapeImportConflict): boolean {
  const selected = selectedCandidate(conflict)
  if (!selected) return false
  const idx = conflict.candidates.findIndex((c) => c.id === selected.id)
  return idx >= 0 ? conflict.geometryMatches[idx] === true : false
}

function candidateHint(permission: string | null | undefined): string {
  return permission === 'OWNER'
    ? t('notations.importShapeResolveCandidateOwner')
    : t('notations.importShapeResolveCandidateShared')
}
</script>

<template>
  <BaseModal
    :title="t('notations.importShapeResolveTitle')"
    max-width="720px"
    @close="emit('cancel')"
  >
    <p class="leave-dialog__text">{{ t('notations.importShapeResolveText') }}</p>

    <div class="shape-resolve__bulk">
      <button type="button" class="btn btn--secondary" @click="bulk('reuse')">
        {{ t('notations.importShapeResolveBulkReuse') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="bulk('create')">
        {{ t('notations.importShapeResolveBulkCreate') }}
      </button>
    </div>

    <div
      v-for="conflict in conflicts"
      :key="conflict.imported.id"
      class="shape-resolve__row"
      :class="{ 'shape-resolve__row--warn': !geometryMatchesSelected(conflict) }"
    >
      <div class="shape-resolve__row-head">
        <strong>{{ conflict.imported.name }}</strong>
        <div class="shape-resolve__controls">
          <label v-if="conflict.candidates.length > 1" class="shape-resolve__field">
            <span>{{ t('notations.importShapeResolveCandidate') }}</span>
            <select
              :value="resolutionFor(conflict.imported.id)?.catalogShapeId"
              @change="
                patchResolution(conflict.imported.id, {
                  catalogShapeId: ($event.target as HTMLSelectElement).value,
                })
              "
            >
              <option
                v-for="c in conflict.candidates"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }} · {{ candidateHint(c.accessPermission) }}
              </option>
            </select>
          </label>
          <label class="shape-resolve__field">
            <span>{{ t('notations.importShapeResolveAction') }}</span>
            <select
              :value="resolutionFor(conflict.imported.id)?.action"
              @change="
                patchResolution(conflict.imported.id, {
                  action: ($event.target as HTMLSelectElement).value as ShapeImportAction,
                })
              "
            >
              <option value="reuse">{{ t('notations.importShapeResolveReuse') }}</option>
              <option value="create">{{ t('notations.importShapeResolveCreate') }}</option>
            </select>
          </label>
        </div>
      </div>

      <div class="shape-resolve__previews">
        <OutlineShapePreview
          :outline-json="conflict.imported.outline"
          :label="t('notations.importShapeResolveFromFile')"
        />
        <OutlineShapePreview
          :outline-json="selectedCandidate(conflict)?.outline ?? null"
          :label="t('notations.importShapeResolveInCatalog')"
        />
      </div>

      <p
        class="shape-resolve__geom"
        :class="
          geometryMatchesSelected(conflict)
            ? 'shape-resolve__geom--ok'
            : 'shape-resolve__geom--warn'
        "
      >
        {{
          geometryMatchesSelected(conflict)
            ? t('notations.importShapeResolveGeometryMatch')
            : t('notations.importShapeResolveGeometryDiffer')
        }}
      </p>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">
        {{ t('notations.importShapeResolveCancel') }}
      </button>
      <button type="button" class="btn btn--primary" @click="emit('confirm')">
        {{ t('notations.importShapeResolveContinue') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.shape-resolve__bulk {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}
.shape-resolve__row {
  border: 1px solid var(--border, #d8d4ce);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}
.shape-resolve__row--warn {
  border-color: var(--warning);
}
.shape-resolve__row-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.shape-resolve__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.shape-resolve__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.shape-resolve__field select {
  min-width: 10rem;
}
.shape-resolve__previews {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.shape-resolve__geom {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
}
.shape-resolve__geom--ok {
  color: var(--success);
}
.shape-resolve__geom--warn {
  color: var(--warning);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/notations/components/NotationImportShapeResolveDialog.vue
git commit -m "$(cat <<'EOF'
Add notation import shape resolve dialog UI.

EOF
)"
```

---

### Task 8: Wire `useNotationExport` + `NotationEditorPage`

**Files:**
- Modify: `src/features/notations/composables/useNotationExport.ts`
- Modify: `src/features/notations/NotationEditorPage.vue`

- [ ] **Step 1: Extend composable state and flow**

Add imports:

```ts
import { fetchAllPages } from '@/api/fetchAllPages'
import type { NodeShapeResponse } from '@/types/api'
import { collectImportShapesFromRaw } from '@/features/notations/utils/normalizeNotationImport'
import {
  analyzeImportShapeConflicts,
  defaultShapeImportResolutions,
  type ShapeImportConflict,
  type ShapeImportResolution,
} from '@/features/notations/utils/importShapeConflicts'
import { applyShapeImportResolutions } from '@/features/notations/utils/applyShapeImportResolutions'
```

Add refs:

```ts
const showImportShapeResolveDialog = ref(false)
const importShapeConflicts = ref<ShapeImportConflict[]>([])
const importShapeResolutions = ref<ShapeImportResolution[]>([])
const importCatalogShapes = ref<NodeShapeResponse[]>([])
```

Replace `applyNotationImport` to accept optional resolutions:

```ts
const applyNotationImport = (
  raw: unknown,
  localOnlyPolicy: LocalOnlyPolicy,
  resolutions: ShapeImportResolution[] = []
) => {
  const { state: nextState, pendingShapes: nextShapes } = normalizeNotationImport(raw, {
    baseOwnerId: state.value.ownerId,
    baseNotationId: state.value.notationId,
    baseState: state.value,
    localOnlyPolicy,
    t,
  })

  const catalogById = new Map(importCatalogShapes.value.map((s) => [s.id, s]))
  const resolvedPending = applyShapeImportResolutions({
    components: nextState.components,
    pendingShapes: nextShapes,
    resolutions,
    catalogById,
  })

  state.value = nextState
  pendingShapes.value = resolvedPending
  saveError.value = null
  saveSuccess.value = false
  clearPendingImport()
}
```

Update `clearPendingImport`:

```ts
const clearPendingImport = () => {
  pendingImportRaw.value = null
  importMergeSummary.value = null
  showImportMergeDialog.value = false
  showImportShapeResolveDialog.value = false
  importShapeConflicts.value = []
  importShapeResolutions.value = []
  // keep importCatalogShapes until apply finishes; clear here after apply/cancel:
  importCatalogShapes.value = []
}
```

Add helpers to continue after shape resolve:

```ts
const continueAfterShapeResolve = (raw: unknown, resolutions: ShapeImportResolution[]) => {
  const summary = analyzeNotationImportLocalOnly(raw, state.value, t)
  if (summary.total > 0) {
    pendingImportRaw.value = raw
    importMergeSummary.value = summary
    showImportShapeResolveDialog.value = false
    // stash resolutions for merge confirm
    importShapeResolutions.value = resolutions
    showImportMergeDialog.value = true
    return
  }
  applyNotationImport(raw, 'keep', resolutions)
}

const confirmImportShapeResolve = () => {
  const raw = pendingImportRaw.value
  if (raw === null) return
  continueAfterShapeResolve(raw, importShapeResolutions.value)
}

const cancelImportShapeResolve = () => {
  clearPendingImport()
}
```

Rewrite `handleNotationImportChange`:

```ts
const handleNotationImportChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown

    let catalog: NodeShapeResponse[]
    try {
      catalog = await fetchAllPages<NodeShapeResponse>(
        '/node-shapes',
        undefined,
        { pageSize: 200, errorLabel: t('notations.importShapeResolveCatalogError') }
      )
    } catch (error) {
      clearPendingImport()
      saveError.value =
        error instanceof Error
          ? t('notations.importError', { message: error.message })
          : t('notations.importShapeResolveCatalogError')
      return
    }

    importCatalogShapes.value = catalog
    const importedShapes = collectImportShapesFromRaw(parsed, t)
    const conflicts = analyzeImportShapeConflicts(importedShapes, catalog)

    if (conflicts.length > 0) {
      pendingImportRaw.value = parsed
      importShapeConflicts.value = conflicts
      importShapeResolutions.value = defaultShapeImportResolutions(conflicts)
      showImportShapeResolveDialog.value = true
      return
    }

    // no shape conflicts → existing local-only path
    const summary = analyzeNotationImportLocalOnly(parsed, state.value, t)
    if (summary.total > 0) {
      pendingImportRaw.value = parsed
      importMergeSummary.value = summary
      showImportMergeDialog.value = true
      return
    }
    applyNotationImport(parsed, 'keep', [])
  } catch (error) {
    clearPendingImport()
    saveError.value =
      error instanceof Error
        ? t('notations.importError', { message: error.message })
        : t('notations.importReadError')
  } finally {
    resetImportInput()
  }
}
```

Update merge confirms to pass stashed resolutions:

```ts
const confirmImportMergeKeep = () => {
  const raw = pendingImportRaw.value
  if (raw === null) return
  try {
    applyNotationImport(raw, 'keep', importShapeResolutions.value)
  } catch (error) { /* same as today */ }
}

const confirmImportMergeDelete = () => {
  const raw = pendingImportRaw.value
  if (raw === null) return
  try {
    applyNotationImport(raw, 'delete', importShapeResolutions.value)
  } catch (error) { /* same as today */ }
}
```

**Important:** when opening the merge dialog from shape resolve, do **not** clear `importCatalogShapes` or `importShapeResolutions` in a way that loses them before apply. Adjust `clearPendingImport` so shape-dialog→merge transition only hides the shape dialog without wiping catalog/resolutions/raw. Split:

```ts
const clearPendingImport = () => {
  pendingImportRaw.value = null
  importMergeSummary.value = null
  showImportMergeDialog.value = false
  showImportShapeResolveDialog.value = false
  importShapeConflicts.value = []
  importShapeResolutions.value = []
  importCatalogShapes.value = []
}

const hideShapeResolveKeepPending = () => {
  showImportShapeResolveDialog.value = false
  importShapeConflicts.value = []
}
```

Use `hideShapeResolveKeepPending` inside `continueAfterShapeResolve` when moving to merge dialog.

Return new refs/handlers from the composable.

- [ ] **Step 2: Wire page**

In `NotationEditorPage.vue`:

1. Destructure new exports from `useNotationExport`.
2. Import and render:

```vue
<NotationImportShapeResolveDialog
  v-if="showImportShapeResolveDialog"
  v-model="importShapeResolutions"
  :conflicts="importShapeConflicts"
  @confirm="confirmImportShapeResolve"
  @cancel="cancelImportShapeResolve"
/>
```

Place it above the existing import-merge `BaseModal`.

- [ ] **Step 3: Typecheck / unit tests**

```bash
npx vitest run src/features/notations/utils/outlinesEquivalent.test.ts src/features/notations/utils/importShapeConflicts.test.ts src/features/notations/utils/applyShapeImportResolutions.test.ts src/features/notations/utils/normalizeNotationImport.test.ts
npx vue-tsc --noEmit
```

Expected: all pass / no new errors in touched files.

- [ ] **Step 4: Commit**

```bash
git add src/features/notations/composables/useNotationExport.ts src/features/notations/NotationEditorPage.vue src/features/notations/utils/normalizeNotationImport.ts
git commit -m "$(cat <<'EOF'
Wire shape reuse dialog into notation file import flow.

EOF
)"
```

---

### Task 9: Manual smoke + plan checkbox review

- [ ] **Step 1: Manual checks** (dev server + backend with shapes)

1. Import notation whose shape names are new → no shape dialog; shapes still go to `pendingShapes` / create on Save.
2. Import with same name + same outline as owned shape → dialog defaults to reuse; after continue, Save does **not** create a duplicate; component `customShapeId` equals catalog id.
3. Same name, different outline → default create; previews differ; warning visible.
4. Two catalog shapes same name → candidate dropdown; switching candidate updates catalog preview.
5. Bulk «Все → существующие» then one row back to create works.
6. Cancel aborts; editor unchanged.
7. Catalog fetch failure shows error; no apply.
8. Shape dialog then local-only merge dialog still works; resolutions preserved.

- [ ] **Step 2: Final commit only if smoke found fixes**; otherwise done.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Resolve after file pick, before apply | Task 8 |
| Hybrid UI + previews + mismatch warning | Tasks 5–7 |
| Case-insensitive name match; accessible catalog | Tasks 2, 8 |
| Multi-candidate dropdown | Tasks 2, 7 |
| Default reuse iff outline matches | Task 2 |
| Candidate order OWNER→EDIT→VIEW, updatedAt desc | Task 2 |
| Reuse remaps id, syncs outline, skips pending | Task 3 |
| Create stays in pendingShapes | Task 3 |
| Cancel / catalog error abort | Task 8 |
| Server import out of scope | — |
| Unit tests listed in spec | Tasks 1–4 |
| i18n | Task 6 |

---

## Notes for implementers

- Do **not** change `persistPendingShapes` semantics; reuse never reaches it.
- Do **not** modify arepos-server in this plan.
- `collectImportShapesFromRaw` may run a full normalize for preview; acceptable for import UX. If it becomes slow, replace with a lighter extract that still calls `mergeShapePackage`.
- Prettier: no semicolons, single quotes (match surrounding notations utils; `useNotationExport.ts` currently mixes styles — follow each file’s existing style).

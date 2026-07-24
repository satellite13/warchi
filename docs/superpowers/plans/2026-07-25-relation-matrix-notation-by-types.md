# Relation matrix notation mode by types/rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In model «Матрица связей», when a notation is selected, build axes from **node types** × **link types** (of that notation’s relations), drop binding-based «Не сопоставлено», and mark cells **allowed** by notation relation rules.

**Architecture:** Pure changes in `buildRelationMatrix` (+ small helper for allowed-pair lookup). Filters rename `mappedOnly` → `allowedOnly`. View/grid/i18n/docs consume the new cell flag. Types mode stays binding-free as today.

**Tech Stack:** TypeScript, Vitest, Vue 3, existing `models-matrix` module.

**Spec:** [docs/superpowers/specs/2026-07-25-relation-matrix-notation-by-types-design.md](../specs/2026-07-25-relation-matrix-notation-by-types-design.md)

---

## File map

| File | Role |
|------|------|
| `src/features/models-matrix/utils/isPairAllowedByNotationRules.ts` | Pure: `(fromType, toType, linkType, catalogs) → boolean` |
| `src/features/models-matrix/utils/isPairAllowedByNotationRules.test.ts` | TDD for rules helper |
| `src/features/models-matrix/types.ts` | `mappedOnly`→`allowedOnly`; cell `allowedByNotationRules`; drop unmapped-centric fields carefully |
| `src/features/models-matrix/utils/buildRelationMatrix.ts` | Notation mode = types + link types; pass rules; filter `allowedOnly` |
| `src/features/models-matrix/utils/buildRelationMatrix.test.ts` | Replace unmapped tests with type/linkType + allowed cases |
| `src/features/models-matrix/utils/relationMatrixCsv.ts` | CSV: `isUnmapped` → `allowedByNotationRules` (or add column) |
| `src/features/models-matrix/components/RelationMatrixFilters.vue` | Toggle label/prop `allowedOnly` |
| `src/features/models-matrix/components/RelationMatrixGrid.vue` | Visual marker for allowed cells |
| `src/views/ModelRelationMatrixView.vue` | Pass `relationRules`; fix details panel for type ids; filter defaults |
| `src/i18n/locales/models.ts` | RU/EN copy |
| `src/features/docs/content/models.md` (+ `.en.md`) | Help text |

---

### Task 1: `isPairAllowedByNotationRules` (TDD)

**Files:**
- Create: `src/features/models-matrix/utils/isPairAllowedByNotationRules.ts`
- Create: `src/features/models-matrix/utils/isPairAllowedByNotationRules.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { isPairAllowedByNotationRules } from './isPairAllowedByNotationRules'

const components = [
  { id: 'c-a', notationId: 'n1', nodeTypeId: 't-a' },
  { id: 'c-b', notationId: 'n1', nodeTypeId: 't-b' },
  { id: 'c-a2', notationId: 'n1', nodeTypeId: 't-a' },
]
const relations = [
  { id: 'r-flow', notationId: 'n1', linkTypeId: 'lt-flow' },
  { id: 'r-other', notationId: 'n1', linkTypeId: 'lt-other' },
]
const rules = [
  { relationId: 'r-flow', fromComponentId: 'c-a', toComponentId: 'c-b' },
]

describe('isPairAllowedByNotationRules', () => {
  it('returns true when any component pair + relation of link type has a rule', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-b',
        linkTypeId: 'lt-flow',
        components,
        relations,
        relationRules: rules,
      })
    ).toBe(true)
  })

  it('returns false when link type has no matching rule', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-b',
        linkTypeId: 'lt-other',
        components,
        relations,
        relationRules: rules,
      })
    ).toBe(false)
  })

  it('allows A→A when rule uses same component twice', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-a',
        linkTypeId: 'lt-flow',
        components,
        relations,
        relationRules: [{ relationId: 'r-flow', fromComponentId: 'c-a', toComponentId: 'c-a' }],
      })
    ).toBe(true)
  })

  it('ignores components/relations of other notations', () => {
    expect(
      isPairAllowedByNotationRules({
        notationId: 'n1',
        fromNodeTypeId: 't-a',
        toNodeTypeId: 't-b',
        linkTypeId: 'lt-flow',
        components: [...components, { id: 'c-x', notationId: 'n2', nodeTypeId: 't-a' }],
        relations,
        relationRules: [{ relationId: 'r-flow', fromComponentId: 'c-x', toComponentId: 'c-b' }],
      })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/features/models-matrix/utils/isPairAllowedByNotationRules.test.ts
```

- [ ] **Step 3: Implement**

```typescript
export type NotationRuleCatalogs = {
  notationId: string
  fromNodeTypeId: string
  toNodeTypeId: string
  linkTypeId: string
  components: Array<{ id: string; notationId: string; nodeTypeId: string }>
  relations: Array<{ id: string; notationId: string; linkTypeId: string }>
  relationRules: Array<{ relationId: string; fromComponentId: string; toComponentId: string }>
}

export function isPairAllowedByNotationRules(input: NotationRuleCatalogs): boolean {
  const fromIds = new Set(
    input.components
      .filter(c => c.notationId === input.notationId && c.nodeTypeId === input.fromNodeTypeId)
      .map(c => c.id)
  )
  const toIds = new Set(
    input.components
      .filter(c => c.notationId === input.notationId && c.nodeTypeId === input.toNodeTypeId)
      .map(c => c.id)
  )
  const relationIds = new Set(
    input.relations
      .filter(r => r.notationId === input.notationId && r.linkTypeId === input.linkTypeId)
      .map(r => r.id)
  )
  if (fromIds.size === 0 || toIds.size === 0 || relationIds.size === 0) return false
  return input.relationRules.some(
    rule =>
      relationIds.has(rule.relationId) &&
      fromIds.has(rule.fromComponentId) &&
      toIds.has(rule.toComponentId)
  )
}
```

- [ ] **Step 4: Run tests — PASS**
- [ ] **Step 5: Commit** `Add isPairAllowedByNotationRules helper.`

---

### Task 2: Types + `buildRelationMatrix` notation mode (TDD)

**Files:**
- Modify: `src/features/models-matrix/types.ts`
- Modify: `src/features/models-matrix/utils/buildRelationMatrix.ts`
- Modify: `src/features/models-matrix/utils/buildRelationMatrix.test.ts`

- [ ] **Step 1: Update types**

In `types.ts`:
- Rename filter `mappedOnly` → `allowedOnly`.
- On `RelationMatrixCell`: add `allowedByNotationRules: boolean`; keep `hasUnmapped` as **always false** in new notation mode (or remove and fix callers — prefer remove `hasUnmapped` / `isUnmapped` if greps show only matrix module uses them).
- On `RelationMatrixLinkItem`: remove `isUnmapped` **or** set always `false`; prefer remove + fix.
- Extend `BuildRelationMatrixInput` with `relationRules: Array<{ relationId; fromComponentId; toComponentId }>`.
- `labels.unmapped` becomes unused in notation mode — can keep optional for now or remove from call sites.

- [ ] **Step 2: Rewrite failing/updated tests in `buildRelationMatrix.test.ts`**

Keep a types-mode smoke test. Replace notation unmapped tests with:

```typescript
it('notation mode groups by node type and link type without bindings', () => {
  const matrix = buildRelationMatrix({
    filters: {
      ...baseFilters,
      notationId: 'archi',
      selectedRelationIds: ['lt-flow'], // link type ids
      allowedOnly: false,
    },
    nodes: [
      // nodeType service / db — NO notationComponents
      createNode('n1', 'A', 'service'),
      createNode('n2', 'B', 'db'),
    ],
    links: [createLink('l1', 'n1', 'n2', 'lt-flow' /* linkTypeId */)],
    nodeTypes: [
      { id: 'service', name: 'Service' },
      { id: 'db', name: 'Database' },
    ],
    linkTypes: [{ id: 'lt-flow', name: 'Flow', /* …minimal fields */ }],
    components: [
      { id: 'c-svc', name: 'Application', notationId: 'archi', nodeTypeId: 'service', /* … */ },
      { id: 'c-db', name: 'DataObject', notationId: 'archi', nodeTypeId: 'db', /* … */ },
    ],
    relations: [
      { id: 'r-flow', name: 'Flow', notationId: 'archi', linkTypeId: 'lt-flow', /* … */ },
    ],
    relationRules: [
      { relationId: 'r-flow', fromComponentId: 'c-svc', toComponentId: 'c-db' },
    ],
    notations: [],
  })

  expect(matrix.mode).toBe('notation')
  expect(matrix.relationOptions.map(r => r.id)).toEqual(['lt-flow'])
  const cell = matrix.cells[relationMatrixCellKey('service', 'db')]
  expect(cell?.total).toBe(1)
  expect(cell?.allowedByNotationRules).toBe(true)
  expect(matrix.rowOptions.some(r => r.isUnmapped)).toBe(false)
})

it('excludes links whose link type is not used by notation relations', () => {
  // link type lt-other not in notation relations → link skipped
})

it('allowedOnly drops cells that are not allowed by rules', () => {
  // cell with links but no matching rule → omitted when allowedOnly
})
```

Adapt `createNode` / `createLink` helpers in the test file: stop requiring component/relation binding ids for notation cases; `createLink(..., linkTypeId)`.

- [ ] **Step 3: Implement builder notation branch**

Pseudocode changes in `buildRelationMatrix.ts`:

```typescript
function buildRowAndColumnOptions(input, mode) {
  // BOTH modes: node types only (no UNMAPPED in notation mode)
  return sortOptions(input.nodeTypes.map(nt => ({ id: nt.id, name: nt.name, kind: 'row' })))
}

function buildRelationOptions(input, mode) {
  if (mode === 'notation') {
    const notationId = input.filters.notationId!
    const linkTypeIds = new Set(
      input.relations.filter(r => r.notationId === notationId).map(r => r.linkTypeId)
    )
    return sortOptions(
      input.linkTypes
        .filter(lt => linkTypeIds.has(lt.id))
        .map(lt => ({ id: lt.id, name: lt.name, kind: 'relation' }))
    )
  }
  // types mode: all link types as today
  return sortOptions(input.linkTypes.map(...))
}

function resolveRowOrColumnId(mode, _notationId, node) {
  return node.nodeTypeId // both modes
}

function resolveRelationId(mode, notationId, link) {
  if (mode === 'types') return link.linkTypeId
  // notation: only if linkType is in notation vocabulary (caller skips otherwise)
  return link.linkTypeId
}
```

In the main loop (notation mode):
1. Skip link if `link.linkTypeId` not in notation link-type set.
2. Compute `allowedByNotationRules` via `isPairAllowedByNotationRules` for `(source.nodeTypeId, target.nodeTypeId, link.linkTypeId)`.
3. If `filters.allowedOnly && !allowed` → skip item (and don’t create empty cells).
4. Set cell `allowedByNotationRules` to OR of items (or recompute once per cell key after aggregation).

Types mode: `allowedByNotationRules = false` always; no `allowedOnly` effect (or treat `allowedOnly` as no-op when `notationId == null`).

- [ ] **Step 4: Run** `npx vitest run src/features/models-matrix/utils/buildRelationMatrix.test.ts` — PASS  
- [ ] **Step 5: Commit** `Rebuild relation matrix notation mode around types and rules.`

---

### Task 3: Wire view + filters + grid + CSV

**Files:**
- Modify: `src/views/ModelRelationMatrixView.vue`
- Modify: `src/features/models-matrix/components/RelationMatrixFilters.vue`
- Modify: `src/features/models-matrix/components/RelationMatrixGrid.vue`
- Modify: `src/features/models-matrix/utils/relationMatrixCsv.ts`
- Modify: `src/features/models-matrix/components/RelationMatrixDetailsPanel.vue` (if it assumes component ids)

- [ ] **Step 1: Filters** — rename prop `mappedOnly` → `allowedOnly`; bind toggle to new i18n key.
- [ ] **Step 2: View** — `matrixFilters.allowedOnly`; pass `relationRules: currentState.relationRules` into `buildRelationMatrix`; when notation changes, init `selectedRelationIds` from **link type ids** of that notation’s relations (not relation entity ids). Update details helpers that did `components.find(id === rowId)` to use **nodeTypes** when in notation/types mode (both are type ids now for rows).
- [ ] **Step 3: Grid** — add class e.g. `matrix-grid__cell--allowed` when `cell.allowedByNotationRules`; subtle border/background distinct from heatmap (use CSS variable already in app, not a new purple theme).
- [ ] **Step 4: CSV** — replace `isUnmapped` column with `allowedByNotationRules` in long format; update any CSV tests if present.
- [ ] **Step 5: Commit** `Wire relation matrix UI for allowed-by-rules notation mode.`

---

### Task 4: i18n + docs

**Files:**
- Modify: `src/i18n/locales/models.ts`
- Modify: `src/features/docs/content/models.md`
- Modify: `src/features/docs/content/models.en.md`

- [ ] **Step 1: Strings**

RU:
- `relationMatrixMappedOnly` → rename key to `relationMatrixAllowedOnly`: «Только допустимые по правилам»
- Remove or stop using `relationMatrixUnmapped`
- Optional: `relationMatrixAllowedHint` for tooltip

EN equivalents.

- [ ] **Step 2: Docs** — rewrite «Матрица связей» bullet list: notation mode = types + link types; highlight allowed pairs; no «не сопоставлено» by binding.
- [ ] **Step 3: Commit** `Update relation matrix copy and docs for types/rules mode.`

---

### Task 5: Verify

- [ ] `npx vitest run src/features/models-matrix`
- [ ] `npm run lint` on touched paths
- [ ] Manual: model with C4 link (flow) + Archimate selected → link under node types + Flow link type; cell marked allowed if Archimate rules permit; toggle «Только допустимые…»; «Без нотации» unchanged.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Axes = node types | 2 |
| Relations = link types of N | 2 |
| Ignore attrs bindings | 2 |
| Remove Unmapped | 2, 4 |
| allowedOnly filter | 2, 3, 4 |
| Highlight allowed cells | 1, 2, 3 |
| Exclude link types outside N | 2 |
| Types mode unchanged | 2 |
| Docs/i18n | 4 |

## Placeholder / consistency scan

- Filter field name: **`allowedOnly`** everywhere (not `mappedOnly`).
- Relation axis ids in notation mode: **`linkTypeId`**, not relation entity id.
- Rules helper name: **`isPairAllowedByNotationRules`**.

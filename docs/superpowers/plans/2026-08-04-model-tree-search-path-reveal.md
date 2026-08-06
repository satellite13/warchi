# Model Tree Search Path + Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В поиске дерева модели показывать урезанную иерархию (matches + ancestors) и при сбросе поиска раскрывать/скроллить к выбранному узлу или диаграмме.

**Architecture:** Переиспользовать `visibleNodeIds` / `filteredChildNodes` из `useTreeSearch` для иерархического `treeRows` (убрать flat search list). Добавить хелпер цепочки предков + auto-expand при непустом query. При очистке `normalizedQuery` вызывать `focusNode` / `focusDiagram`. Предки-несовпадения — приглушённый CSS.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-08-04-model-tree-search-path-reveal-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/features/models/composables/useTreeSearch.ts` | Хелпер `collectAncestorIds(matchingIds)` (или export функции), при необходимости `expandAncestorsOfMatches` |
| `src/features/models/composables/useTreeSearch.test.ts` | Тесты предков + (если логика expand здесь) auto-expand |
| `src/features/models/components/ModelTreePalettePanel.vue` | Hierarchical search `treeRows`, watches auto-expand / reveal-on-clear, `focusDiagram`, ancestor CSS, `data-tree-diagram-id` |
| `src/features/models/components/ModelTreePalettePanel.test.ts` | Hierarchical rows, reveal on clear, selection preserved |

---

### Task 1: Align feature branch on master

**Files:** none (git only)

Ветка `feat/model-tree-search-path-reveal` сейчас ответвлена от `feat/warchi-mcp-api-keys`. Нужна чистая база от `master` + commit со spec.

- [ ] **Step 1: Rebase onto master (keep design commit)**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git fetch origin master 2>/dev/null || true
git rebase --onto master feat/warchi-mcp-api-keys feat/model-tree-search-path-reveal
```

Если `feat/warchi-mcp-api-keys` локально нет как имя tip-родителя, эквивалент:

```bash
git rebase --onto master 6e8aed4 feat/model-tree-search-path-reveal
```

где `6e8aed4` — последний commit от mcp-ветки перед design-commit (проверьте `git log --oneline`).

Expected: `git log master..HEAD --oneline` показывает только `docs: design hierarchical model tree search…` (и далее ваши implementation commits).

- [ ] **Step 2: Confirm working tree**

```bash
git status
```

Expected: on `feat/model-tree-search-path-reveal`, clean or only unrelated local files (не трогать чужие untracked specs).

---

### Task 2: Ancestor helper in useTreeSearch (TDD)

**Files:**
- Modify: `src/features/models/composables/useTreeSearch.ts`
- Modify: `src/features/models/composables/useTreeSearch.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside `describe('useTreeSearch', …)`:

```ts
describe('collectAncestorIds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns ancestors of matching nodes up to but not including tree root', () => {
    const tree = setup(
      [
        makeNode({ id: 'root', name: 'Root' }),
        makeNode({ id: 'folder', name: 'Folder', parentNodeId: 'root', nodeTypeId: 'dir' }),
        makeNode({ id: 'child', name: 'SpecialChild', parentNodeId: 'folder' }),
        makeNode({ id: 'sibling', name: 'Other', parentNodeId: 'folder' }),
      ],
      'root',
    )
    tree.treeSearchQuery.value = 'special'
    vi.advanceTimersByTime(200)
    const ancestors = tree.collectAncestorIds(tree.matchingNodeIds.value)
    expect([...ancestors].sort()).toEqual(['folder'])
    expect(ancestors.has('root')).toBe(false)
    expect(ancestors.has('child')).toBe(false)
  })

  it('returns empty set when there are no matches', () => {
    const tree = setup([makeNode({ id: 'a', name: 'Alpha' })])
    const ancestors = tree.collectAncestorIds(new Set())
    expect(ancestors.size).toBe(0)
  })

  it('walks multiple levels', () => {
    const tree = setup([
      makeNode({ id: 'a', name: 'A', nodeTypeId: 'dir' }),
      makeNode({ id: 'b', name: 'B', parentNodeId: 'a', nodeTypeId: 'dir' }),
      makeNode({ id: 'c', name: 'TargetLeaf', parentNodeId: 'b' }),
    ])
    const ancestors = tree.collectAncestorIds(new Set(['c']))
    expect([...ancestors].sort()).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models/composables/useTreeSearch.test.ts -t "collectAncestorIds"
```

Expected: FAIL — `collectAncestorIds` is not a function / undefined.

- [ ] **Step 3: Implement helper**

In `useTreeSearch.ts`, add and return:

```ts
const collectAncestorIds = (matchingIds: Set<string>): Set<string> => {
  const rootId = deps.treeRootNodeId.value ?? null
  const byId = nodeById.value
  const ancestors = new Set<string>()
  for (const id of matchingIds) {
    let parentId = byId.get(id)?.parentNodeId ?? null
    while (parentId && parentId !== rootId) {
      if (ancestors.has(parentId)) break
      ancestors.add(parentId)
      parentId = byId.get(parentId)?.parentNodeId ?? null
    }
  }
  return ancestors
}
```

Export it from the return object of `useTreeSearch`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/models/composables/useTreeSearch.test.ts
```

Expected: PASS (all existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/features/models/composables/useTreeSearch.ts src/features/models/composables/useTreeSearch.test.ts
git commit -m "$(cat <<'EOF'
feat: add collectAncestorIds helper for model tree search

EOF
)"
```

---

### Task 3: Hierarchical search rows in ModelTreePalettePanel (TDD)

**Files:**
- Modify: `src/features/models/components/ModelTreePalettePanel.vue`
- Modify: `src/features/models/components/ModelTreePalettePanel.test.ts`

- [ ] **Step 1: Write failing panel tests for hierarchical search**

Replace/extend `ModelTreePalettePanel.test.ts` with helpers and tests. Use fake timers for debounce (200ms).

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ModelTreePalettePanel from './ModelTreePalettePanel.vue'
import type { EditorNode } from '../types'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

function makeNode(
  overrides: Partial<EditorNode> & { id: string; name: string; nodeTypeId?: string },
): EditorNode {
  return {
    modelId: 'm1',
    ownerId: 'o1',
    nodeTypeId: overrides.nodeTypeId ?? 'nt1',
    parentNodeId: null,
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: {},
    },
    _isNew: false,
    _isDirty: false,
    _isDeleted: false,
    ...overrides,
  }
}

function mountPanel(props: {
  nodes: EditorNode[]
  selectedNodeId?: string | null
  selectedDiagramId?: string | null
}) {
  return mount(ModelTreePalettePanel, {
    props: {
      nodes: props.nodes,
      diagrams: [],
      nodeTypes: [
        { id: 'dir', name: 'Directory', version: '1.0.0', ownerId: 'o1' } as never,
        { id: 'nt1', name: 'Application Component', version: '1.0.0', ownerId: 'o1' } as never,
      ],
      selectedNodeId: props.selectedNodeId ?? null,
      selectedDiagramId: props.selectedDiagramId ?? null,
    },
    global: { stubs: { UiIcon: true } },
  })
}

describe('ModelTreePalettePanel search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows matching node under ancestor with depth, hides non-matching sibling', async () => {
    const wrapper = mountPanel({
      nodes: [
        makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
        makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
        makeNode({ id: 'miss', name: 'OtherChild', parentNodeId: 'folder' }),
      ],
    })

    const input = wrapper.get('.panel__search-input')
    await input.setValue('special')
    vi.advanceTimersByTime(200)
    await nextTick()

    const rows = wrapper.findAll('[data-tree-node-id]')
    const ids = rows.map((r) => r.attributes('data-tree-node-id'))
    expect(ids).toContain('folder')
    expect(ids).toContain('hit')
    expect(ids).not.toContain('miss')

    const hit = wrapper.get('[data-tree-node-id="hit"]')
    expect(hit.attributes('style')).toMatch(/--tree-depth:\s*1/)
    const folder = wrapper.get('[data-tree-node-id="folder"]')
    expect(folder.attributes('style')).toMatch(/--tree-depth:\s*0/)
  })
})
```

Keep the existing empty-nodes smoke test outside this describe (or inside a separate describe without fake timers).

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/features/models/components/ModelTreePalettePanel.test.ts -t "shows matching node"
```

Expected: FAIL — flat list has only `hit` at depth 0, or `folder` missing / wrong depth.

- [ ] **Step 3: Replace flat search branch in `treeRows`**

In `ModelTreePalettePanel.vue`, change `treeRows` so there is **no** early flat-list return when `query` is set. Use one hierarchical walk for both modes; apply `MAX_SEARCH_TREE_ROWS` only when `query` is non-empty (or always — either is fine if empty tree is small).

Target structure:

```ts
const treeRows = computed<{ rows: TreeRow[]; truncated: boolean }>(() => {
  const rows: TreeRow[] = []
  const query = normalizedQuery.value
  const limit = query ? MAX_SEARCH_TREE_ROWS : Number.POSITIVE_INFINITY

  const pushRow = (row: TreeRow): boolean => {
    rows.push(row)
    return rows.length >= limit
  }

  for (const diagram of visibleRootDiagrams.value) {
    if (pushRow({ kind: 'diagram', nodeId: null, diagram, depth: 0 })) {
      return { rows, truncated: !!query }
    }
  }

  const pushNode = (node: EditorNode, depth: number): boolean => {
    if (pushRow({ kind: 'node', node, depth })) return true
    if (!isDirectory(node) || !expandedNodes.value.has(node.id)) return false
    for (const diagram of visibleNodeDiagrams(node.id)) {
      if (pushRow({ kind: 'diagram', nodeId: node.id, diagram, depth: depth + 1 })) return true
    }
    for (const child of visibleChildNodes(node.id)) {
      if (pushNode(child, depth + 1)) return true
    }
    return false
  }

  for (const rootNode of visibleRootNodes.value) {
    if (pushNode(rootNode, 0)) {
      return { rows, truncated: !!query }
    }
  }
  return { rows, truncated: false }
})
```

Also destructure `collectAncestorIds` from `useTreeSearch(...)`.

- [ ] **Step 4: Auto-expand ancestors when search becomes active**

Still in `ModelTreePalettePanel.vue`, import `watch` from `vue` and add:

```ts
watch(normalizedQuery, (query) => {
  if (!query) return
  const next = new Set(expandedNodes.value)
  for (const id of collectAncestorIds(matchingNodeIds.value)) {
    next.add(id)
  }
  // Also expand matching directories so their matching diagrams/children can show if already expanded policy requires it.
  // Spec: expand ancestors of matches. Matching folder itself should be expanded when it has visible children under search.
  for (const id of matchingNodeIds.value) {
    const node = nodeById.value.get(id)
    if (node && isDirectory(node)) next.add(id)
  }
  // Diagram-only hits: parent node of a matching diagram name is already in matchingNodeIds via extraNodeMatches.
  expandedNodes.value = next
})
```

Note: `extraNodeMatches` already puts the **node** into `matchingNodeIds` when a child diagram name matches — so expanding that node is enough for diagram rows under `visibleNodeDiagrams`.

- [ ] **Step 5: Run panel + composable tests**

```bash
npx vitest run src/features/models/components/ModelTreePalettePanel.test.ts src/features/models/composables/useTreeSearch.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/models/components/ModelTreePalettePanel.vue src/features/models/components/ModelTreePalettePanel.test.ts
git commit -m "$(cat <<'EOF'
feat: render model tree search as filtered hierarchy

EOF
)"
```

---

### Task 4: Reveal selection when search clears (TDD)

**Files:**
- Modify: `src/features/models/components/ModelTreePalettePanel.vue`
- Modify: `src/features/models/components/ModelTreePalettePanel.test.ts`

- [ ] **Step 1: Write failing reveal tests**

Append inside `describe('ModelTreePalettePanel search', …)`:

```ts
it('expands ancestors and keeps selection when search is cleared', async () => {
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView

  const wrapper = mountPanel({
    nodes: [
      makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
      makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
    ],
    selectedNodeId: 'hit',
  })

  const input = wrapper.get('.panel__search-input')
  await input.setValue('special')
  vi.advanceTimersByTime(200)
  await nextTick()

  await input.setValue('')
  // clear path sets debounced query sync when trimmed empty (no debounce wait required)
  await nextTick()
  await nextTick()

  expect(wrapper.props('selectedNodeId')).toBe('hit')
  // After clear, hierarchical full tree should show hit when folder expanded
  expect(wrapper.find('[data-tree-node-id="hit"]').exists()).toBe(true)
  expect(scrollIntoView).toHaveBeenCalled()
})

it('does not clear search on select click', async () => {
  const wrapper = mountPanel({
    nodes: [
      makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
      makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
    ],
  })
  const input = wrapper.get('.panel__search-input')
  await input.setValue('special')
  vi.advanceTimersByTime(200)
  await nextTick()

  await wrapper.get('[data-tree-node-id="hit"] .tree-node__select').trigger('click')
  expect((input.element as HTMLInputElement).value).toBe('special')
  expect(wrapper.emitted('selectNode')?.[0]).toEqual(['hit'])
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run src/features/models/components/ModelTreePalettePanel.test.ts -t "when search is cleared"
```

Expected: FAIL — `hit` not in DOM after clear and/or `scrollIntoView` not called (folder not expanded).

- [ ] **Step 3: Implement reveal-on-clear + focusDiagram**

In `ModelTreePalettePanel.vue`:

1. Add `data-tree-diagram-id` on diagram row root (same place as `data-tree-node-id` for nodes).

2. Add:

```ts
const focusDiagram = (diagramId: string) => {
  const diagram = props.diagrams.find((d) => d.id === diagramId && !d._isDeleted)
  if (!diagram) return
  if (diagram.nodeId && !(props.treeRootNodeId && diagram.nodeId === props.treeRootNodeId)) {
    expandToNode(diagram.nodeId)
    const next = new Set(expandedNodes.value)
    next.add(diagram.nodeId)
    expandedNodes.value = next
  }
  nextTick(() => {
    const row = document.querySelector(
      `[data-tree-diagram-id="${diagramId}"]`,
    ) as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

watch(normalizedQuery, (query, prev) => {
  if (query) {
    // auto-expand from Task 3 (keep that block here or merge into one watch)
    const next = new Set(expandedNodes.value)
    for (const id of collectAncestorIds(matchingNodeIds.value)) next.add(id)
    for (const id of matchingNodeIds.value) {
      const node = nodeById.value.get(id)
      if (node && isDirectory(node)) next.add(id)
    }
    expandedNodes.value = next
    return
  }
  // Leaving search mode
  if (!prev) return
  if (props.selectedNodeId) {
    focusNode(props.selectedNodeId)
    return
  }
  if (props.selectedDiagramId) {
    focusDiagram(props.selectedDiagramId)
  }
})
```

Merge with Task 3 watch into **one** `watch(normalizedQuery, …)` to avoid double-firing.

Expose `focusDiagram` via `defineExpose` if useful: `defineExpose({ expandToNode, focusNode, focusDiagram })`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/features/models/components/ModelTreePalettePanel.test.ts src/features/models/composables/useTreeSearch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/components/ModelTreePalettePanel.vue src/features/models/components/ModelTreePalettePanel.test.ts
git commit -m "$(cat <<'EOF'
feat: reveal selected tree node when clearing model search

EOF
)"
```

---

### Task 5: Ancestor muted styling

**Files:**
- Modify: `src/features/models/components/ModelTreePalettePanel.vue`
- Modify: `src/features/models/components/ModelTreePalettePanel.test.ts`

- [ ] **Step 1: Write failing style test**

```ts
it('mutes non-matching ancestor names during search', async () => {
  const wrapper = mountPanel({
    nodes: [
      makeNode({ id: 'folder', name: 'Folder', nodeTypeId: 'dir' }),
      makeNode({ id: 'hit', name: 'SpecialChild', parentNodeId: 'folder' }),
    ],
  })
  await wrapper.get('.panel__search-input').setValue('special')
  vi.advanceTimersByTime(200)
  await nextTick()

  expect(wrapper.get('[data-tree-node-id="folder"] .tree-node__name').classes()).toContain(
    'tree-node__name--ancestor',
  )
  expect(wrapper.get('[data-tree-node-id="hit"] .tree-node__name').classes()).not.toContain(
    'tree-node__name--ancestor',
  )
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run src/features/models/components/ModelTreePalettePanel.test.ts -t "mutes non-matching"
```

Expected: FAIL — class missing.

- [ ] **Step 3: Apply class + CSS**

Template name span:

```vue
<span
  v-else
  class="tree-node__name"
  :class="{
    'tree-node__name--ancestor':
      !!normalizedQuery && !matchingNodeIds.has(row.node.id),
  }"
>{{ row.node.name }}</span>
```

CSS:

```css
.tree-node__name--ancestor {
  color: var(--text-subtle);
  font-weight: 400;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/features/models/components/ModelTreePalettePanel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/models/components/ModelTreePalettePanel.vue src/features/models/components/ModelTreePalettePanel.test.ts
git commit -m "$(cat <<'EOF'
style: mute non-matching ancestors in model tree search

EOF
)"
```

---

### Task 6: Manual verification + plan checkbox sync

**Files:** none required (optional status bump in spec)

- [ ] **Step 1: Run full related suite**

```bash
npx vitest run src/features/models/composables/useTreeSearch.test.ts src/features/models/components/ModelTreePalettePanel.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke in `npm run dev`**

1. Открыть модель с глубокой иерархией и дублирующимися именами.
2. Ввести поиск — видны предки + match, sibling без match скрыт, предки приглушены.
3. Выбрать match → сбросить поиск крестиком — выбор остаётся, дерево раскрыто до узла, строка в viewport.
4. Повторить для диаграммы (поиск по имени диаграммы).

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-08-04-model-tree-search-path-reveal-design.md` set `Status: implemented` (or leave until merge). Commit if changed:

```bash
git add docs/superpowers/specs/2026-08-04-model-tree-search-path-reveal-design.md
git commit -m "$(cat <<'EOF'
docs: mark model tree search path reveal design implemented

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Урезанное дерево (matches + ancestors) | Task 3 |
| Auto-expand предков при поиске | Task 3 |
| Truncation ~250 | Task 3 (`MAX_SEARCH_TREE_ROWS`) |
| Reveal only on clear | Task 4 |
| Keep selection | Task 4 |
| focusDiagram for diagram selection | Task 4 |
| Ancestor muted styling | Task 5 |
| No auto-clear search on click | Task 4 test |
| Unit tests listed in spec | Tasks 2–5 |

## Out of scope (do not implement)

- Snapshot/restore expand state from before search
- Breadcrumb flat list
- Backend / papirus changes

# Diagram Auto-Layout (ELK) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить сетку `√n` в авторазмещении диаграммы модели на elkjs: layered (полная перестройка) и sporeOverlap (убрать наложения), с scope selection/all, compound по геометрии и `controlPoints` из ELK.

**Architecture:** Чистая логика в `src/features/models/layout/` (`diagramLayoutGraph` + `runDiagramLayout`). Canvas только резолвит scope/selection, вызывает runner, эмитит `updateDiagram`. Header — две toolbar-кнопки (без расширения IconToolbar menu). `elkjs` — dynamic import + worker.

**Tech Stack:** Vue 3 + TypeScript (warchi), Vitest, `elkjs`.

**Spec:** `docs/superpowers/specs/2026-07-28-diagram-auto-layout-design.md`

**Branch:** `feat/diagram-auto-layout` (уже создана; design doc уже закоммичен).

**Commits:** только когда пользователь просит; иначе оставлять dirty working tree после задач.

---

## File map

| File | Responsibility |
|------|----------------|
| `package.json` / `package-lock.json` | dependency `elkjs` |
| Create `src/features/models/layout/diagramLayoutGraph.ts` | bounds, compound tree, build ELK JSON, apply result → `DiagramAttrs` |
| Create `src/features/models/layout/diagramLayoutGraph.test.ts` | compound, apply x/y/controlPoints, scope isolation |
| Create `src/features/models/layout/runDiagramLayout.ts` | mode options, auto direction, load elk, run, no-op rules |
| Create `src/features/models/layout/runDiagramLayout.test.ts` | direction, algorithm options, scope, mock ELK |
| Modify `src/features/models/components/ModelDiagramCanvas.vue` | replace `autoLayoutNodes`; add tidy; selection scope; busy; errors via emit |
| Modify `src/features/models/components/ModelEditorHeader.vue` | вторая кнопка tidy + busy disable |
| Modify `src/features/models/ModelEditor.vue` | handle `auto-layout-tidy`; `showUiError` on layout fail |
| Modify `src/i18n/locales/common.ts` | ru/en строки toolbar |

**Out of plan:** papirus `AutoLayout`, notation editor grid layout.

---

### Task 1: Add `elkjs` dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npm install elkjs
```

Expected: `elkjs` appears in `dependencies` (not only lock). Keep existing `file:../papirus` if already set for local papirus work — do not revert it in this task.

- [ ] **Step 2: Sanity import in node**

```bash
node -e "import('elkjs').then(m => console.log(typeof m.default))"
```

Expected: prints `function` (or object with constructable ELK).

---

### Task 2: Graph helpers — bounds + geometric compound (TDD)

**Files:**
- Create: `src/features/models/layout/diagramLayoutGraph.ts`
- Create: `src/features/models/layout/diagramLayoutGraph.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  buildCompoundParentMap,
  nodeBounds,
  type LayoutNode,
} from './diagramLayoutGraph'

const n = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number
): LayoutNode => ({ id, x, y, width: w, height: h })

describe('nodeBounds', () => {
  it('uses defaults when width/height missing', () => {
    expect(nodeBounds({ id: 'a', x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 160,
      height: 90,
    })
  })
})

describe('buildCompoundParentMap', () => {
  it('assigns smallest-area fully containing parent', () => {
    const nodes = [
      n('outer', 0, 0, 400, 300),
      n('inner', 20, 20, 200, 200),
      n('child', 40, 40, 40, 40),
    ]
    const parent = buildCompoundParentMap(nodes, new Set(['outer', 'inner', 'child']))
    expect(parent.get('child')).toBe('inner')
    expect(parent.get('inner')).toBe('outer')
    expect(parent.get('outer')).toBeUndefined()
  })

  it('ignores parents outside scope', () => {
    const nodes = [n('outer', 0, 0, 400, 300), n('child', 40, 40, 40, 40)]
    const parent = buildCompoundParentMap(nodes, new Set(['child']))
    expect(parent.get('child')).toBeUndefined()
  })

  it('requires full containment, not partial overlap', () => {
    const nodes = [n('a', 0, 0, 100, 100), n('b', 80, 80, 50, 50)]
    const parent = buildCompoundParentMap(nodes, new Set(['a', 'b']))
    expect(parent.get('b')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/models/layout/diagramLayoutGraph.test.ts
```

Expected: FAIL — module / exports missing.

- [ ] **Step 3: Minimal implementation**

In `diagramLayoutGraph.ts`:

```ts
import type { DiagramAttrs, DiagramNodeInstance } from '../modelAttrs'

export const DEFAULT_LAYOUT_NODE_WIDTH = 160
export const DEFAULT_LAYOUT_NODE_HEIGHT = 90

export type LayoutNode = {
  id: string
  x: number
  y: number
  width?: number
  height?: number
}

export type LayoutBounds = { x: number; y: number; width: number; height: number }

export function nodeBounds(node: LayoutNode): LayoutBounds {
  return {
    x: node.x,
    y: node.y,
    width: node.width ?? DEFAULT_LAYOUT_NODE_WIDTH,
    height: node.height ?? DEFAULT_LAYOUT_NODE_HEIGHT,
  }
}

function area(b: LayoutBounds): number {
  return b.width * b.height
}

function fullyContains(outer: LayoutBounds, inner: LayoutBounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** Map childId → parentId for nodes in scope. Parent = smallest-area fully containing peer in scope. */
export function buildCompoundParentMap(
  nodes: LayoutNode[],
  scopeIds: Set<string>
): Map<string, string> {
  const scoped = nodes.filter(n => scopeIds.has(n.id))
  const bounds = new Map(scoped.map(n => [n.id, nodeBounds(n)] as const))
  const parent = new Map<string, string>()

  for (const child of scoped) {
    const cb = bounds.get(child.id)!
    let bestId: string | undefined
    let bestArea = Infinity
    for (const cand of scoped) {
      if (cand.id === child.id) continue
      const ob = bounds.get(cand.id)!
      if (area(ob) <= area(cb)) continue
      if (!fullyContains(ob, cb)) continue
      const a = area(ob)
      if (a < bestArea) {
        bestArea = a
        bestId = cand.id
      }
    }
    if (bestId) parent.set(child.id, bestId)
  }
  return parent
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/models/layout/diagramLayoutGraph.test.ts
```

---

### Task 3: `buildElkGraph` + `applyElkLayout` (TDD)

**Files:**
- Modify: `src/features/models/layout/diagramLayoutGraph.ts`
- Modify: `src/features/models/layout/diagramLayoutGraph.test.ts`

- [ ] **Step 1: Extend tests**

```ts
import {
  applyElkLayout,
  buildElkGraph,
  // ...existing
} from './diagramLayoutGraph'
import type { DiagramAttrs } from '../modelAttrs'

describe('buildElkGraph', () => {
  it('nests children and keeps relative edges only inside scope', () => {
    const nodes = [
      n('outer', 0, 0, 400, 300),
      n('a', 40, 40, 80, 40),
      n('b', 40, 120, 80, 40),
      n('out', 500, 0, 80, 40),
    ]
    const edges = [
      { id: 'e1', sourceInstanceId: 'a', targetInstanceId: 'b' },
      { id: 'e2', sourceInstanceId: 'a', targetInstanceId: 'out' },
    ]
    const graph = buildElkGraph(nodes, edges, {
      scopeIds: new Set(['outer', 'a', 'b']),
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
      },
    })
    expect(graph.id).toBe('root')
    expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered')
    const outer = graph.children?.find(c => c.id === 'outer')
    expect(outer?.children?.map(c => c.id).sort()).toEqual(['a', 'b'])
    expect(graph.edges?.map(e => e.id)).toEqual(['e1'])
  })
})

describe('applyElkLayout', () => {
  it('writes node positions and edge controlPoints for scoped elements only', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 100, width: 80, height: 40 },
          { id: 'c', modelNodeId: 'm3', x: 900, y: 900, width: 80, height: 40 },
        ],
        edges: [
          { id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'a', targetInstanceId: 'b' },
          {
            id: 'e2',
            modelLinkId: 'l2',
            sourceInstanceId: 'a',
            targetInstanceId: 'c',
            attrs: { controlPoints: [{ x: 1, y: 1 }] },
          },
        ],
      },
    }
    const elkResult = {
      id: 'root',
      children: [
        { id: 'a', x: 10, y: 20, width: 80, height: 40 },
        { id: 'b', x: 200, y: 20, width: 80, height: 40 },
      ],
      edges: [
        {
          id: 'e1',
          sections: [
            {
              startPoint: { x: 90, y: 40 },
              endPoint: { x: 200, y: 40 },
              bendPoints: [{ x: 140, y: 40 }],
            },
          ],
        },
      ],
    }
    const next = applyElkLayout(diagram, elkResult, new Set(['a', 'b']))
    expect(next.instances.nodes.find(n => n.id === 'a')).toMatchObject({ x: 10, y: 20 })
    expect(next.instances.nodes.find(n => n.id === 'c')).toMatchObject({ x: 900, y: 900 })
    expect(next.instances.edges.find(e => e.id === 'e1')?.attrs?.controlPoints).toEqual([
      { x: 140, y: 40 },
    ])
    expect(next.instances.edges.find(e => e.id === 'e2')?.attrs?.controlPoints).toEqual([
      { x: 1, y: 1 },
    ])
  })

  it('removes controlPoints when ELK returns no bend points', () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 40, height: 40 }],
        edges: [
          {
            id: 'e1',
            modelLinkId: 'l1',
            sourceInstanceId: 'a',
            targetInstanceId: 'a',
            attrs: { controlPoints: [{ x: 5, y: 5 }] },
          },
        ],
      },
    }
    const elkResult = {
      id: 'root',
      children: [{ id: 'a', x: 0, y: 0, width: 40, height: 40 }],
      edges: [
        {
          id: 'e1',
          sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, bendPoints: [] }],
        },
      ],
    }
    const next = applyElkLayout(diagram, elkResult, new Set(['a']))
    expect(next.instances.edges[0]?.attrs?.controlPoints).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/models/layout/diagramLayoutGraph.test.ts
```

- [ ] **Step 3: Implement `buildElkGraph` / `applyElkLayout`**

Key rules:

1. Clone diagram deeply via existing `clonePlainDeep` from `@/utils/clonePlainDeep` (or structured clone of attrs) so input is not mutated.
2. ELK coordinates for nested children are **relative to parent**. When applying, convert absolute world coords: walk tree, `absX = parentAbsX + node.x`.
3. When building, convert world → relative: `relX = worldX - parentWorldX`.
4. Root children = nodes with no parent in `buildCompoundParentMap`.
5. Node `width`/`height` always set from `nodeBounds`.
6. Edge bendPoints only (not start/end) → `attrs.controlPoints`; empty → delete key; drop empty `attrs`.

Types (minimal, avoid tight couple to elkjs in tests):

```ts
export type ElkLayoutOptions = Record<string, string>

export type ElkGraphNode = {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  children?: ElkGraphNode[]
  edges?: ElkGraphEdge[]
  layoutOptions?: ElkLayoutOptions
}

export type ElkGraphEdge = {
  id: string
  sources: string[]
  targets: string[]
  sections?: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    bendPoints?: Array<{ x: number; y: number }>
  }>
}

export function buildElkGraph(
  nodes: LayoutNode[],
  edges: Array<{ id: string; sourceInstanceId: string; targetInstanceId: string }>,
  options: { scopeIds: Set<string>; layoutOptions: ElkLayoutOptions }
): ElkGraphNode {
  // implement compound nesting + filter edges
}

export function applyElkLayout(
  diagram: DiagramAttrs,
  elkResult: ElkGraphNode,
  scopeIds: Set<string>
): DiagramAttrs {
  // clone; flatten absolute positions; update scoped nodes/edges
}
```

For absolute flatten helper:

```ts
function flattenAbsolute(
  node: ElkGraphNode,
  offsetX: number,
  offsetY: number,
  out: Map<string, { x: number; y: number; width: number; height: number }>
): void {
  const x = offsetX + (node.x ?? 0)
  const y = offsetY + (node.y ?? 0)
  if (node.id !== 'root') {
    out.set(node.id, {
      x,
      y,
      width: node.width ?? DEFAULT_LAYOUT_NODE_WIDTH,
      height: node.height ?? DEFAULT_LAYOUT_NODE_HEIGHT,
    })
  }
  for (const child of node.children ?? []) {
    flattenAbsolute(child, node.id === 'root' ? 0 : x, node.id === 'root' ? 0 : y, out)
  }
}
```

Root offset: children of root use their `x/y` as absolute (`offset 0`). Children of a real parent use parent absolute as offset.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/models/layout/diagramLayoutGraph.test.ts
```

---

### Task 4: `runDiagramLayout` — direction, modes, ELK runner (TDD)

**Files:**
- Create: `src/features/models/layout/runDiagramLayout.ts`
- Create: `src/features/models/layout/runDiagramLayout.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  inferLayoutDirection,
  resolveLayoutScopeIds,
  runDiagramLayout,
  type DiagramLayoutMode,
} from './runDiagramLayout'
import type { DiagramAttrs } from '../modelAttrs'

describe('inferLayoutDirection', () => {
  it('returns RIGHT when horizontal deltas dominate', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      { id: 'b', x: 200, y: 10, width: 40, height: 40 },
    ]
    const edges = [{ sourceInstanceId: 'a', targetInstanceId: 'b' }]
    expect(inferLayoutDirection(nodes, edges, new Set(['a', 'b']))).toBe('RIGHT')
  })

  it('returns DOWN when vertical deltas dominate', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      { id: 'b', x: 10, y: 200, width: 40, height: 40 },
    ]
    const edges = [{ sourceInstanceId: 'a', targetInstanceId: 'b' }]
    expect(inferLayoutDirection(nodes, edges, new Set(['a', 'b']))).toBe('DOWN')
  })
})

describe('resolveLayoutScopeIds', () => {
  it('uses selection when non-empty', () => {
    expect(resolveLayoutScopeIds(['a', 'b'], ['a', 'b', 'c'])).toEqual(new Set(['a', 'b']))
  })
  it('falls back to all ids', () => {
    expect(resolveLayoutScopeIds([], ['a', 'b'])).toEqual(new Set(['a', 'b']))
  })
})

const layoutMock = vi.fn()

vi.mock('./elkLoader', () => ({
  getElk: async () => ({ layout: layoutMock }),
}))

describe('runDiagramLayout', () => {
  beforeEach(() => {
    layoutMock.mockReset()
    layoutMock.mockResolvedValue({
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 80, height: 40 },
        { id: 'b', x: 160, y: 0, width: 80, height: 40 },
      ],
      edges: [],
    })
  })

  it('no-ops when fewer than 2 nodes in scope', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [{ id: 'a', modelNodeId: 'm', x: 0, y: 0 }],
        edges: [],
      },
    }
    const result = await runDiagramLayout({
      diagram,
      mode: 'layered',
      selectedInstanceIds: [],
    })
    expect(result).toEqual({ status: 'noop' })
    expect(layoutMock).not.toHaveBeenCalled()
  })

  it('passes layered algorithm and calls apply path', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 0, y: 80, width: 80, height: 40 },
        ],
        edges: [{ id: 'e1', modelLinkId: 'l1', sourceInstanceId: 'a', targetInstanceId: 'b' }],
      },
    }
    const result = await runDiagramLayout({
      diagram,
      mode: 'layered',
      selectedInstanceIds: [],
    })
    expect(result.status).toBe('ok')
    const graphArg = layoutMock.mock.calls[0]?.[0] as { layoutOptions?: Record<string, string> }
    expect(graphArg.layoutOptions?.['elk.algorithm']).toBe('layered')
    expect(graphArg.layoutOptions?.['elk.edgeRouting']).toBe('ORTHOGONAL')
  })

  it('uses sporeOverlap for tidy mode', async () => {
    const diagram: DiagramAttrs = {
      instances: {
        nodes: [
          { id: 'a', modelNodeId: 'm1', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', modelNodeId: 'm2', x: 10, y: 10, width: 80, height: 40 },
        ],
        edges: [],
      },
    }
    await runDiagramLayout({ diagram, mode: 'overlap', selectedInstanceIds: [] })
    const graphArg = layoutMock.mock.calls[0]?.[0] as { layoutOptions?: Record<string, string> }
    expect(graphArg.layoutOptions?.['elk.algorithm']).toBe('sporeOverlap')
  })
})
```

- [ ] **Step 2: Implement `elkLoader.ts` + `runDiagramLayout.ts`**

Create `src/features/models/layout/elkLoader.ts`:

```ts
import type { ElkNode } from 'elkjs'

export type ElkLike = {
  layout: (graph: ElkNode) => Promise<ElkNode>
}

let cached: Promise<ElkLike> | null = null

export function getElk(): Promise<ElkLike> {
  if (!cached) {
    cached = (async () => {
      const ELK = (await import('elkjs/lib/elk.bundled.js')).default
      return new ELK() as ElkLike
    })()
  }
  return cached
}

/** Test-only: reset cache between suites if needed */
export function resetElkCacheForTests(): void {
  cached = null
}
```

Note: start with `elk.bundled.js` for reliability. Optional follow-up in same task if Vite worker setup is straightforward:

```ts
import ELK from 'elkjs/lib/elk-api'
new ELK({
  workerFactory: () =>
    new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url), { type: 'module' }),
})
```

If worker fails in vitest/jsdom, keep bundled path for `getElk` and document worker as follow-up — **do not block** the feature. Prefer bundled for v1 if worker wiring fights Vite.

`runDiagramLayout.ts`:

```ts
export type DiagramLayoutMode = 'layered' | 'overlap'

export type RunDiagramLayoutInput = {
  diagram: DiagramAttrs
  mode: DiagramLayoutMode
  selectedInstanceIds: string[]
}

export type RunDiagramLayoutResult =
  | { status: 'ok'; diagram: DiagramAttrs }
  | { status: 'noop' }
  | { status: 'error'; message: string }

export function resolveLayoutScopeIds(
  selectedInstanceIds: string[],
  allInstanceIds: string[]
): Set<string> {
  if (selectedInstanceIds.length > 0) return new Set(selectedInstanceIds)
  return new Set(allInstanceIds)
}

export function inferLayoutDirection(
  nodes: LayoutNode[],
  edges: Array<{ sourceInstanceId: string; targetInstanceId: string }>,
  scopeIds: Set<string>
): 'RIGHT' | 'DOWN' {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const dxs: number[] = []
  const dys: number[] = []
  for (const e of edges) {
    if (!scopeIds.has(e.sourceInstanceId) || !scopeIds.has(e.targetInstanceId)) continue
    const s = byId.get(e.sourceInstanceId)
    const t = byId.get(e.targetInstanceId)
    if (!s || !t) continue
    const sb = nodeBounds(s)
    const tb = nodeBounds(t)
    dxs.push(Math.abs(tb.x + tb.width / 2 - (sb.x + sb.width / 2)))
    dys.push(Math.abs(tb.y + tb.height / 2 - (sb.y + sb.height / 2)))
  }
  if (dxs.length === 0) return 'RIGHT'
  const mid = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)] ?? 0
  }
  return mid(dxs) >= mid(dys) ? 'RIGHT' : 'DOWN'
}

export async function runDiagramLayout(
  input: RunDiagramLayoutInput
): Promise<RunDiagramLayoutResult> {
  try {
    const allIds = input.diagram.instances.nodes.map(n => n.id)
    const scopeIds = resolveLayoutScopeIds(input.selectedInstanceIds, allIds)
    if (scopeIds.size < 2) return { status: 'noop' }

    const nodes = input.diagram.instances.nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }))
    const edges = input.diagram.instances.edges.map(e => ({
      id: e.id,
      sourceInstanceId: e.sourceInstanceId,
      targetInstanceId: e.targetInstanceId,
    }))

    const direction = inferLayoutDirection(nodes, edges, scopeIds)
    const layoutOptions: Record<string, string> =
      input.mode === 'overlap'
        ? {
            'elk.algorithm': 'sporeOverlap',
            'elk.edgeRouting': 'ORTHOGONAL',
          }
        : {
            'elk.algorithm': 'layered',
            'elk.direction': direction,
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.spacing.nodeNode': '40',
            'elk.layered.spacing.nodeNodeBetweenLayers': '48',
          }

    const graph = buildElkGraph(nodes, edges, { scopeIds, layoutOptions })
    const elk = await getElk()
    const result = await elk.layout(graph as never)
    const diagram = applyElkLayout(input.diagram, result as never, scopeIds)
    return { status: 'ok', diagram }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'error', message }
  }
}
```

Adjust vi.mock path: mock `./elkLoader` from `runDiagramLayout.test.ts` (same folder).

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/features/models/layout/runDiagramLayout.test.ts src/features/models/layout/diagramLayoutGraph.test.ts
```

Expected: PASS.

---

### Task 5: Wire `ModelDiagramCanvas`

**Files:**
- Modify: `src/features/models/components/ModelDiagramCanvas.vue`

- [ ] **Step 1: Replace `autoLayoutNodes` and add tidy**

Find current `autoLayoutNodes` (~2581) and replace with shared runner.

Selection → instance ids:

```ts
const resolveSelectedInstanceIds = (): string[] => {
  const selectedModel = new Set(props.selectedModelNodeIds)
  // Prefer canvas selection of pap nodes mapped via nodeIdToInstance when available;
  // fallback: all instances whose modelNodeId is selected.
  const fromMap: string[] = []
  for (const entity of nodeIdToInstance.values()) {
    if (selectedModel.has(entity.modelNodeId)) fromMap.push(entity.instanceId)
  }
  // Deduplicate
  return [...new Set(fromMap)]
}
```

If diagram-only instances (sticky/container) can be selected without `modelNodeId` in `selectedModelNodeIds`, also read `interactionManager.selection.selectedIds` and map pap→instance. Prefer selection manager when interactions enabled:

```ts
const resolveSelectedInstanceIds = (): string[] => {
  const ids = new Set<string>()
  const selectedPap = interactionManager?.selection.selectedIds
  if (selectedPap && selectedPap.size > 0) {
    for (const papId of selectedPap) {
      const entity = nodeIdToInstance.get(papId)
      if (entity) ids.add(entity.instanceId)
    }
    return [...ids]
  }
  const selectedModel = new Set(props.selectedModelNodeIds)
  for (const inst of instanceNodes.value) {
    if (selectedModel.has(inst.modelNodeId)) ids.add(inst.id)
  }
  return [...ids]
}
```

Implementation:

```ts
const layoutBusy = ref(false)

const runAutoLayout = async (mode: 'layered' | 'overlap') => {
  if (!props.activeDiagram || layoutBusy.value) return
  layoutBusy.value = true
  emit('layoutBusy', true)
  try {
    const diagram = cloneDiagramAttrs()
    const result = await runDiagramLayout({
      diagram,
      mode,
      selectedInstanceIds: resolveSelectedInstanceIds(),
    })
    if (result.status === 'error') {
      emit('layoutError', result.message)
      return
    }
    if (result.status === 'noop') return
    emit('updateDiagram', result.diagram)
    requestAnimationFrame(() => fitToView())
  } finally {
    layoutBusy.value = false
    emit('layoutBusy', false)
  }
}

const autoLayoutNodes = () => {
  void runAutoLayout('layered')
}
const autoLayoutTidy = () => {
  void runAutoLayout('overlap')
}
```

Add emits: `layoutError: [message: string]`, `layoutBusy: [busy: boolean]`.

Export `autoLayoutTidy` alongside `autoLayoutNodes` in `defineExpose`.

- [ ] **Step 2: Typecheck canvas still compiles**

```bash
npx vue-tsc --noEmit 2>&1 | head -40
```

Fix any emit/expose typing issues.

---

### Task 6: Header + ModelEditor + i18n

**Files:**
- Modify: `src/i18n/locales/common.ts`
- Modify: `src/features/models/components/ModelEditorHeader.vue`
- Modify: `src/features/models/ModelEditor.vue`

- [ ] **Step 1: i18n**

In `common.ts` toolbar section (ru + en):

```ts
// ru
autoLayoutNodes: 'Авторазмещение',
autoLayoutTidy: 'Убрать наложения',
autoLayoutFailed: 'Не удалось выполнить авторазмещение',

// en
autoLayoutNodes: 'Auto-layout',
autoLayoutTidy: 'Remove overlaps',
autoLayoutFailed: 'Auto-layout failed',
```

(Keep old meaning; shorten Russian label to match design. Notation key `autoLayoutComponents` unchanged.)

- [ ] **Step 2: Header — two buttons**

Replace single auto-layout button with two adjacent entries:

```ts
{
  icon: 'format_align_center',
  event: 'auto-layout-nodes',
  title: t('toolbar.autoLayoutNodes'),
  disabled: !props.hasActiveDiagram || props.isDiagramReadOnly || props.layoutBusy,
},
{
  icon: 'compress', // Material symbol; if missing in UiIcon set, use 'fullscreen_exit' or 'unfold_less'
  event: 'auto-layout-tidy',
  title: t('toolbar.autoLayoutTidy'),
  disabled: !props.hasActiveDiagram || props.isDiagramReadOnly || props.layoutBusy,
},
```

Add prop `layoutBusy?: boolean` (default false).

- [ ] **Step 3: ModelEditor wiring**

In toolbar action switch (~1923):

```ts
case 'auto-layout-nodes':
  diagramCanvasRef.value?.autoLayoutNodes()
  break
case 'auto-layout-tidy':
  diagramCanvasRef.value?.autoLayoutTidy()
  break
```

On canvas:

```vue
@layout-error="showUiError($event || t('toolbar.autoLayoutFailed'))"
@layout-busy="layoutBusy = $event"
```

`layoutBusy` ref passed to header `:layout-busy="layoutBusy"`.

Use existing `showUiError` helper near `uiError` ref.

- [ ] **Step 4: Manual smoke (dev)**

```bash
npm run dev
```

1. Open model diagram with 3+ linked nodes → Auto-layout → layered placement, edges get bends.
2. Drag nodes to overlap → Remove overlaps → nodes separate, geography recognizable.
3. Select 2 nodes → layout → others stay.
4. Undo (if diagram history tracks attrs update via parent) / revert via editor unsaved discard — at minimum `updateDiagram` once per run.
5. Force error (temporarily break import) → uiError toast, no attrs change.

---

### Task 7: Final verification

- [ ] **Step 1: Unit tests**

```bash
npx vitest run src/features/models/layout/
```

Expected: all PASS.

- [ ] **Step 2: Spec checklist**

Re-read `docs/superpowers/specs/2026-07-28-diagram-auto-layout-design.md` verification checklist; mark items done in PR description (do not edit spec status unless asked).

- [ ] **Step 3: Optional commit** (only if user asks)

```bash
git add package.json package-lock.json \
  src/features/models/layout \
  src/features/models/components/ModelDiagramCanvas.vue \
  src/features/models/components/ModelEditorHeader.vue \
  src/features/models/ModelEditor.vue \
  src/i18n/locales/common.ts
git commit -m "$(cat <<'EOF'
feat(models): ELK auto-layout with layered and overlap modes

Replace naive grid placement with elkjs so edges and nesting drive layout.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| elkjs dependency + lazy load | 1, 4 |
| layered + auto direction | 4 |
| sporeOverlap tidy | 4 |
| selection / all scope | 4, 5 |
| geometric compound in scope | 2, 3 |
| controlPoints from ELK | 3 |
| UI two actions + i18n | 6 |
| undo via single updateDiagram | 5 |
| fitToView | 5 |
| error toast | 5, 6 |
| busy indicator | 5, 6 |
| unit tests | 2–4, 7 |
| Out: papirus / notation | not touched |

**Placeholder scan:** none intentional. Worker is optional fallback to bundled — explicit.

**Type consistency:** `DiagramLayoutMode = 'layered' | 'overlap'`; events `auto-layout-nodes` / `auto-layout-tidy`; functions `buildElkGraph` / `applyElkLayout` / `runDiagramLayout` / `getElk`.

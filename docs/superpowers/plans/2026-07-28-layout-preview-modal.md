# Layout Preview Modal (ELK) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Одна кнопка «Авторазмещение» открывает модалку с SVG-эскизом, режимом Layered/Overlap, настройками ELK и Apply только после явного подтверждения; раскладка всегда на всю диаграмму; рёбра: bends → editable-polyline, иначе straight.

**Architecture:** Чистая логика опций и эскиза в `src/features/models/layout/`. UI — `LayoutPreviewModal` на `BaseModal`. Canvas только применяет готовый `after` через существующий history helper. Toolbar — одна кнопка.

**Tech Stack:** Vue 3 + TypeScript (warchi), Vitest, `elkjs` (уже в зависимостях), `BaseModal`.

**Spec:** `docs/superpowers/specs/2026-07-28-layout-preview-modal-design.md`

**Branch:** `feat/diagram-auto-layout`

**Commits:** только когда пользователь просит; иначе оставлять dirty working tree после задач.

**Prerequisite:** в working tree уже есть правки undo/dirty для layout (`suppressHistoryCanvasPersist`, `updateDiagram(..., { dirty })`) — не откатывать; включить в финальный commit вместе с preview, если ещё не закоммичены.

---

## File map

| File | Responsibility |
|------|----------------|
| Modify `src/features/models/layout/diagramLayoutGraph.ts` | edge type policy: bends → editable-polyline; no bends → straight |
| Modify `src/features/models/layout/diagramLayoutGraph.test.ts` | тесты policy |
| Create `src/features/models/layout/layoutOptions.ts` | UI settings → `ElkLayoutOptions` + defaults |
| Create `src/features/models/layout/layoutOptions.test.ts` | mapping tests |
| Modify `src/features/models/layout/runDiagramLayout.ts` | options override; scope = всегда все ноды |
| Modify `src/features/models/layout/runDiagramLayout.test.ts` | options + full scope |
| Create `src/features/models/layout/layoutSketch.ts` | viewBox + SVG primitives из `DiagramAttrs` |
| Create `src/features/models/layout/layoutSketch.test.ts` | geometry tests |
| Create `src/features/models/components/LayoutPreviewModal.vue` | модалка: режим, settings, toggle, sketch, Update/Apply/Cancel |
| Create `src/features/models/components/LayoutSketchSvg.vue` | тонкая обёртка над `layoutSketch` (optional; можно inline в modal) |
| Modify `src/features/models/components/ModelEditorHeader.vue` | одна кнопка `auto-layout-nodes` |
| Modify `src/features/models/ModelEditor.vue` | open modal; Apply → canvas |
| Modify `src/features/models/components/ModelDiagramCanvas.vue` | `applyLayoutResult(after)`; убрать прямой вызов layout из toolbar paths |
| Modify `src/i18n/locales/common.ts` | строки модалки |

---

### Task 1: Edge type policy in `applyElkLayout`

**Files:**
- Modify: `src/features/models/layout/diagramLayoutGraph.ts`
- Modify: `src/features/models/layout/diagramLayoutGraph.test.ts`

- [ ] **Step 1: Update / add failing tests**

В `diagramLayoutGraph.test.ts` заменить/добавить:

```ts
it('sets editable-polyline when ELK returns bend points', () => {
  // existing setup with bendPoints — expect edgeType editable-polyline + controlPoints
})

it('sets straight and clears controlPoints when ELK has no bend points', () => {
  const diagram = /* edge with bezier + old controlPoints */
  const elkResult = /* edge sections without bendPoints */
  const next = applyElkLayout(diagram, elkResult, new Set(['a', 'b']))
  const edge = next.instances.edges[0]!
  expect(edge.attrs?.controlPoints).toBeUndefined()
  expect(edge.attrs?.diagramStyle).toMatchObject({ edgeType: 'straight' })
})

it('forces editable-polyline even when previous type was polyline', () => {
  // attrs.diagramStyle.edgeType = 'polyline' + bends → editable-polyline
})
```

- [ ] **Step 2: Run tests — expect fail on straight / force polyline cases**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models/layout/diagramLayoutGraph.test.ts
```

- [ ] **Step 3: Implement policy in `applyElkLayout`**

Заменить блок обработки edges на:

```ts
for (const edge of next.instances.edges) {
  const elkEdge = elkEdges.get(edge.id)
  if (!elkEdge) continue
  if (!scopeIds.has(edge.sourceInstanceId) || !scopeIds.has(edge.targetInstanceId)) continue

  const bendPoints = elkEdge.sections?.flatMap(s => s.bendPoints ?? []) ?? []
  if (!edge.attrs) edge.attrs = {}
  const existingStyle =
    edge.attrs.diagramStyle && typeof edge.attrs.diagramStyle === 'object'
      ? (edge.attrs.diagramStyle as Record<string, unknown>)
      : {}

  if (bendPoints.length > 0) {
    edge.attrs.controlPoints = bendPoints.map(p => ({ x: p.x, y: p.y }))
    edge.attrs.diagramStyle = { ...existingStyle, edgeType: 'editable-polyline' }
  } else {
    delete edge.attrs.controlPoints
    edge.attrs.diagramStyle = { ...existingStyle, edgeType: 'straight' }
    if (Object.keys(edge.attrs).length === 1 && edge.attrs.diagramStyle) {
      // keep diagramStyle; do not delete attrs
    }
    if (Object.keys(edge.attrs).length === 0) delete edge.attrs
  }
}
```

Важно: при no-bends всегда писать `edgeType: 'straight'`, даже если `attrs` раньше отсутствовал.

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
npx vitest run src/features/models/layout/diagramLayoutGraph.test.ts
```

---

### Task 2: `layoutOptions` — UI → ELK mapping

**Files:**
- Create: `src/features/models/layout/layoutOptions.ts`
- Create: `src/features/models/layout/layoutOptions.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  defaultLayoutUiOptions,
  toElkLayoutOptions,
  type LayoutUiOptions,
} from './layoutOptions'

describe('toElkLayoutOptions', () => {
  it('maps layered basics', () => {
    const ui = defaultLayoutUiOptions('layered')
    ui.direction = 'DOWN'
    ui.nodeNodeSpacing = 32
    ui.layerSpacing = 64
    ui.edgeRouting = 'POLYLINE'
    const elk = toElkLayoutOptions('layered', ui)
    expect(elk['elk.algorithm']).toBe('layered')
    expect(elk['elk.direction']).toBe('DOWN')
    expect(elk['elk.spacing.nodeNode']).toBe('32')
    expect(elk['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('64')
    expect(elk['elk.edgeRouting']).toBe('POLYLINE')
  })

  it('omits direction/layer spacing for overlap', () => {
    const ui = defaultLayoutUiOptions('overlap')
    ui.nodeNodeSpacing = 50
    const elk = toElkLayoutOptions('overlap', ui)
    expect(elk['elk.algorithm']).toBe('sporeOverlap')
    expect(elk['elk.direction']).toBeUndefined()
    expect(elk['elk.layered.spacing.nodeNodeBetweenLayers']).toBeUndefined()
    expect(elk['elk.spacing.nodeNode']).toBe('50')
  })

  it('applies advanced layered fields when set', () => {
    const ui = defaultLayoutUiOptions('layered')
    ui.padding = '8'
    ui.crossingStrategy = 'LAYER_SWEEP'
    ui.edgeNodeSpacing = 12
    const elk = toElkLayoutOptions('layered', ui)
    expect(elk['elk.padding']).toBe('8')
    expect(elk['elk.layered.crossingMinimization.strategy']).toBe('LAYER_SWEEP')
    expect(elk['elk.spacing.edgeNode']).toBe('12')
  })

  it('enables sporeCompaction when advanced flag on', () => {
    const ui = defaultLayoutUiOptions('overlap')
    ui.sporeCompaction = true
    const elk = toElkLayoutOptions('overlap', ui)
    expect(elk['elk.algorithm']).toBe('org.eclipse.elk.sporeCompaction')
  })
})
```

- [ ] **Step 2: Run — expect fail (module missing)**

```bash
npx vitest run src/features/models/layout/layoutOptions.test.ts
```

- [ ] **Step 3: Implement `layoutOptions.ts`**

```ts
import type { DiagramLayoutMode } from './runDiagramLayout'
import type { ElkLayoutOptions } from './diagramLayoutGraph'

export type LayoutDirectionChoice = 'AUTO' | 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'
export type LayoutEdgeRouting = 'ORTHOGONAL' | 'POLYLINE'
export type CrossingStrategy = 'LAYER_SWEEP' | 'INTERACTIVE'

export type LayoutUiOptions = {
  direction: LayoutDirectionChoice
  nodeNodeSpacing: number
  layerSpacing: number
  edgeRouting: LayoutEdgeRouting
  padding: string
  crossingStrategy: CrossingStrategy | ''
  edgeNodeSpacing: number | null
  sporeCompaction: boolean
}

export function defaultLayoutUiOptions(mode: DiagramLayoutMode): LayoutUiOptions {
  return {
    direction: 'AUTO',
    nodeNodeSpacing: 40,
    layerSpacing: 48,
    edgeRouting: 'ORTHOGONAL',
    padding: '',
    crossingStrategy: '',
    edgeNodeSpacing: null,
    sporeCompaction: false,
  }
}

export function toElkLayoutOptions(
  mode: DiagramLayoutMode,
  ui: LayoutUiOptions,
  resolvedDirection?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'
): ElkLayoutOptions {
  const edgeRouting = ui.edgeRouting
  if (mode === 'overlap') {
    const opts: ElkLayoutOptions = {
      'elk.algorithm': ui.sporeCompaction
        ? 'org.eclipse.elk.sporeCompaction'
        : 'sporeOverlap',
      'elk.edgeRouting': edgeRouting,
      'elk.spacing.nodeNode': String(ui.nodeNodeSpacing),
    }
    return opts
  }

  const direction =
    ui.direction === 'AUTO' ? (resolvedDirection ?? 'RIGHT') : ui.direction
  const opts: ElkLayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.edgeRouting': edgeRouting,
    'elk.spacing.nodeNode': String(ui.nodeNodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(ui.layerSpacing),
  }
  if (ui.padding.trim()) opts['elk.padding'] = ui.padding.trim()
  if (ui.crossingStrategy) {
    opts['elk.layered.crossingMinimization.strategy'] = ui.crossingStrategy
  }
  if (ui.edgeNodeSpacing != null) {
    opts['elk.spacing.edgeNode'] = String(ui.edgeNodeSpacing)
  }
  return opts
}
```

- [ ] **Step 4: Tests PASS**

```bash
npx vitest run src/features/models/layout/layoutOptions.test.ts
```

---

### Task 3: Extend `runDiagramLayout` (options + full-diagram scope)

**Files:**
- Modify: `src/features/models/layout/runDiagramLayout.ts`
- Modify: `src/features/models/layout/runDiagramLayout.test.ts`

- [ ] **Step 1: Update input type and failing tests**

```ts
export type RunDiagramLayoutInput = {
  diagram: DiagramAttrs
  mode: DiagramLayoutMode
  /** @deprecated ignored — layout always uses full diagram */
  selectedInstanceIds?: string[]
  uiOptions?: LayoutUiOptions
}
```

Тесты:

```ts
it('ignores selectedInstanceIds and lays out all nodes', async () => {
  // diagram with 3 nodes; selectedInstanceIds = [only one]
  // mock elk.layout — graph children length === 3 (or all node ids present)
})

it('uses uiOptions mapping for layered', async () => {
  const ui = defaultLayoutUiOptions('layered')
  ui.direction = 'LEFT'
  ui.nodeNodeSpacing = 11
  await runDiagramLayout({ diagram, mode: 'layered', uiOptions: ui })
  expect(graphArg.layoutOptions?.['elk.direction']).toBe('LEFT')
  expect(graphArg.layoutOptions?.['elk.spacing.nodeNode']).toBe('11')
})

it('AUTO direction still infers when ui.direction is AUTO', async () => {
  // existing infer test + uiOptions.direction AUTO
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run src/features/models/layout/runDiagramLayout.test.ts
```

- [ ] **Step 3: Implement**

В `runDiagramLayout`:

```ts
const allIds = diagram.instances.nodes.map(n => n.id)
const scopeIds = new Set(allIds) // always full diagram
if (scopeIds.size < 2) return { status: 'noop' }

const ui = input.uiOptions ?? defaultLayoutUiOptions(mode)
let resolvedDirection: LayoutDirection | undefined
if (mode === 'layered' && ui.direction === 'AUTO') {
  resolvedDirection = inferLayoutDirection(nodes, edges, scopeIds)
}
const layoutOptions = toElkLayoutOptions(mode, ui, resolvedDirection)
```

Удалить старую hardcoded options-ветку.

- [ ] **Step 4: Tests PASS**

```bash
npx vitest run src/features/models/layout/runDiagramLayout.test.ts
```

---

### Task 4: `layoutSketch` — SVG geometry

**Files:**
- Create: `src/features/models/layout/layoutSketch.ts`
- Create: `src/features/models/layout/layoutSketch.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildLayoutSketchModel } from './layoutSketch'
import { parseDiagramAttrs } from '../modelAttrs'

describe('buildLayoutSketchModel', () => {
  it('computes viewBox with padding from node bounds', () => {
    const diagram = parseDiagramAttrs(null)
    diagram.instances.nodes = [
      { id: 'a', modelNodeId: 'n1', x: 0, y: 0, width: 100, height: 40 },
      { id: 'b', modelNodeId: 'n2', x: 200, y: 80, width: 100, height: 40 },
    ]
    diagram.instances.edges = [
      {
        id: 'e1',
        modelLinkId: 'l1',
        sourceInstanceId: 'a',
        targetInstanceId: 'b',
      },
    ]
    const model = buildLayoutSketchModel(diagram, 16)
    expect(model.viewBox).toEqual({ x: -16, y: -16, width: 316, height: 152 })
    expect(model.nodes).toHaveLength(2)
    expect(model.edges[0]!.points.length).toBeGreaterThanOrEqual(2)
  })

  it('uses controlPoints between centers for editable polyline', () => {
    const diagram = parseDiagramAttrs(null)
    diagram.instances.nodes = [
      { id: 'a', modelNodeId: 'n1', x: 0, y: 0, width: 100, height: 40 },
      { id: 'b', modelNodeId: 'n2', x: 200, y: 0, width: 100, height: 40 },
    ]
    diagram.instances.edges = [
      {
        id: 'e1',
        modelLinkId: 'l1',
        sourceInstanceId: 'a',
        targetInstanceId: 'b',
        attrs: {
          controlPoints: [{ x: 150, y: 60 }],
          diagramStyle: { edgeType: 'editable-polyline' },
        },
      },
    ]
    const model = buildLayoutSketchModel(diagram, 0)
    expect(model.edges[0]!.points).toEqual([
      { x: 50, y: 20 },
      { x: 150, y: 60 },
      { x: 250, y: 20 },
    ])
  })
})
```

Подправь числа viewBox под фактическую формулу (padding со всех сторон от min/max bounds).

- [ ] **Step 2: Run — fail**

```bash
npx vitest run src/features/models/layout/layoutSketch.test.ts
```

- [ ] **Step 3: Implement**

```ts
import type { DiagramAttrs } from '../modelAttrs'

export type SketchPoint = { x: number; y: number }
export type SketchNode = { id: string; x: number; y: number; width: number; height: number }
export type SketchEdge = { id: string; points: SketchPoint[] }
export type LayoutSketchModel = {
  viewBox: { x: number; y: number; width: number; height: number }
  nodes: SketchNode[]
  edges: SketchEdge[]
}

function nodeCenter(n: SketchNode): SketchPoint {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
}

export function buildLayoutSketchModel(
  diagram: DiagramAttrs,
  padding = 24
): LayoutSketchModel {
  const nodes: SketchNode[] = diagram.instances.nodes.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }))
  const byId = new Map(nodes.map(n => [n.id, n]))

  const edges: SketchEdge[] = []
  for (const e of diagram.instances.edges) {
    const s = byId.get(e.sourceInstanceId)
    const t = byId.get(e.targetInstanceId)
    if (!s || !t) continue
    const cps = (e.attrs?.controlPoints as SketchPoint[] | undefined) ?? []
    const points = [nodeCenter(s), ...cps, nodeCenter(t)]
    edges.push({ id: e.id, points })
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  for (const e of edges) {
    for (const p of e.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) {
    return { viewBox: { x: 0, y: 0, width: 100, height: 100 }, nodes, edges }
  }
  return {
    viewBox: {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    },
    nodes,
    edges,
  }
}

export function pointsToSvgPath(points: SketchPoint[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `M ${first!.x} ${first!.y}` + rest.map(p => ` L ${p.x} ${p.y}`).join('')
}
```

- [ ] **Step 4: Tests PASS**

```bash
npx vitest run src/features/models/layout/layoutSketch.test.ts
```

---

### Task 5: `LayoutPreviewModal.vue`

**Files:**
- Create: `src/features/models/components/LayoutPreviewModal.vue`

- [ ] **Step 1: Scaffold modal using `BaseModal`**

Props:

```ts
defineProps<{
  open: boolean
  before: DiagramAttrs
  busy?: boolean
}>()
```

Emits:

```ts
defineEmits<{
  close: []
  apply: [after: DiagramAttrs]
  error: [message: string]
}>()
```

Internal state:

- `mode: DiagramLayoutMode` (default `'layered'`)
- `ui: LayoutUiOptions` (`defaultLayoutUiOptions(mode)`)
- `after: DiagramAttrs | null` (null until first successful layout)
- `view: 'before' | 'after'` (default `'after'`)
- `advancedOpen: boolean`
- `updating: boolean`
- `noopMessage: string | null`

On `open` true (watch): reset mode/ui; set `before` from prop; call `refreshPreview()`.

`refreshPreview`:

```ts
async function refreshPreview() {
  updating.value = true
  noopMessage.value = null
  try {
    const result = await runDiagramLayout({
      diagram: props.before,
      mode: mode.value,
      uiOptions: ui.value,
    })
    if (result.status === 'noop') {
      after.value = null
      noopMessage.value = t('toolbar.layoutPreviewNoop')
      return
    }
    if (result.status === 'error') {
      emit('error', result.message)
      return
    }
    after.value = result.diagram
    view.value = 'after'
  } finally {
    updating.value = false
  }
}
```

UI layout (BEM, scoped CSS, CSS vars из `style.css`):

- Left: mode radios; basic fields (hide direction/layer for overlap); «Расширенные» accordion
- Right: toggle Было/Станет; `<svg :viewBox="...">` from `buildLayoutSketchModel(viewAttrs)`; button «Обновить предпросмотр»
- Footer via BaseModal actions: Отмена → `emit('close')`; Применить → `emit('apply', after)` disabled if `!after || updating`

Sketch SVG:

```vue
<svg :viewBox="`${vb.x} ${vb.y} ${vb.width} ${vb.height}`" class="layout-preview__svg">
  <rect v-for="n in sketch.nodes" :key="n.id" :x="n.x" :y="n.y" :width="n.width" :height="n.height" />
  <path v-for="e in sketch.edges" :key="e.id" :d="pointsToSvgPath(e.points)" fill="none" />
</svg>
```

`viewAttrs = view === 'before' ? before : (after ?? before)`.

При смене `mode`: `ui = defaultLayoutUiOptions(mode)` (не авто-refresh — только по кнопке / при открытии).

- [ ] **Step 2: Manual smoke in Story-less app later (Task 6)** — здесь достаточно `vue-tsc` после wiring.

---

### Task 6: Wire toolbar + ModelEditor + Canvas apply

**Files:**
- Modify: `src/features/models/components/ModelEditorHeader.vue`
- Modify: `src/features/models/ModelEditor.vue`
- Modify: `src/features/models/components/ModelDiagramCanvas.vue`
- Modify: `src/i18n/locales/common.ts`

- [ ] **Step 1: Header — одна кнопка**

Удалить toolbar item `auto-layout-tidy`. Оставить:

```ts
{
  event: 'auto-layout-nodes',
  title: t('toolbar.autoLayoutNodes'),
  disabled: !props.hasActiveDiagram || props.isDiagramReadOnly || props.layoutBusy,
  // icon unchanged
}
```

- [ ] **Step 2: i18n**

В `common.ts` ru/en добавить ключи (и можно оставить `autoLayoutTidy` unused или удалить):

```ts
layoutPreviewTitle: 'Авторазмещение',
layoutPreviewUpdate: 'Обновить предпросмотр',
layoutPreviewApply: 'Применить',
layoutPreviewCancel: 'Отмена',
layoutPreviewWas: 'Было',
layoutPreviewWill: 'Станет',
layoutPreviewModeLayered: 'Слои',
layoutPreviewModeOverlap: 'Убрать наложения',
layoutPreviewDirection: 'Направление',
layoutPreviewDirectionAuto: 'Авто',
layoutPreviewNodeSpacing: 'Отступ между нодами',
layoutPreviewLayerSpacing: 'Отступ между слоями',
layoutPreviewEdgeRouting: 'Рёбра',
layoutPreviewAdvanced: 'Расширенные',
layoutPreviewPadding: 'Padding',
layoutPreviewCrossing: 'Crossing strategy',
layoutPreviewEdgeNodeSpacing: 'Отступ ребро–нода',
layoutPreviewCompaction: 'Compaction',
layoutPreviewNoop: 'Недостаточно элементов для раскладки',
```

EN equivalents.

- [ ] **Step 3: Canvas — `applyLayoutResult`**

Заменить публичный API:

- Оставить `autoLayoutNodes` / `autoLayoutTidy` как deprecated no-ops **или** удалить и экспортировать:

```ts
const applyLayoutResult = (after: DiagramAttrs): void => {
  if (!props.activeDiagram || props.readOnly) return
  const before = cloneDiagramAttrs()
  const clearDirtyOnUndo = !props.diagramDirty
  const history = interactionManager?.history
  if (history && typeof history.execute === 'function') {
    history.execute({
      execute: () => {
        runLayoutHistoryCommand(() => applyDiagramAttrsToCanvas(after))
      },
      undo: () => {
        runLayoutHistoryCommand(() =>
          applyDiagramAttrsToCanvas(before, { dirty: !clearDirtyOnUndo })
        )
      },
    })
  } else {
    applyDiagramAttrsToCanvas(after)
  }
  requestAnimationFrame(() => fitToView())
}
```

Удалить внутренний `runAutoLayout` / вызовы `runDiagramLayout` из canvas (layout только из модалки).

Export `applyLayoutResult` from `defineExpose`.

- [ ] **Step 4: ModelEditor wiring**

```ts
const showLayoutPreviewModal = ref(false)
const layoutPreviewBefore = ref<DiagramAttrs | null>(null)

// toolbar case:
case 'auto-layout-nodes': {
  const d = activeDiagram.value
  if (!d || isDiagramReadOnly.value) return
  layoutPreviewBefore.value = clonePlainDeep(d.parsedAttrs)
  showLayoutPreviewModal.value = true
  break
}
// remove auto-layout-tidy case

function handleLayoutPreviewApply(after: DiagramAttrs) {
  showLayoutPreviewModal.value = false
  layoutPreviewBefore.value = null
  diagramCanvasRef.value?.applyLayoutResult(after)
}

function handleLayoutPreviewClose() {
  showLayoutPreviewModal.value = false
  layoutPreviewBefore.value = null
}
```

Template:

```vue
<LayoutPreviewModal
  v-if="layoutPreviewBefore"
  :open="showLayoutPreviewModal"
  :before="layoutPreviewBefore"
  :busy="layoutBusy"
  @close="handleLayoutPreviewClose"
  @apply="handleLayoutPreviewApply"
  @error="(msg) => setUiError(msg || t('toolbar.autoLayoutFailed'))"
/>
```

Убрать зависимость header от двух layout events; `layoutBusy` можно оставить false или прокидывать из модалки через emit — optional: модалка сама крутит внутренний `updating`, header busy не обязателен.

- [ ] **Step 5: Typecheck**

```bash
npx vue-tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Run layout-related tests**

```bash
npx vitest run src/features/models/layout/
```

Expected: all PASS.

---

### Task 7: Manual verification checklist

- [ ] **Step 1: Dev / local deploy**

Открыть диаграмму с ≥2 нодами и связями.

- [ ] **Step 2: Checklist**

1. В toolbar одна кнопка авторазмещения (нет отдельной «Убрать наложения»).
2. Модалка: сразу виден эскиз «Станет»; toggle Было/Станет.
3. Смена spacing → без автопересчёта; «Обновить» меняет эскиз.
4. Режим Overlap скрывает direction/layer spacing; advanced compaction доступен.
5. Применить → основной канвас обновляется; один Undo возвращает; с чистого состояния dirty снимается.
6. Рёбра с bends — editable-polyline; без bends — straight.
7. &lt;2 нод — noop message, Apply disabled.
8. Отмена / Esc — канвас без изменений.

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Одна кнопка | Task 6 |
| Модалка режим + settings + advanced | Task 5 |
| Toggle было/станет | Task 5 |
| SVG sketch | Task 4–5 |
| Update button only | Task 5 |
| Full-diagram scope | Task 3 |
| Options → ELK | Task 2–3 |
| Edge policy bends/straight | Task 1 |
| Apply history + dirty undo | Task 6 (existing helpers) |
| i18n | Task 6 |
| Unit tests | Tasks 1–4 |
| Out: selection scope, live debounce, papirus preview | not planned |

**Placeholders:** none intentional.  
**Types:** `LayoutUiOptions`, `DiagramLayoutMode`, `applyLayoutResult(after: DiagramAttrs)` consistent across tasks.

# Fixed cornerCut for beveled + sticky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beveled rectangle chamfer uses absolute `cornerCut` px (editable like radius); sticky-note fold cut is fixed at 16px.

**Architecture:** Extend `diagramShapes.ts` factories to take a pixel cut (beveled from arg / sticky hardcoded 16). Persist `diagramStyle.cornerCut` for beveled; wire Style UI and `diagramNodeFactory` / composite sync. Papirus unchanged.

**Tech Stack:** Vue 3 + TypeScript (warchi), Vitest, existing `DiagramStyle` / Style panels.

**Spec:** `docs/superpowers/specs/2026-07-26-corner-cut-beveled-sticky-design.md`

---

## File map

| File | Role |
|------|------|
| `src/utils/diagramShapes.ts` | Clamp helpers + beveled/sticky geometry with px cut |
| `src/utils/diagramShapes.test.ts` | Geometry unit tests |
| `src/domain/attrs/notationAttrs.ts` | `cornerCut` on `DiagramStyle` + normalize |
| `src/features/diagram/diagramNodeFactory.ts` | Pass cut into factories / closures |
| `src/features/diagram-style/composables/useNodeStyleState.ts` | ref + load/emit |
| `src/features/diagram-style/components/NodeStylePanel.vue` | Cut input when beveled |
| `src/features/diagram-style/components/composite/CompositeStylePanel.vue` | Cut when outer beveled |
| `src/features/models/components/ModelDiagramCanvas.vue` | Outer fingerprint includes `cornerCut` |
| `src/i18n/locales/diagram.ts` | `nodeStyle.cornerCut` ru/en |

**Branch:** continue on `feat/shape-scale-slice` (or create `feat/corner-cut-beveled` if splitting PRs).

**Commits:** only when the user asks; otherwise leave working tree dirty after tasks.

---

### Task 1: Geometry — beveled + sticky fixed cuts

**Files:**
- Modify: `src/utils/diagramShapes.ts`
- Modify: `src/utils/diagramShapes.test.ts`

- [ ] **Step 1: Write failing tests**

Replace beveled/sticky expectations in `diagramShapes.test.ts`:

```ts
describe('beveled-rectangle', () => {
  it('uses default 12px cut when cutPx omitted', () => {
    const svg = diagramShapeFactories['beveled-rectangle'].svgPath(200, 100)
    expect(svg).toContain('M 12 0')
  })

  it('keeps cut px when width grows', () => {
    const narrow = diagramShapeFactories['beveled-rectangle'].svgPath(120, 80, 14)
    const wide = diagramShapeFactories['beveled-rectangle'].svgPath(300, 80, 14)
    expect(narrow).toContain('M 14 0')
    expect(wide).toContain('M 14 0')
  })

  it('clamps cut to half min dimension', () => {
    const svg = diagramShapeFactories['beveled-rectangle'].svgPath(20, 20, 50)
    expect(svg).toContain('M 10 0')
  })
})

describe('sticky-note', () => {
  it('uses fixed 16px cut on large note', () => {
    const svg = diagramShapeFactories['sticky-note'].svgPath(200, 100)
    expect(svg).toContain('L 184 0') // 200 - 16
  })

  it('clamps cut on tiny note', () => {
    const svg = diagramShapeFactories['sticky-note'].svgPath(20, 20)
    expect(svg).toContain('L 10 0') // min(16, 10)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/utils/diagramShapes.test.ts`

Expected: FAIL on new cut expectations (old proportional math).

- [ ] **Step 3: Implement geometry**

In `diagramShapes.ts`:

```ts
export const DEFAULT_CORNER_CUT_PX = 12
export const STICKY_NOTE_CORNER_CUT_PX = 16

export function clampCornerCut(cutPx: number, width: number, height: number): number {
  const cut = Number.isFinite(cutPx) && cutPx > 0 ? cutPx : 0
  return Math.min(cut, width / 2, height / 2)
}

export interface DiagramShapeFactory {
  path: (width: number, height: number, cutPx?: number) => Path2D
  svgPath: (width: number, height: number, cutPx?: number) => string
}

function resolveBeveledCut(width: number, height: number, cutPx?: number): number {
  const raw =
    cutPx != null && Number.isFinite(cutPx) ? Math.max(0, cutPx) : DEFAULT_CORNER_CUT_PX
  return clampCornerCut(raw, width, height)
}

function beveledRectanglePath(width: number, height: number, cutPx?: number): Path2D {
  const cut = resolveBeveledCut(width, height, cutPx)
  // ... same path as today using `cut`
}

function beveledRectangleSvgPath(w: number, h: number, cutPx?: number): string {
  const cut = resolveBeveledCut(w, h, cutPx)
  return `M ${cut} 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h - cut} L ${w - cut} ${h} L ${cut} ${h} L 0 ${h - cut} L 0 ${cut} Z`
}

function stickyNotePath(width: number, height: number): Path2D {
  const cut = clampCornerCut(STICKY_NOTE_CORNER_CUT_PX, width, height)
  // ... same path
}

function stickyNoteSvgPath(w: number, h: number): string {
  const cut = clampCornerCut(STICKY_NOTE_CORNER_CUT_PX, w, h)
  return `M 0 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h} L 0 ${h} Z`
}
```

Keep trapezoid / slanted / folder-tab unchanged (ignore extra `cutPx` if signature shared).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/utils/diagramShapes.test.ts`

Expected: PASS

---

### Task 2: `DiagramStyle.cornerCut` normalize

**Files:**
- Modify: `src/domain/attrs/notationAttrs.ts`
- Test: add assertions in existing attrs tests if present, else small unit near normalize

- [ ] **Step 1: Add field + normalize**

On `DiagramStyle`:

```ts
/** Chamfer size in px for beveled-rectangle (like cornerRadius for rounded rect). */
cornerCut?: number
```

In `normalizeDiagramStyle` (next to `cornerRadius`):

```ts
if (typeof value.cornerCut === 'number' && Number.isFinite(value.cornerCut) && value.cornerCut >= 0) {
  style.cornerCut = value.cornerCut
}
```

- [ ] **Step 2: Quick check**

Run any existing notationAttrs / diagramStyle normalize test, or:

```bash
npx vitest run src/domain/attrs -t "corner" 2>/dev/null || true
npx vue-tsc -b --pretty false 2>&1 | head -20
```

Expected: no new type errors from `cornerCut`.

---

### Task 3: Factory wiring

**Files:**
- Modify: `src/features/diagram/diagramNodeFactory.ts`
- Modify: `src/features/diagram/diagramNodeFactory.test.ts` (if beveled assertions exist)

- [ ] **Step 1: Resolve cut helper**

```ts
import {
  diagramShapeFactories,
  DEFAULT_CORNER_CUT_PX,
} from '@/utils/diagramShapes'

function resolveCornerCutPx(ds?: DiagramStyle): number {
  const v = ds?.cornerCut
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CORNER_CUT_PX
}
```

- [ ] **Step 2: Beveled CustomShapeNode uses cut**

Replace `createFactoryBackedCustomNode` usage for beveled (or specialize):

```ts
} else if (shape === 'beveled-rectangle') {
  const cut = resolveCornerCutPx(ds)
  const factory = diagramShapeFactories['beveled-rectangle']
  node = new CustomShapeNode({
    ...commonOptions,
    path: (w, h) => factory.path(w, h, cut),
    svgPath: (w, h) => factory.svgPath(w, h, cut),
  })
} else if (shape === 'trapezoid') {
  node = createFactoryBackedCustomNode(commonOptions, shape)
} else if (shape === 'slanted-rectangle') {
  node = createFactoryBackedCustomNode(commonOptions, shape)
```

Special sticky path already uses `diagramShapeFactories['sticky-note']` — sticky factory ignores cut and uses 16 internally (no change to call sites required beyond Task 1).

- [ ] **Step 3: Composite outer beveled**

Where `compositePathFactory = diagramShapeFactories[rawCompositeShape]?.path`, for beveled close over cut:

```ts
} else if (rawCompositeShape === 'beveled-rectangle') {
  const cut = resolveCornerCutPx(ds)
  const factory = diagramShapeFactories['beveled-rectangle']
  compositePathFactory = (w, h) => factory.path(w, h, cut)
  compositeSvgPathFactory = (w, h) => factory.svgPath(w, h, cut)
} else if (compositeShapeMappedToCustom) {
  // trapezoid / slanted as today
```

- [ ] **Step 4: Tests**

```bash
npx vitest run src/features/diagram/diagramNodeFactory.test.ts src/utils/diagramShapes.test.ts
```

Expected: PASS

---

### Task 4: Style state + UI

**Files:**
- Modify: `src/features/diagram-style/composables/useNodeStyleState.ts`
- Modify: `src/features/diagram-style/components/NodeStylePanel.vue`
- Modify: `src/features/diagram-style/components/composite/CompositeStylePanel.vue`
- Modify: `src/i18n/locales/diagram.ts`

- [ ] **Step 1: i18n**

In `diagram.ts` under `nodeStyle` (ru + en):

```ts
cornerCut: 'Срез',
// en:
cornerCut: 'Cut',
```

- [ ] **Step 2: `useNodeStyleState`**

Add `const cornerCut = ref(DEFAULT_CORNER_CUT_PX)` (import default from diagramShapes).

In `loadNodeProps`: `cornerCut.value = currentDiagramStyle?.cornerCut ?? DEFAULT_CORNER_CUT_PX`

In `buildNodeStyle`: always emit `cornerCut: cornerCut.value` when shape is `beveled-rectangle`, or when composite + `compositeShapeType === 'beveled-rectangle'`:

```ts
...(nodeShape.value === 'beveled-rectangle' ||
(nodeShape.value === 'composite' && compositeShapeType.value === 'beveled-rectangle')
  ? { cornerCut: cornerCut.value }
  : {}),
```

Export `cornerCut` from the composable return.

- [ ] **Step 3: NodeStylePanel**

Destructure `cornerCut`. Load/emit in presets/watchers like `cornerRadius`.

In dimensions grid, after R:

```vue
<LabeledNumberInput
  v-if="nodeShape === 'beveled-rectangle'"
  :label="t('nodeStyle.cornerCut')"
  :model-value="cornerCut"
  :min="0"
  :max="80"
  :step="1"
  @update:model-value="handleCornerCutChange"
/>
```

`handleCornerCutChange`: set ref, reset preset, `emitNodeStyle()`, and if selected node is CustomShapeNode beveled, `setPathFactory` with new cut (mirror radius live update pattern if present).

Adjust grid class: show 3 columns when rectangle (W/H/R) or beveled (W/H/Cut).

- [ ] **Step 4: CompositeStylePanel**

Same: ref `cornerCut`, load/emit when `compositeShapeType === 'beveled-rectangle'`, show `LabeledNumberInput` next to R (R can stay for rounded rect outer; for beveled show Cut instead of or in addition to R — **show Cut when beveled, R when rectangle**).

```vue
<LabeledNumberInput
  v-if="compositeShapeType === 'rectangle'"
  label="R"
  ...
/>
<LabeledNumberInput
  v-if="compositeShapeType === 'beveled-rectangle'"
  :label="t('nodeStyle.cornerCut')"
  :model-value="cornerCut"
  ...
/>
```

- [ ] **Step 5: Typecheck**

```bash
npx vue-tsc -b --pretty false 2>&1 | head -40
```

Expected: clean

---

### Task 5: Canvas sync fingerprints

**Files:**
- Modify: `src/features/models/components/ModelDiagramCanvas.vue`
- Modify: `src/features/notations/composables/useNotationDiagram.ts` (if beveled path is updated in-place without recreate)

- [ ] **Step 1: Model composite outer key**

In `getCompositeOuterShapeKey`:

```ts
return JSON.stringify({
  compositeShapeType: ds?.compositeShapeType ?? 'rectangle',
  customShapeId: ds?.customShapeId ?? null,
  customOutline: ds?.customOutline ?? null,
  customScaleSlice: ds?.customScaleSlice ?? null,
  cornerRadius: ds?.cornerRadius ?? 0,
  cornerCut: ds?.cornerCut ?? null,
})
```

- [ ] **Step 2: Notation / model beveled in-place update**

Where existing `CustomShapeNode` with `beveled-rectangle` is synced, refresh path factory with `resolveCornerCutPx(ds)` (same pattern as custom outline `setPathFactory`). If sync always recreates on style change, ensure create path uses Task 3 wiring.

For notation: if beveled is only updated via full replace when shape changes, still ensure style property updates recreate or `setPathFactory` when `cornerCut` changes — prefer calling `setPathFactory` when `expectedShape === 'beveled-rectangle'`.

- [ ] **Step 3: Smoke tests**

```bash
npx vitest run src/utils/diagramShapes.test.ts src/features/diagram/diagramNodeFactory.test.ts
```

Expected: PASS

---

### Task 6: Manual verify + optional local deploy

- [ ] **Step 1: Manual checklist**

1. Notation Style → beveled → set Cut 8 vs 24 → resize node → chamfer size stays.
2. Model note (sticky) → wide vs tall → fold ≈ 16px.
3. Composite outer beveled → Cut field works; rebuild on change.

- [ ] **Step 2: Local k8s (if requested)**

```bash
SKIP_CONFIRM=true ./scripts/deploy.sh
```

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| `cornerCut` on DiagramStyle + normalize | 2 |
| Beveled px cut + default 12 + clamp | 1, 3 |
| Sticky fixed 16 + clamp | 1 |
| Style UI like radius | 4 |
| Composite beveled | 3, 4, 5 |
| Factory / sync / export path | 1, 3, 5 |
| No papirus / no sticky UI / no diamond | respected |
| Tests | 1, 3 |

## Placeholder scan

No TBD / “similar to Task N” without code.

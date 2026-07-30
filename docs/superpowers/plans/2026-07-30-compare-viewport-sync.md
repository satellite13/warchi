# Compare Viewport Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в dual-diagram compare переключатель синхронизации pan/zoom между левым и правым canvas (default ON, persist в localStorage).

**Architecture:** `ModelDiagramCanvas` expose `getViewport`/`setViewport` и emit `viewport-change`. `DualDiagramCompareView` держит toggle + guard + last-active snap. Papirus не меняем (`renderer.viewport` уже есть).

**Tech Stack:** Vue 3 `<script setup>`, Vitest + `@vue/test-utils`, `@/utils/localStorage`, papirus `ViewportState`.

**Spec:** `docs/superpowers/specs/2026-07-30-compare-viewport-sync-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/features/models/components/ModelDiagramCanvas.vue` | `getViewport` / `setViewport`, emit `viewport-change` on zoom/pan |
| `src/features/models/components/DualDiagramCompareView.vue` | Toggle UI, sync logic, localStorage, snap on enable / after fit |
| `src/features/models/components/DualDiagramCompareView.test.ts` | Persist, sync, snap, guard |
| `src/i18n/locales/models.ts` | `compareSyncViewports`, `compareSyncViewportsHint` (ru/en) |

---

### Task 1: Feature branch

**Files:** none (git only)

- [ ] **Step 1: Create branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git checkout master
git pull --ff-only
git checkout -b feat/compare-viewport-sync
```

Expected: on `feat/compare-viewport-sync`.

---

### Task 2: Failing sync tests (DualDiagramCompareView)

**Files:**
- Modify: `src/features/models/components/DualDiagramCompareView.test.ts`

- [ ] **Step 1: Upgrade canvas stub and helpers**

Replace the `canvasStub` / mount helpers so each canvas instance tracks viewport and records `setViewport` calls. Add `beforeEach` that clears localStorage key `warchi:compare-sync-viewports`.

```ts
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DualDiagramCompareView from './DualDiagramCompareView.vue'
import { nextTick } from 'vue'

const SYNC_KEY = 'warchi:compare-sync-viewports'

type Viewport = { zoom: number; offsetX: number; offsetY: number }

function makeCanvasStub() {
  return {
    name: 'ModelDiagramCanvas',
    template: '<div class="canvas-stub" />',
    data() {
      return {
        _viewport: { zoom: 1, offsetX: 0, offsetY: 0 } as Viewport,
        setViewportCalls: [] as Viewport[],
      }
    },
    methods: {
      fitToView: vi.fn(),
      getViewport(): Viewport {
        return { ...(this as { _viewport: Viewport })._viewport }
      },
      setViewport(state: Viewport) {
        const self = this as {
          _viewport: Viewport
          setViewportCalls: Viewport[]
          $emit: (e: string, p: Viewport) => void
        }
        self._viewport = { ...state }
        self.setViewportCalls.push({ ...state })
        // Simulate papirus: setting viewport emits change (for guard test)
        self.$emit('viewport-change', { ...state })
      },
    },
  }
}

// In mountCompare global.stubs.ModelDiagramCanvas use makeCanvasStub()
// Keep existing mocks (i18n, useResizablePropsPanel, useComparisonDiff)
```

Update `mountCompare` to accept optional `syncStorage?: '1' | '0' | null` and set/remove `SYNC_KEY` before mount. Keep `withDiagrams: true` as default for sync tests (need both canvas refs).

Helper to get stub instances:

```ts
function canvasStubs(wrapper: ReturnType<typeof mountCompare>) {
  const canvases = wrapper.findAllComponents({ name: 'ModelDiagramCanvas' })
  return {
    left: canvases[0]!,
    right: canvases[1]!,
  }
}
```

- [ ] **Step 2: Add failing tests**

Append inside `describe('DualDiagramCompareView', …)`:

```ts
describe('viewport sync', () => {
  beforeEach(() => {
    localStorage.removeItem(SYNC_KEY)
  })

  it('defaults sync ON and renders toggle checked', () => {
    const wrapper = mountCompare({ withDiagrams: true })
    const input = wrapper.find('.ddc__sync-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).checked).toBe(true)
  })

  it('restores sync OFF from localStorage', () => {
    localStorage.setItem(SYNC_KEY, '0')
    const wrapper = mountCompare({ withDiagrams: true })
    expect((wrapper.find('.ddc__sync-input').element as HTMLInputElement).checked).toBe(false)
  })

  it('persists toggle to localStorage', async () => {
    const wrapper = mountCompare({ withDiagrams: true })
    await wrapper.find('.ddc__sync-input').setValue(false)
    expect(localStorage.getItem(SYNC_KEY)).toBe('0')
    await wrapper.find('.ddc__sync-input').setValue(true)
    expect(localStorage.getItem(SYNC_KEY)).toBe('1')
  })

  it('copies viewport from left to right when sync is on', async () => {
    const wrapper = mountCompare({ withDiagrams: true })
    const { left, right } = canvasStubs(wrapper)
    const vp = { zoom: 2, offsetX: 40, offsetY: -10 }
    await left.vm.$emit('viewport-change', vp)
    await nextTick()
    expect(right.vm.setViewportCalls.at(-1)).toEqual(vp)
  })

  it('does not sync when toggle is off', async () => {
    localStorage.setItem(SYNC_KEY, '0')
    const wrapper = mountCompare({ withDiagrams: true })
    const { left, right } = canvasStubs(wrapper)
    const before = right.vm.setViewportCalls.length
    await left.vm.$emit('viewport-change', { zoom: 3, offsetX: 1, offsetY: 2 })
    await nextTick()
    expect(right.vm.setViewportCalls.length).toBe(before)
  })

  it('snaps opposite to last active when sync is turned on', async () => {
    localStorage.setItem(SYNC_KEY, '0')
    const wrapper = mountCompare({ withDiagrams: true })
    const { left, right } = canvasStubs(wrapper)

    // Record activity on right while unsynced
    right.vm._viewport = { zoom: 1.5, offsetX: 9, offsetY: 8 }
    await right.vm.$emit('viewport-change', right.vm._viewport)
    await nextTick()

    await wrapper.find('.ddc__sync-input').setValue(true)
    await nextTick()

    expect(left.vm.setViewportCalls.at(-1)).toEqual({ zoom: 1.5, offsetX: 9, offsetY: 8 })
  })

  it('does not loop when setViewport emits viewport-change on target', async () => {
    const wrapper = mountCompare({ withDiagrams: true })
    const { left, right } = canvasStubs(wrapper)
    const leftBefore = left.vm.setViewportCalls.length
    await left.vm.$emit('viewport-change', { zoom: 2, offsetX: 5, offsetY: 6 })
    await nextTick()
    // right.setViewport emits viewport-change; left must not receive a setViewport from that
    expect(left.vm.setViewportCalls.length).toBe(leftBefore)
  })
})
```

Keep existing mount tests working: when `withDiagrams` is false, sync toggle still renders (topbar always visible).

- [ ] **Step 3: Run tests — expect fail**

```bash
npx vitest run src/features/models/components/DualDiagramCompareView.test.ts
```

Expected: FAIL — `.ddc__sync-input` missing / sync behaviour absent.

- [ ] **Step 4: Commit tests**

```bash
git add src/features/models/components/DualDiagramCompareView.test.ts
git commit -m "$(cat <<'EOF'
test: add failing cases for compare viewport sync

EOF
)"
```

---

### Task 3: ModelDiagramCanvas viewport API

**Files:**
- Modify: `src/features/models/components/ModelDiagramCanvas.vue`

- [ ] **Step 1: Add emit + helpers + expose**

Near other imports / types, ensure `ViewportState` is available:

```ts
import type { ViewportState } from '@ngroznykh/papirus'
```

(If already imported via another type import, merge into existing import.)

In `defineEmits`, add:

```ts
viewportChange: [viewport: ViewportState]
```

In zoom/pan listeners (where `viewportRev` increments), also emit:

```ts
r.on('zoom', () => {
  viewportRev.value += 1
  emit('viewportChange', r.viewport)
  // ... existing persist logic
})
r.on('pan', () => {
  viewportRev.value += 1
  emit('viewportChange', r.viewport)
  // ... existing persist logic
})
```

Add functions before `defineExpose`:

```ts
const getViewport = (): ViewportState | null => {
  if (!renderer) return null
  return { ...renderer.viewport }
}

const setViewport = (state: ViewportState): void => {
  if (!renderer) return
  renderer.viewport = {
    zoom: state.zoom,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
  }
}
```

Expose:

```ts
defineExpose({
  // ...existing
  getViewport,
  setViewport,
})
```

Note: template listeners use kebab-case `@viewport-change` ↔ emit name `viewportChange`.

- [ ] **Step 2: Typecheck canvas surface (optional smoke)**

```bash
npx vue-tsc --noEmit
```

Expected: no new errors from this change (full project may already have unrelated noise — focus on this file).

- [ ] **Step 3: Commit**

```bash
git add src/features/models/components/ModelDiagramCanvas.vue
git commit -m "$(cat <<'EOF'
feat: expose canvas viewport get/set and change events

EOF
)"
```

---

### Task 4: DualDiagramCompareView sync + i18n + UI

**Files:**
- Modify: `src/features/models/components/DualDiagramCompareView.vue`
- Modify: `src/i18n/locales/models.ts`

- [ ] **Step 1: Add i18n keys**

In `models.ts` Russian block (near `compareToggleBase`):

```ts
compareSyncViewports: 'Синхронизация',
compareSyncViewportsHint: 'Синхронизировать перемещение и масштаб обеих диаграмм',
```

In English block:

```ts
compareSyncViewports: 'Sync',
compareSyncViewportsHint: 'Sync pan and zoom of both diagrams',
```

- [ ] **Step 2: Implement sync state and handlers in script**

Add imports:

```ts
import { loadString, saveString } from '@/utils/localStorage'
import type { ViewportState } from '@ngroznykh/papirus'
```

After canvas refs:

```ts
const SYNC_VIEWPORTS_KEY = 'warchi:compare-sync-viewports'
const syncViewports = ref(loadString(SYNC_VIEWPORTS_KEY, '1') !== '0')
const lastActiveSide = ref<'left' | 'right'>('left')
let applyingSync = false

function canvasFor(side: 'left' | 'right') {
  return side === 'left' ? leftCanvasRef.value : rightCanvasRef.value
}

function otherSide(side: 'left' | 'right'): 'left' | 'right' {
  return side === 'left' ? 'right' : 'left'
}

function applyViewportTo(side: 'left' | 'right', state: ViewportState): void {
  const canvas = canvasFor(side)
  if (!canvas) return
  applyingSync = true
  try {
    canvas.setViewport(state)
  } finally {
    applyingSync = false
  }
}

function handleViewportChange(side: 'left' | 'right', _viewport: ViewportState): void {
  lastActiveSide.value = side
  if (!syncViewports.value || applyingSync) return
  const src = canvasFor(side)?.getViewport()
  if (!src) return
  applyViewportTo(otherSide(side), src)
}

function snapOtherTo(side: 'left' | 'right'): void {
  const src = canvasFor(side)?.getViewport()
  if (!src) return
  applyViewportTo(otherSide(side), src)
}

function onSyncToggle(next: boolean): void {
  syncViewports.value = next
  saveString(SYNC_VIEWPORTS_KEY, next ? '1' : '0')
  if (next) snapOtherTo(lastActiveSide.value)
}

function centerBothCanvases(): void {
  nextTick(() => {
    requestAnimationFrame(() => {
      leftCanvasRef.value?.fitToView()
      rightCanvasRef.value?.fitToView()
      if (syncViewports.value) {
        const src = leftCanvasRef.value?.getViewport()
        if (src) applyViewportTo('right', src)
      }
    })
  })
}
```

Replace the existing `centerBothCanvases` body with the version above (keep the same `watch` on diagrams).

- [ ] **Step 3: Wire template**

On both `ModelDiagramCanvas`:

```vue
@viewport-change="(vp) => handleViewportChange('left', vp)"
```

and `'right'` on the other.

After `<slot name="topbar-extra" />` add:

```vue
<label
  class="ddc__sync"
  :title="t('models.compareSyncViewportsHint')"
>
  <input
    class="ddc__sync-input"
    type="checkbox"
    role="switch"
    :checked="syncViewports"
    @change="onSyncToggle(($event.target as HTMLInputElement).checked)"
  />
  <span class="ddc__sync-label">{{ t('models.compareSyncViewports') }}</span>
</label>
```

- [ ] **Step 4: Styles**

Append (match existing topbar density):

```css
.ddc__sync {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}
.ddc__sync-input {
  width: 34px;
  height: 18px;
  appearance: none;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ddc__sync-input::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--border);
  transition: transform 0.15s ease;
}
.ddc__sync-input:checked {
  background: var(--primary);
  border-color: var(--primary);
}
.ddc__sync-input:checked::after {
  transform: translateX(16px);
  box-shadow: none;
}
.ddc__sync-label {
  white-space: nowrap;
}
```

If `.ddc__topbar` is not `display: flex`, ensure toggle still sits on the right (`margin-left: auto` works when topbar is flex — verify existing `.ddc__topbar` rules; it should already be flex from prior work).

- [ ] **Step 5: Run unit tests — expect pass**

```bash
npx vitest run src/features/models/components/DualDiagramCompareView.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  src/features/models/components/DualDiagramCompareView.vue \
  src/i18n/locales/models.ts
git commit -m "$(cat <<'EOF'
feat: sync pan/zoom between compare diagram canvases

EOF
)"
```

---

### Task 5: Verify

- [ ] **Step 1: Unit tests**

```bash
npx vitest run src/features/models/components/DualDiagramCompareView.test.ts
```

Expected: PASS.

- [ ] **Step 2: Manual smoke (dev server)**

```bash
npm run dev
```

1. Open model or diagram versions compare.
2. Sync ON by default → pan/zoom left moves right.
3. Turn OFF → independent.
4. Pan right, turn ON → left snaps to right.
5. Reload → toggle state restored.
6. Change diagram/versions → both fit, then aligned when sync ON.

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-07-30-compare-viewport-sync-design.md` set:

```md
Status: implemented (feat/compare-viewport-sync)
```

```bash
git add docs/superpowers/specs/2026-07-30-compare-viewport-sync-design.md
git commit -m "$(cat <<'EOF'
docs: mark compare viewport sync spec implemented

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Toggle in topbar right | Task 4 |
| Default ON | Task 4 (`loadString(..., '1')`) |
| Persist localStorage | Task 2 tests + Task 4 |
| Sync zoom/offset via viewport | Task 3 + Task 4 |
| Snap on re-enable to last active | Task 2 + Task 4 |
| Snap right←left after fitToView | Task 4 `centerBothCanvases` |
| Missing canvas no-op | Task 4 guards |
| i18n ru/en | Task 4 |
| Unit tests | Task 2 + Task 5 |
| No papirus changes | — |

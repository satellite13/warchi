# Model Compare Diagram Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На `/models/:id/compare` заменить native select поля «Диаграмма» на существующий `SearchableSelect` с фильтром по вхождению в имя.

**Architecture:** Только UI wiring в `ModelVisualCompareView.vue`: computed `diagramOptions` из `diagramNames`, `v-model` остаётся на `diagramName`. Логика загрузки диаграмм / canvas не меняется.

**Tech Stack:** Vue 3 + TypeScript, `SearchableSelect`, Vitest (лёгкий mount-тест).

**Spec:** `docs/superpowers/specs/2026-07-27-model-compare-diagram-search-design.md`

**Branch:** `feat/model-compare-diagram-search` (от `master`).

---

## File map

| File | Responsibility |
|------|----------------|
| Modify `src/views/ModelVisualCompareView.vue` | Import SearchableSelect; `diagramOptions`; replace select; compact CSS |
| Create `src/views/ModelVisualCompareView.test.ts` | Mount stub: SearchableSelect receives options from diagram names |

---

### Task 1: Branch + failing mount test

**Files:**
- Create: `src/views/ModelVisualCompareView.test.ts`

- [ ] **Step 1: Create branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/model-compare-diagram-search
```

- [ ] **Step 2: Write failing test**

Stub heavy deps; assert `#topbar-extra` uses SearchableSelect (or that component is imported and options prop maps names). Prefer asserting on stub props:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ModelVisualCompareView from './ModelVisualCompareView.vue'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'model-1' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/api/loadCompareSharedData', () => ({
  loadCompareSharedData: vi.fn(async () => ({ notations: [], components: [], relations: [] })),
}))

const searchableSelectStub = defineComponent({
  name: 'SearchableSelect',
  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () =>
      h('div', {
        'data-testid': 'diagram-searchable-select',
        'data-options-count': String((props.options as unknown[]).length),
      })
  },
})

const dualStub = defineComponent({
  name: 'DualDiagramCompareView',
  setup(_, { slots }) {
    return () =>
      h('div', { class: 'dual-stub' }, [
        slots['topbar-extra']?.(),
        slots['before-swap']?.(),
        slots['after-swap']?.(),
      ])
  },
})

describe('ModelVisualCompareView diagram select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SearchableSelect for diagram with options from diagram names', async () => {
    const { apiGet } = await import('@/composables/useApi')
    const apiGetMock = vi.mocked(apiGet)

    // related-versions
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.includes('/related-versions')) {
        return {
          success: true,
          data: {
            content: [
              { id: 'v-old', name: 'M', version: '1.0.0' },
              { id: 'v-new', name: 'M', version: '1.1.0' },
            ],
          },
        }
      }
      if (path.includes('/diagrams')) {
        return {
          success: true,
          data: {
            content: [
              { id: 'd1', name: 'Architecture Overview', version: '1.0.0' },
              { id: 'd2', name: 'Business Process', version: '1.0.0' },
            ],
          },
        }
      }
      // nodes/links/types — empty ok
      return { success: true, data: { content: [] } }
    })

    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: {
          common: { search: 'Search...', nothingFound: 'Nothing found' },
          models: {
            compareVersionLeft: 'Left',
            compareVersionRight: 'Right',
            compareDiagramName: 'Diagram',
            compareSelectVersion: 'Select version',
          },
        },
      },
    })

    const wrapper = mount(ModelVisualCompareView, {
      global: {
        plugins: [i18n],
        stubs: {
          DualDiagramCompareView: dualStub,
          SearchableSelect: searchableSelectStub,
        },
      },
    })

    await flushPromises()
    await nextTick()

    const select = wrapper.find('[data-testid="diagram-searchable-select"]')
    expect(select.exists()).toBe(true)
    // Unique names from both sides may duplicate; at least Architecture + Business
    expect(Number(select.attributes('data-options-count'))).toBeGreaterThanOrEqual(2)
  })
})
```

Adapt mocks if `apiGet` typing / `paginatedContent` shape differs — inspect existing compare tests or `paginatedResponse` helpers. If related-versions response shape needs `page` fields, match what `paginatedContent` expects.

- [ ] **Step 3: Run — expect FAIL** (SearchableSelect not wired yet, or stub not found)

```bash
npx vitest run src/views/ModelVisualCompareView.test.ts
```

Expected: FAIL (no searchable select in topbar / options count 0 / stub missing from render).

---

### Task 2: Wire SearchableSelect

**Files:**
- Modify: `src/views/ModelVisualCompareView.vue`

- [ ] **Step 1: Import + computed options**

```ts
import SearchableSelect from '@/components/forms/SearchableSelect.vue'

const diagramOptions = computed(() =>
  diagramNames.value.map(name => ({ id: name, label: name }))
)
```

Place `diagramOptions` after existing `diagramNames` computed.

- [ ] **Step 2: Replace template select in `#topbar-extra`**

```vue
<template #topbar-extra>
  <div class="ddc-pick">
    <span class="ddc-pick__label">{{ t('models.compareDiagramName') }}</span>
    <SearchableSelect
      v-model="diagramName"
      class="ddc-pick__searchable"
      :options="diagramOptions"
      :disabled="loading"
      :placeholder="t('models.compareDiagramName')"
      :search-placeholder="t('common.search')"
      :empty-text="t('common.nothingFound')"
    />
  </div>
</template>
```

Leave `#before-swap` / `#after-swap` native `<select>` unchanged.

- [ ] **Step 3: Compact styles in the same SFC** (unscoped sibling block is fine, or scoped + `:deep`)

Add after template (scoped or unscoped — prefer unscoped next to existing `.ddc-pick` pattern, or scoped with `:deep`):

```vue
<style scoped>
.ddc-pick__searchable {
  min-width: 220px;
}
.ddc-pick__searchable :deep(.searchable-select__control) {
  height: 32px;
  min-height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  font-size: 13px;
  font-weight: 500;
}
.ddc-pick__searchable :deep(.searchable-select__control:hover) {
  border-color: var(--border-strong);
}
.ddc-pick__searchable :deep(.searchable-select__control:focus-within) {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
</style>
```

Tune if control class names differ — inspect `SearchableSelect.vue` for exact BEM classes.

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/views/ModelVisualCompareView.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/views/ModelVisualCompareView.vue src/views/ModelVisualCompareView.test.ts
git commit -m "$(cat <<'EOF'
feat(models): searchable diagram select on model compare

EOF
)"
```

---

### Task 3: Spec status + smoke

- [ ] **Step 1:** In design spec set `Status: implemented (feat/model-compare-diagram-search)`

- [ ] **Step 2:** Manual smoke on local app: open `/models/<id>/compare`, type substring in Diagram field, select match, canvases update.

- [ ] **Step 3:** Commit docs if changed

```bash
git add docs/superpowers/specs/2026-07-27-model-compare-diagram-search-design.md \
  docs/superpowers/plans/2026-07-27-model-compare-diagram-search.md
git commit -m "$(cat <<'EOF'
docs: mark model-compare diagram search as implemented

EOF
)"
```

---

## Spec coverage

| Requirement | Task |
|-------------|------|
| SearchableSelect on diagram field only | Task 2 |
| Filter by substring (built-in) | Task 2 (component) |
| Version selects unchanged | Task 2 |
| DiagramVersionsCompareView out of scope | — |
| i18n common.search / nothingFound | Task 2 |

## Self-review notes

- No new component; reuse `SearchableSelect`.
- `diagramName` remains the source of truth (string name).
- Test mocks API; if flaky due to paginated shape, simplify to set `diagramName`/`leftData` via exposing internals only if needed — prefer matching real `apiGet` responses used by the view.

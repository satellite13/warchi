# Copy relation rules from component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the notation editor, copy outbound relation rules from one component onto another (self-remap, merge or replace), via a modal on the link-rules section.

**Architecture:** Pure `copyRelationRulesFromComponent` mutates `EditorRelationRule[]` in place. `RelationRulesSection` opens `CopyRelationRulesModal` (BaseModal + SearchableSelect + merge/replace radios); on confirm it calls `onMutateRelationRules`. Persistence stays on existing notation Save / relation-rules sync. No backend changes.

**Tech Stack:** Vue 3 + TypeScript + Vitest + vue-i18n (warchi only)

**Spec:** `docs/superpowers/specs/2026-07-24-copy-relation-rules-design.md`

**Branch:** `feat/copy-relation-rules` in **warchi** only

---

## File map

### Create

| File | Responsibility |
|------|----------------|
| `src/features/notations/utils/copyRelationRules.ts` | Pure copy algorithm (`merge` / `replace`) |
| `src/features/notations/utils/copyRelationRules.test.ts` | Unit tests for the algorithm |
| `src/features/notations/components/CopyRelationRulesModal.vue` | Modal: source select + mode radios |

### Modify

| File | Change |
|------|--------|
| `src/features/notations/components/RelationRulesSection.vue` | Copy button, open modal, apply helper |
| `src/i18n/locales/diagram.ts` | ru/en strings under `diagram.*` |

---

### Task 1: Feature branch

**Files:** warchi git only

- [ ] **Step 1: Create and checkout branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git checkout master
git checkout -b feat/copy-relation-rules
```

Expected: on `feat/copy-relation-rules`.

- [ ] **Step 2: Commit is N/A** (branch only)

---

### Task 2: Pure helper — failing tests first

**Files:**
- Create: `src/features/notations/utils/copyRelationRules.test.ts`
- Create: `src/features/notations/utils/copyRelationRules.ts` (stub only in this task)

- [ ] **Step 1: Write failing tests**

```ts
// src/features/notations/utils/copyRelationRules.test.ts
import { describe, it, expect } from 'vitest'
import type { EditorRelationRule } from '../types'
import { copyRelationRulesFromComponent } from './copyRelationRules'

const rule = (
  partial: Partial<EditorRelationRule> &
    Pick<EditorRelationRule, 'id' | 'fromComponentId' | 'toComponentId' | 'allowedRelationIds'>,
): EditorRelationRule => ({ ...partial })

describe('copyRelationRulesFromComponent', () => {
  it('returns changed:false and does not mutate when source has no outbound rules', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'B', toComponentId: 'C', allowedRelationIds: ['r1'] }),
    ]
    const before = structuredClone(rules)
    const result = copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new')
    expect(result).toEqual({ changed: false })
    expect(rules).toEqual(before)
  })

  it('remaps self-target A→A to B→B', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'A', toComponentId: 'A', allowedRelationIds: ['r1', 'r2'] }),
    ]
    const result = copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(result).toEqual({ changed: true })
    expect(rules).toContainEqual(
      expect.objectContaining({
        id: 'new-1',
        fromComponentId: 'B',
        toComponentId: 'B',
        allowedRelationIds: ['r1', 'r2'],
        _isNew: true,
      }),
    )
  })

  it('preserves non-self target A→C as B→C', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r1'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(rules.find(r => r.id === 'new-1')).toMatchObject({
      fromComponentId: 'B',
      toComponentId: 'C',
      allowedRelationIds: ['r1'],
      _isNew: true,
    })
  })

  it('merge unions relation ids on existing target rule', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r2', 'r3'] }),
      rule({ id: 'tgt', fromComponentId: 'B', toComponentId: 'C', allowedRelationIds: ['r1', 'r2'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    const merged = rules.find(r => r.id === 'tgt')
    expect(merged?.allowedRelationIds).toEqual(['r1', 'r2', 'r3'])
    expect(merged?._isDirty).toBe(true)
    expect(rules.some(r => r.id === 'new-1')).toBe(false)
  })

  it('merge marks dirty only when not _isNew', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r2'] }),
      rule({
        id: 'tgt',
        fromComponentId: 'B',
        toComponentId: 'C',
        allowedRelationIds: ['r1'],
        _isNew: true,
      }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    const merged = rules.find(r => r.id === 'tgt')
    expect(merged?.allowedRelationIds).toEqual(['r1', 'r2'])
    expect(merged?._isDirty).toBeUndefined()
  })

  it('replace soft-deletes existing outbound and adds copies', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r1'] }),
      rule({ id: 'old', fromComponentId: 'B', toComponentId: 'D', allowedRelationIds: ['r9'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'replace', () => 'new-1')
    const old = rules.find(r => r.id === 'old')
    expect(old?._isDeleted).toBe(true)
    expect(old?._isDirty).toBe(true)
    expect(rules.find(r => r.id === 'new-1')).toMatchObject({
      fromComponentId: 'B',
      toComponentId: 'C',
      allowedRelationIds: ['r1'],
      _isNew: true,
    })
  })

  it('replace splices out _isNew outbound instead of soft-delete', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r1'] }),
      rule({
        id: 'draft',
        fromComponentId: 'B',
        toComponentId: 'D',
        allowedRelationIds: ['r9'],
        _isNew: true,
      }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'replace', () => 'new-1')
    expect(rules.some(r => r.id === 'draft')).toBe(false)
  })

  it('ignores deleted source rules', () => {
    const rules: EditorRelationRule[] = [
      rule({
        id: 'gone',
        fromComponentId: 'A',
        toComponentId: 'C',
        allowedRelationIds: ['r1'],
        _isDeleted: true,
      }),
    ]
    const result = copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(result).toEqual({ changed: false })
  })

  it('dedupes multiple source rows to the same remapped to', () => {
    let n = 0
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'A', toComponentId: 'A', allowedRelationIds: ['r1'] }),
      rule({ id: '2', fromComponentId: 'A', toComponentId: 'A', allowedRelationIds: ['r2'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => `new-${++n}`)
    const created = rules.filter(r => r.fromComponentId === 'B' && !r._isDeleted)
    expect(created).toHaveLength(1)
    expect(created[0]?.toComponentId).toBe('B')
    expect(created[0]?.allowedRelationIds).toEqual(['r1', 'r2'])
  })

  it('does not copy inbound rules X→A', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'in', fromComponentId: 'X', toComponentId: 'A', allowedRelationIds: ['r1'] }),
      rule({ id: 'out', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r2'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(rules.some(r => r.fromComponentId === 'X' && r.toComponentId === 'B')).toBe(false)
    expect(rules.find(r => r.id === 'new-1')).toMatchObject({
      fromComponentId: 'B',
      toComponentId: 'C',
    })
  })
})
```

- [ ] **Step 2: Add stub export so tests compile and fail**

```ts
// src/features/notations/utils/copyRelationRules.ts
import type { EditorRelationRule } from '../types'

export type CopyRelationRulesMode = 'merge' | 'replace'

export function copyRelationRulesFromComponent(
  _rules: EditorRelationRule[],
  _sourceComponentId: string,
  _targetComponentId: string,
  _mode: CopyRelationRulesMode,
  _createId: () => string,
): { changed: boolean } {
  throw new Error('not implemented')
}
```

- [ ] **Step 3: Run tests — expect fail**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/notations/utils/copyRelationRules.test.ts
```

Expected: FAIL (`not implemented` or assertion failures).

- [ ] **Step 4: Commit**

```bash
git add src/features/notations/utils/copyRelationRules.ts src/features/notations/utils/copyRelationRules.test.ts
git commit -m "$(cat <<'EOF'
test: add failing tests for copyRelationRulesFromComponent.

EOF
)"
```

---

### Task 3: Implement copyRelationRulesFromComponent

**Files:**
- Modify: `src/features/notations/utils/copyRelationRules.ts`

- [ ] **Step 1: Replace stub with full implementation**

```ts
// src/features/notations/utils/copyRelationRules.ts
import type { EditorRelationRule } from '../types'

export type CopyRelationRulesMode = 'merge' | 'replace'

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids))

export function copyRelationRulesFromComponent(
  rules: EditorRelationRule[],
  sourceComponentId: string,
  targetComponentId: string,
  mode: CopyRelationRulesMode,
  createId: () => string,
): { changed: boolean } {
  if (sourceComponentId === targetComponentId) {
    return { changed: false }
  }

  const sourceOutbound = rules.filter(
    r => r.fromComponentId === sourceComponentId && !r._isDeleted,
  )
  if (sourceOutbound.length === 0) {
    return { changed: false }
  }

  const candidatesByTo = new Map<string, string[]>()
  for (const src of sourceOutbound) {
    const toId =
      src.toComponentId === sourceComponentId ? targetComponentId : src.toComponentId
    const existing = candidatesByTo.get(toId) ?? []
    candidatesByTo.set(toId, uniqueIds([...existing, ...src.allowedRelationIds]))
  }

  if (mode === 'replace') {
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i]
      if (!r || r.fromComponentId !== targetComponentId || r._isDeleted) continue
      if (r._isNew) {
        rules.splice(i, 1)
      } else {
        r._isDeleted = true
        r._isDirty = true
      }
    }
    for (const [toId, relationIds] of candidatesByTo) {
      rules.push({
        id: createId(),
        fromComponentId: targetComponentId,
        toComponentId: toId,
        allowedRelationIds: relationIds,
        _isNew: true,
      })
    }
    return { changed: true }
  }

  // merge
  for (const [toId, relationIds] of candidatesByTo) {
    const existing = rules.find(
      r =>
        r.fromComponentId === targetComponentId &&
        r.toComponentId === toId &&
        !r._isDeleted,
    )
    if (existing) {
      const merged = uniqueIds([...existing.allowedRelationIds, ...relationIds])
      const same =
        merged.length === existing.allowedRelationIds.length &&
        merged.every(id => existing.allowedRelationIds.includes(id))
      if (!same) {
        existing.allowedRelationIds = merged
        if (!existing._isNew) existing._isDirty = true
      }
    } else {
      rules.push({
        id: createId(),
        fromComponentId: targetComponentId,
        toComponentId: toId,
        allowedRelationIds: relationIds,
        _isNew: true,
      })
    }
  }

  return { changed: true }
}
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npx vitest run src/features/notations/utils/copyRelationRules.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/notations/utils/copyRelationRules.ts
git commit -m "$(cat <<'EOF'
feat: implement copyRelationRulesFromComponent merge/replace.

EOF
)"
```

---

### Task 4: i18n strings

**Files:**
- Modify: `src/i18n/locales/diagram.ts`

- [ ] **Step 1: Add keys next to existing `addLinkRule` / `noRules` in both `ru` and `en`**

Russian (`ru.diagram`):

```ts
copyLinkRules: 'Скопировать правила с…',
copyLinkRulesTitle: 'Скопировать правила связей',
copyLinkRulesSource: 'Источник',
copyLinkRulesMerge: 'Объединить с текущими',
copyLinkRulesReplace: 'Заменить все исходящие',
copyLinkRulesConfirm: 'Скопировать',
copyLinkRulesEmpty: 'У выбранного компонента нет исходящих правил связей.',
copyLinkRulesSelectSource: 'Выберите компонент',
```

English (`en.diagram`):

```ts
copyLinkRules: 'Copy rules from…',
copyLinkRulesTitle: 'Copy link rules',
copyLinkRulesSource: 'Source',
copyLinkRulesMerge: 'Merge with current',
copyLinkRulesReplace: 'Replace all outbound',
copyLinkRulesConfirm: 'Copy',
copyLinkRulesEmpty: 'The selected component has no outbound link rules.',
copyLinkRulesSelectSource: 'Select a component',
```

Place them immediately after `noRules` in each locale block so they stay with the link-rules group.

- [ ] **Step 2: Commit**

```bash
git add src/i18n/locales/diagram.ts
git commit -m "$(cat <<'EOF'
i18n: add copy link rules strings (ru/en).

EOF
)"
```

---

### Task 5: CopyRelationRulesModal

**Files:**
- Create: `src/features/notations/components/CopyRelationRulesModal.vue`

- [ ] **Step 1: Create modal component**

Follow `TypeSelectSection.vue` BaseModal pattern. Props: `componentOptions` (`{ id, label }[]`), optional `componentIconMap` (`Map<string, string>`), `buildIconUrl`. Emit `close` and `confirm` with `{ sourceComponentId, mode }`.

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import type { CopyRelationRulesMode } from '../utils/copyRelationRules'

const props = defineProps<{
  componentOptions: Array<{ id: string; label: string }>
  componentIconMap?: Map<string, string>
  buildIconUrl?: (iconName: string) => string
}>()

const emit = defineEmits<{
  close: []
  confirm: [payload: { sourceComponentId: string; mode: CopyRelationRulesMode }]
}>()

const { t } = useI18n()

const sourceComponentId = ref('')
const mode = ref<CopyRelationRulesMode>('merge')
const error = ref('')

watch(
  () => props.componentOptions,
  options => {
    if (!options.some(o => o.id === sourceComponentId.value)) {
      sourceComponentId.value = options[0]?.id ?? ''
    }
  },
  { immediate: true },
)

const canConfirm = computed(() => Boolean(sourceComponentId.value))

const submit = () => {
  error.value = ''
  if (!sourceComponentId.value) {
    error.value = t('diagram.copyLinkRulesSelectSource')
    return
  }
  emit('confirm', { sourceComponentId: sourceComponentId.value, mode: mode.value })
}

const iconFor = (id: string): string | undefined => props.componentIconMap?.get(id)
</script>

<template>
  <BaseModal :title="t('diagram.copyLinkRulesTitle')" max-width="440px" @close="emit('close')">
    <div class="copy-rules-modal">
      <label class="copy-rules-modal__label">{{ t('diagram.copyLinkRulesSource') }}</label>
      <SearchableSelect
        :model-value="sourceComponentId"
        :options="componentOptions"
        :placeholder="t('diagram.selectComponent')"
        :search-placeholder="t('diagram.searchComponent')"
        :empty-text="t('common.nothingFound')"
        @update:model-value="sourceComponentId = $event"
      >
        <template #selected="{ option }">
          <span class="copy-rules-modal__icon-option">
            <img
              v-if="iconFor(option.id) && buildIconUrl"
              class="copy-rules-modal__icon"
              :src="buildIconUrl(iconFor(option.id)!)"
              :alt="option.label"
            />
            {{ option.label }}
          </span>
        </template>
        <template #option="{ option }">
          <span class="copy-rules-modal__icon-option">
            <img
              v-if="iconFor(option.id) && buildIconUrl"
              class="copy-rules-modal__icon"
              :src="buildIconUrl(iconFor(option.id)!)"
              :alt="option.label"
            />
            {{ option.label }}
          </span>
        </template>
      </SearchableSelect>

      <fieldset class="copy-rules-modal__modes">
        <label class="copy-rules-modal__radio">
          <input v-model="mode" type="radio" value="merge" />
          {{ t('diagram.copyLinkRulesMerge') }}
        </label>
        <label class="copy-rules-modal__radio">
          <input v-model="mode" type="radio" value="replace" />
          {{ t('diagram.copyLinkRulesReplace') }}
        </label>
      </fieldset>

      <div v-if="error" class="copy-rules-modal__error">{{ error }}</div>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" :disabled="!canConfirm" @click="submit">
        {{ t('diagram.copyLinkRulesConfirm') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.copy-rules-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.copy-rules-modal__label {
  font-size: 12px;
  color: var(--text-muted);
}

.copy-rules-modal__modes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  border: none;
}

.copy-rules-modal__radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.copy-rules-modal__error {
  font-size: 12px;
  color: var(--danger);
}

.copy-rules-modal__icon-option {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-rules-modal__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}
</style>
```

Check that `diagram.selectComponent` already exists (used in `RelationRulesSection`). If missing, use `copyLinkRulesSelectSource` as placeholder instead.

- [ ] **Step 2: Commit**

```bash
git add src/features/notations/components/CopyRelationRulesModal.vue
git commit -m "$(cat <<'EOF'
feat: add CopyRelationRulesModal for notation editor.

EOF
)"
```

---

### Task 6: Wire RelationRulesSection

**Files:**
- Modify: `src/features/notations/components/RelationRulesSection.vue`

- [ ] **Step 1: Add imports, state, handlers**

At top of `<script setup>` add:

```ts
import CopyRelationRulesModal from './CopyRelationRulesModal.vue'
import { copyRelationRulesFromComponent } from '../utils/copyRelationRules'
import type { CopyRelationRulesMode } from '../utils/copyRelationRules'
```

Add refs and helpers (near other refs):

```ts
const showCopyModal = ref(false)
const copyError = ref('')

const copySourceOptions = computed(() =>
  componentOptions.value.filter(o => o.id !== props.selectedItem?.id),
)

const openCopyModal = () => {
  copyError.value = ''
  showCopyModal.value = true
}

const closeCopyModal = () => {
  showCopyModal.value = false
  copyError.value = ''
}

const applyCopyFrom = (payload: {
  sourceComponentId: string
  mode: CopyRelationRulesMode
}) => {
  if (!props.selectedItem || 'linkTypeId' in props.selectedItem) return
  const targetId = props.selectedItem.id
  let changed = false
  props.onMutateRelationRules?.(rules => {
    const result = copyRelationRulesFromComponent(
      rules,
      payload.sourceComponentId,
      targetId,
      payload.mode,
      createId,
    )
    changed = result.changed
  })
  if (!changed) {
    copyError.value = t('diagram.copyLinkRulesEmpty')
    return
  }
  closeCopyModal()
  relationRulesExpanded.value = true
}
```

- [ ] **Step 2: Add copy button in header-extra next to +**

Replace the single `+` button block with a flex group:

```vue
<template #header-extra>
  <div class="rules-section__header-actions">
    <button
      type="button"
      class="link-btn link-btn--icon"
      :title="t('diagram.copyLinkRules')"
      :aria-label="t('diagram.copyLinkRules')"
      :disabled="copySourceOptions.length === 0"
      @click.stop="openCopyModal"
    >
      <UiIcon name="content_copy" />
    </button>
    <button
      type="button"
      class="link-btn link-btn--icon"
      :title="t('diagram.addLinkRule')"
      :aria-label="t('diagram.addLinkRule')"
      @click.stop="addRelationRule"
    >
      <UiIcon name="add" />
    </button>
  </div>
</template>
```

- [ ] **Step 3: Mount modal + show empty error inside section if needed**

After `</CollapseSection>`, still inside root fragment / wrapper:

```vue
<CopyRelationRulesModal
  v-if="showCopyModal"
  :component-options="copySourceOptions"
  :component-icon-map="componentIconMap"
  :build-icon-url="buildIconUrl"
  @close="closeCopyModal"
  @confirm="applyCopyFrom"
/>
```

If `copyError` is set while modal is open, either:
- pass it into the modal as an optional `externalError` prop, **or**
- set modal-local error by having `applyCopyFrom` keep the modal open and add optional prop `error` on the modal.

Preferred: add optional prop `error?: string` to `CopyRelationRulesModal` and bind `:error="copyError"`, clear on source/mode change via watch in the modal. Update Task 5 modal to accept:

```ts
error?: string
```

and display `error || localError` in the error div. When opening copy again, clear `copyError`.

- [ ] **Step 4: CSS for header actions**

```css
.rules-section__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.link-btn--icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Manual sanity check (dev)**

```bash
npm run dev
```

1. Open a notation with ≥2 components that have rules.
2. Select target component → Правила связей → content_copy.
3. Pick source, merge → rules appear; Save still works.
4. Repeat with replace; confirm old outbound marked deleted after save sync.
5. Pick source with no outbound rules → empty message, no mutation.

- [ ] **Step 6: Run unit tests again**

```bash
npx vitest run src/features/notations/utils/copyRelationRules.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/notations/components/RelationRulesSection.vue src/features/notations/components/CopyRelationRulesModal.vue
git commit -m "$(cat <<'EOF'
feat: wire copy-from component link rules in notation editor.

EOF
)"
```

---

### Task 7: Final verification

**Files:** none (verify only)

- [ ] **Step 1: Typecheck / lint touched files**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vue-tsc --noEmit
npx eslint src/features/notations/utils/copyRelationRules.ts src/features/notations/utils/copyRelationRules.test.ts src/features/notations/components/CopyRelationRulesModal.vue src/features/notations/components/RelationRulesSection.vue src/i18n/locales/diagram.ts
```

Expected: no errors related to these files.

- [ ] **Step 2: Confirm branch commits**

```bash
git log --oneline master..HEAD
```

Expected: commits for tests, helper, i18n, modal, wiring (and this plan if committed).

- [ ] **Step 3: Commit is N/A** unless eslint/vue-tsc required tiny fixes — then commit those fixes separately.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Outbound-only copy | Task 2–3 |
| Self remap | Task 2–3 |
| Merge / replace dialog | Task 5–6 |
| SearchableSelect source | Task 5 |
| Empty source message | Task 4, 6 |
| Editor dirty flags / Save path | Task 3, 6 |
| No backend / no cross / no inbound | Out of scope (tests assert inbound ignored) |
| i18n ru/en | Task 4 |
| Unit tests listed in spec | Task 2 |

## Out of scope (do not implement)

- Automatic Event ↔ Event B cross rules
- Inbound rule mirroring
- ArchiMate data migration / API
- Rule preview list in modal

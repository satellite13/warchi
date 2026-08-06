<script setup lang="ts">
import { computed, ref } from 'vue'
import { DROPDOWN_SEARCH_BLOCK_PX } from '@/utils/dropdownPanelPosition'
import { useDropdownPanel } from '@/composables/useDropdownPanel'

export type MultiSelectOption = { id: string; label: string }

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    options: MultiSelectOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    disabled?: boolean
    maxVisibleLabels?: number
    /** Always show the search field (default: when options.length > 5). */
    forceSearch?: boolean
  }>(),
  {
    placeholder: '',
    searchPlaceholder: '',
    emptyText: '',
    maxVisibleLabels: 2,
    forceSearch: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const controlRef = ref<HTMLDivElement | null>(null)

const showSearch = computed(
  () => props.forceSearch || props.options.length > 5
)

const {
  isOpen,
  searchQuery,
  panelPlacement,
  toggle,
} = useDropdownPanel(controlRef, searchInputRef, {
  panelClass: 'multi-select-panel',
  rootClass: 'multi-select',
  headerBlockPx: props.forceSearch || props.options.length > 5 ? DROPDOWN_SEARCH_BLOCK_PX : 6,
  preferredMaxListHeight: 160,
})

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options
  return props.options.filter(
    o => o.label.toLowerCase().includes(query) || o.id.toLowerCase().includes(query)
  )
})

const selectedSet = computed(() => new Set(props.modelValue))

const displayLabel = computed(() => {
  if (props.modelValue.length === 0) return props.placeholder
  const labels = props.modelValue
    .map(id => props.options.find(o => o.id === id)?.label)
    .filter(Boolean) as string[]
  if (labels.length === 0) return props.placeholder
  const visible = labels.slice(0, props.maxVisibleLabels)
  const rest = labels.length - visible.length
  return rest > 0 ? `${visible.join(', ')}, +${rest}` : visible.join(', ')
})

const toggleOption = (id: string) => {
  const next = new Set(props.modelValue)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  emit('update:modelValue', Array.from(next))
}
</script>

<template>
  <div class="multi-select" :class="{ 'multi-select--disabled': disabled }">
    <div ref="controlRef" class="multi-select__control" @click.stop="toggle(disabled)">
      <span
        class="multi-select__value"
        :class="{ 'multi-select__value--placeholder': modelValue.length === 0 }"
      >
        {{ displayLabel }}
      </span>
      <UiIcon :name="isOpen ? 'expand_less' : 'expand_more'" class="multi-select__arrow" />
    </div>
    <Teleport to="body">
      <div
        v-if="isOpen && panelPlacement"
        class="multi-select-panel multi-select__panel"
        :style="{
          ...(panelPlacement.top !== undefined ? { top: `${panelPlacement.top}px` } : {}),
          ...(panelPlacement.bottom !== undefined ? { bottom: `${panelPlacement.bottom}px` } : {}),
          left: `${panelPlacement.left}px`,
          width: `${panelPlacement.width}px`,
          maxHeight: `${panelPlacement.maxPanelHeight}px`,
        }"
      >
        <input
          v-if="showSearch"
          ref="searchInputRef"
          v-model="searchQuery"
          class="multi-select__search"
          type="text"
          :placeholder="searchPlaceholder"
          @click.stop
        >
        <div
          class="multi-select__list"
          :style="{ maxHeight: `${panelPlacement.maxListHeight}px` }"
        >
          <button
            v-for="option in filteredOptions"
            :key="option.id"
            type="button"
            class="multi-select__item"
            :class="{ 'multi-select__item--active': selectedSet.has(option.id) }"
            @click.stop="toggleOption(option.id)"
          >
            <span class="multi-select__check">
              <UiIcon v-if="selectedSet.has(option.id)" name="check" />
            </span>
            <span class="multi-select__item-label">{{ option.label }}</span>
          </button>
          <div v-if="filteredOptions.length === 0" class="multi-select__empty">
            {{ emptyText || '—' }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.multi-select {
  position: relative;
  flex: 1;
  min-width: 0;
}

.multi-select--disabled {
  opacity: 0.55;
  pointer-events: none;
}

.multi-select__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  transition: border-color 0.15s ease;
  min-height: 24px;
}

.multi-select__control:hover {
  border-color: var(--primary);
}

.multi-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-select__value--placeholder {
  color: var(--text-subtle);
}

.multi-select__arrow {
  font-size: 16px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.multi-select__panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  z-index: 10000;
  overflow: hidden;
  box-sizing: border-box;
}

.multi-select__search {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  border: none;
  border-bottom: 1px solid var(--border);
  outline: none;
  background: var(--surface);
  color: var(--base-text);
  box-sizing: border-box;
}

.multi-select__search::placeholder {
  color: var(--text-subtle);
}

.multi-select__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 3px;
}

.multi-select__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  font-size: 12px;
  font-family: inherit;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--base-text);
  cursor: pointer;
  transition: background 0.12s ease;
}

.multi-select__item:hover {
  background: var(--surface-strong);
}

.multi-select__item--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.multi-select__item--active:hover {
  background: var(--primary-soft);
}

.multi-select__check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 3px;
  border: 1px solid var(--border);
  background: var(--surface);
  transition: all 0.12s ease;
}

.multi-select__item--active .multi-select__check {
  border-color: var(--primary);
  background: var(--primary);
  color: white;
}

.multi-select__check .ui-icon {
  font-size: 12px;
  font-weight: 600;
}

.multi-select__item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-select__empty {
  padding: 8px 6px;
  font-size: 12px;
  color: var(--text-subtle);
  text-align: center;
}
</style>

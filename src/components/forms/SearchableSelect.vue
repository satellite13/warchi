<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'

export type SelectOption = { id: string; label: string }

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    disabled?: boolean
    allowEmpty?: boolean
    emptyLabel?: string
  }>(),
  {
    placeholder: '',
    searchPlaceholder: '',
    emptyText: '',
    emptyLabel: '',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

defineSlots<{
  option?(props: { option: SelectOption; active: boolean }): unknown
  selected?(props: { option: SelectOption }): unknown
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const controlRef = ref<HTMLDivElement | null>(null)
const panelPosition = ref({ top: 0, left: 0, width: 0 })

function updatePanelPosition(): void {
  if (!controlRef.value) return
  const rect = controlRef.value.getBoundingClientRect()
  panelPosition.value = {
    top: rect.bottom + 4,
    left: rect.left,
    width: rect.width,
  }
}

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options
  return props.options.filter(o => o.label.toLowerCase().includes(query))
})

const selectedOption = computed(() =>
  props.modelValue ? (props.options.find(o => o.id === props.modelValue) ?? null) : null
)

const displayLabel = computed(() => {
  if (!props.modelValue) return props.placeholder
  if (props.allowEmpty && !props.modelValue) return props.emptyLabel || props.placeholder
  return selectedOption.value?.label ?? props.placeholder
})

const toggle = () => {
  if (props.disabled) return
  if (isOpen.value) {
    isOpen.value = false
  } else {
    isOpen.value = true
    searchQuery.value = ''
    nextTick(() => {
      updatePanelPosition()
      searchInputRef.value?.focus()
    })
  }
}

const selectOption = (id: string) => {
  emit('update:modelValue', id)
  isOpen.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  if (!isOpen.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.searchable-select') && !target.closest('.searchable-select-panel')) {
    isOpen.value = false
  }
}

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('scroll', updatePanelPosition, true)
    window.addEventListener('resize', updatePanelPosition)
  } else {
    window.removeEventListener('scroll', updatePanelPosition, true)
    window.removeEventListener('resize', updatePanelPosition)
  }
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', updatePanelPosition, true)
  window.removeEventListener('resize', updatePanelPosition)
})
</script>

<template>
  <div class="searchable-select" :class="{ 'searchable-select--disabled': disabled }">
    <div ref="controlRef" class="searchable-select__control" @click.stop="toggle">
      <span class="searchable-select__value">
        <slot v-if="selectedOption" name="selected" :option="selectedOption">
          {{ displayLabel }}
        </slot>
        <template v-else>{{ displayLabel }}</template>
      </span>
      <span class="material-symbols-outlined searchable-select__arrow">
        {{ isOpen ? 'expand_less' : 'expand_more' }}
      </span>
    </div>
    <Teleport to="body">
      <div
        v-if="isOpen"
        class="searchable-select-panel searchable-select__panel"
        :style="{
          top: `${panelPosition.top}px`,
          left: `${panelPosition.left}px`,
          width: `${panelPosition.width}px`,
        }"
      >
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="searchable-select__search"
          type="text"
          :placeholder="searchPlaceholder"
          @click.stop
        >
        <div class="searchable-select__list">
          <button
            v-if="allowEmpty"
            type="button"
            class="searchable-select__item"
            :class="{ 'searchable-select__item--active': !modelValue }"
            @click.stop="selectOption('')"
          >
            {{ emptyLabel || '—' }}
          </button>
          <button
            v-for="option in filteredOptions"
            :key="option.id"
            type="button"
            class="searchable-select__item"
            :class="{ 'searchable-select__item--active': modelValue === option.id }"
            @click.stop="selectOption(option.id)"
          >
            <slot name="option" :option="option" :active="modelValue === option.id">
              {{ option.label }}
            </slot>
          </button>
          <div v-if="filteredOptions.length === 0" class="searchable-select__empty">
            {{ emptyText || '—' }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.searchable-select {
  position: relative;
  flex: 1;
  min-width: 0;
}

.searchable-select--disabled {
  opacity: 0.55;
  pointer-events: none;
}

.searchable-select__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.searchable-select__control:hover {
  border-color: var(--primary);
}

.searchable-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.searchable-select__arrow {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.searchable-select__panel {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  z-index: 10000;
  overflow: hidden;
}

.searchable-select__search {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  border: none;
  border-bottom: 1px solid var(--border);
  outline: none;
  background: var(--surface);
  color: var(--base-text);
  box-sizing: border-box;
}

.searchable-select__search::placeholder {
  color: var(--text-subtle);
}

.searchable-select__list {
  max-height: 180px;
  overflow-y: auto;
  padding: 4px;
}

.searchable-select__item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--base-text);
  cursor: pointer;
  transition: background 0.12s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.searchable-select__item:hover {
  background: var(--surface-strong);
}

.searchable-select__item--active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 500;
}

.searchable-select__item--active:hover {
  background: var(--primary-soft);
}

.searchable-select__empty {
  padding: 10px 8px;
  font-size: 13px;
  color: var(--text-subtle);
  text-align: center;
}
</style>

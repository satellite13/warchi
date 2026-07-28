<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'

const searchQuery = defineModel<string>('searchQuery', { default: '' })

withDefaults(
  defineProps<{
    title: string
    count?: number
    isLoading?: boolean
    searchPlaceholder?: string
  }>(),
  {
    count: 0,
    isLoading: false,
    searchPlaceholder: '',
  },
)

const { t } = useI18n()

function clearSearch(): void {
  searchQuery.value = ''
}
</script>

<template>
  <aside class="ess">
    <div class="ess__header">
      <div class="ess__title-row">
        <h3 class="ess__title">{{ title }}</h3>
        <span v-if="count > 0" class="ess__count">{{ count }}</span>
      </div>
      <div class="ess__actions">
        <slot name="actions" />
      </div>
    </div>

    <div class="ess__search">
      <div class="ess__search-wrap">
        <UiIcon name="search" class="ess__search-icon" />
        <input
          v-model="searchQuery"
          class="ess__search-input"
          type="text"
          :placeholder="searchPlaceholder || t('common.search')"
        >
        <button
          v-if="searchQuery"
          type="button"
          class="ess__clear-btn"
          :title="t('common.clearSearch')"
          @click="clearSearch"
        >
          <UiIcon name="close" />
        </button>
      </div>
    </div>

    <div class="ess__list">
      <div v-if="isLoading" class="ess__loading">
        <span class="ess__loading-dot" />
        {{ t('common.loading') }}
      </div>
      <slot v-else />
    </div>

    <slot name="footer" />
  </aside>
</template>

<style scoped>
.ess {
  width: 272px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.ess__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ess__title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ess__title {
  margin: 0;
  font-size: var(--heading-font-size, 14px);
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: var(--heading-letter-spacing, -0.01em);
}

.ess__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 9px;
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
}

.ess__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ess__search {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ess__search-wrap {
  position: relative;
  min-width: 0;
  flex: 1;
}

.ess__search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-subtle);
  pointer-events: none;
}

.ess__search-input {
  width: 100%;
  padding: 7px 10px 7px 34px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
  background: var(--surface-muted);
  color: var(--base-text);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.ess__search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.12);
}

.ess__search-input::placeholder {
  color: var(--text-subtle);
}

.ess__clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--text-subtle);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.ess__clear-btn .ui-icon {
  width: 14px;
  height: 14px;
}

.ess__clear-btn:hover {
  background: var(--border-strong);
  color: var(--base-text);
}

.ess__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px;
}

.ess__loading {
  padding: 12px 10px;
  font-size: 13px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.ess__loading-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: essPulse 1s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes essPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>

<!-- Shared classes for action buttons / empty rows placed in slots -->
<style>
.ess-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.ess-action-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.ess-action-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.ess-action-btn--active {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.ess-empty {
  padding: 12px 10px;
  font-size: 13px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

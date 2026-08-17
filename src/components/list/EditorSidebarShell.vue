<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SearchInput from '@/components/forms/SearchInput.vue'

const searchQuery = defineModel<string>('searchQuery', { default: '' })

withDefaults(
  defineProps<{
    title: string
    count?: number
    isLoading?: boolean
    searchPlaceholder?: string
    fill?: boolean
  }>(),
  {
    count: 0,
    isLoading: false,
    searchPlaceholder: '',
    fill: false,
  },
)

const { t } = useI18n()
</script>

<template>
  <aside class="ess" :class="{ 'ess--fill': fill }">
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
      <SearchInput
        v-model="searchQuery"
        compact
        :placeholder="searchPlaceholder || t('common.search')"
      />
      <slot name="search-extra" />
    </div>

    <slot name="below-search" />

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

.ess--fill {
  width: auto;
  flex: 1;
  height: 100%;
  border-right: none;
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
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ess__search :deep(.search-box) {
  flex: 1;
  min-width: 0;
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

<!-- Shared empty-row class for lists placed in the default slot -->
<style>
.ess-empty {
  padding: 12px 10px;
  font-size: 13px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

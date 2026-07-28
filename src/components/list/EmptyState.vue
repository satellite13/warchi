<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from '@/components/ui/UiIcon.vue'

const CATALOG_ICONS = new Set(['models', 'search', 'error'])

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    /** catalog presets: models|search|error; otherwise UiIcon name for panel/compact */
    icon?: string
    variant?: 'catalog' | 'panel' | 'compact' | 'inline'
  }>(),
  {
    description: '',
    icon: 'models',
    variant: 'catalog',
  },
)

const useCatalogSvg = computed(
  () => props.variant === 'catalog' && CATALOG_ICONS.has(props.icon || 'models'),
)

const catalogIcon = computed(() =>
  props.icon === 'search' || props.icon === 'error' ? props.icon : 'models',
)
</script>

<template>
  <div class="empty-state" :class="`empty-state--${variant}`">
    <slot name="icon">
      <template v-if="variant !== 'inline'">
        <svg
          v-if="useCatalogSvg && catalogIcon === 'models'"
          class="empty-state__icon empty-state__icon--svg"
          viewBox="0 0 120 120"
          fill="none"
        >
          <circle cx="60" cy="60" r="50" fill="rgba(124, 92, 252, 0.08)" />
          <path
            d="M40 75 L60 45 L80 75"
            stroke="#7c5cfc"
            stroke-width="4"
            stroke-linecap="round"
            fill="none"
          />
          <circle cx="60" cy="45" r="4" fill="#7c5cfc" />
          <circle cx="40" cy="75" r="4" fill="#7c5cfc" />
          <circle cx="80" cy="75" r="4" fill="#7c5cfc" />
          <path d="M35 85 h50" stroke="var(--border-strong)" stroke-width="2" stroke-linecap="round" />
        </svg>
        <svg
          v-else-if="useCatalogSvg && catalogIcon === 'search'"
          class="empty-state__icon empty-state__icon--svg"
          viewBox="0 0 120 120"
          fill="none"
        >
          <circle cx="60" cy="60" r="50" fill="rgba(124, 92, 252, 0.08)" />
          <circle cx="52" cy="52" r="20" stroke="#7c5cfc" stroke-width="4" fill="none" />
          <path d="M66 66 L80 80" stroke="#7c5cfc" stroke-width="4" stroke-linecap="round" />
        </svg>
        <svg
          v-else-if="useCatalogSvg && catalogIcon === 'error'"
          class="empty-state__icon empty-state__icon--svg"
          viewBox="0 0 120 120"
          fill="none"
        >
          <circle cx="60" cy="60" r="50" fill="rgba(239, 68, 68, 0.08)" />
          <circle cx="60" cy="60" r="30" stroke="#ef4444" stroke-width="4" fill="none" />
          <path
            d="M50 50 L70 70 M70 50 L50 70"
            stroke="#ef4444"
            stroke-width="4"
            stroke-linecap="round"
          />
        </svg>
        <UiIcon v-else :name="icon || 'info'" class="empty-state__icon empty-state__icon--ui" />
      </template>
    </slot>

    <p v-if="title" class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-state--catalog {
  padding: 48px 24px;
}

.empty-state--panel {
  height: 100%;
  min-height: 320px;
  gap: 8px;
  color: var(--text-subtle);
  animation: emptyFadeIn 0.4s ease;
}

.empty-state--compact {
  gap: 6px;
  padding: 28px 0;
  color: var(--text-subtle);
  font-size: 13px;
}

.empty-state--inline {
  padding: 12px 8px;
  color: var(--text-subtle);
  font-size: 13px;
}

@keyframes emptyFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.empty-state__icon--svg {
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
  opacity: 0.9;
}

.empty-state--panel .empty-state__icon--ui {
  width: 56px;
  height: 56px;
  opacity: 0.35;
  margin-bottom: 4px;
}

.empty-state--compact .empty-state__icon--ui {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.empty-state__title {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: var(--base-text);
  letter-spacing: -0.01em;
}

.empty-state--catalog .empty-state__title {
  margin-bottom: 8px;
}

.empty-state--panel .empty-state__title {
  font-size: 15px;
  color: var(--text-muted);
}

.empty-state--compact .empty-state__title,
.empty-state--inline .empty-state__title {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-subtle);
}

.empty-state__description {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.empty-state--panel .empty-state__description {
  font-size: 13px;
  color: var(--text-subtle);
}

.empty-state__actions {
  margin-top: 24px;
}

.empty-state--panel .empty-state__actions,
.empty-state--compact .empty-state__actions {
  margin-top: 12px;
}
</style>

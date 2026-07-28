<script setup lang="ts">
import { getGradient } from '@/utils/gradientColors'

withDefaults(
  defineProps<{
    id: string
    name: string
    version?: string
    meta?: string
    versionPrefix?: string
  }>(),
  {
    version: '',
    meta: '',
    versionPrefix: 'v',
  },
)

defineEmits<{
  click: []
}>()
</script>

<template>
  <button type="button" class="compact-entity-row" @click="$emit('click')">
    <div class="compact-entity-row__gradient" :style="{ background: getGradient(id) }" />
    <div class="compact-entity-row__body">
      <span class="compact-entity-row__name">{{ name }}</span>
      <span v-if="version" class="compact-entity-row__version">
        {{ versionPrefix }}{{ version }}
      </span>
    </div>
    <span v-if="meta" class="compact-entity-row__meta">{{ meta }}</span>
  </button>
</template>

<style scoped>
.compact-entity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: var(--surface-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
  font-family: inherit;
}

.compact-entity-row:hover {
  background: var(--surface-strong);
  border-color: var(--border);
  transform: translateX(2px);
}

.compact-entity-row__gradient {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.compact-entity-row__gradient::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.12) 100%);
}

.compact-entity-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.compact-entity-row__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-entity-row__version {
  font-size: 11px;
  color: var(--text-subtle);
  font-variant-numeric: tabular-nums;
}

.compact-entity-row__meta {
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>

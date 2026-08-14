<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

withDefaults(
  defineProps<{
    canvasMode?: boolean
    hideToolbar?: boolean
    version?: string
    backTitle: string
  }>(),
  {
    canvasMode: false,
    hideToolbar: false,
    version: '',
  },
)

const emit = defineEmits<{
  back: []
}>()
</script>

<template>
  <div v-if="canvasMode" class="deh-canvas">
    <slot name="toolbar" />
    <slot name="canvas-extra" />
  </div>
  <header v-else class="deh" :class="{ 'deh--no-toolbar': hideToolbar }">
    <div class="deh__left">
      <button type="button" class="deh__back" :title="backTitle" @click="emit('back')">
        <UiIcon name="arrow_back" />
      </button>
      <AppLogo size="sm" />
      <span class="deh__divider">/</span>
      <slot name="title" />
      <span v-if="version" class="deh__version">{{ version }}</span>
      <slot name="left-extra" />
    </div>
    <div v-if="hideToolbar" class="deh__info">
      <slot name="info" />
    </div>
    <div v-if="!hideToolbar" class="deh__center">
      <slot name="toolbar" />
      <slot name="center-extra" />
    </div>
    <div v-if="!hideToolbar" class="deh__right-spacer" />
  </header>
</template>

<style scoped>
.deh {
  display: grid;
  grid-template-columns: minmax(620px, max-content) minmax(0, 1fr) 360px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.deh--no-toolbar {
  grid-template-columns: minmax(0, 1fr) auto;
}

.deh-canvas {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px 10px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
}

.deh__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px;
}

.deh__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
}

.deh__back .ui-icon {
  font-size: 16px;
}

.deh__back:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.deh__divider {
  color: var(--border-strong);
  font-size: 16px;
  font-weight: 300;
}

.deh__version {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 8px;
  border-radius: 6px;
}

.deh__center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 16px;
}

.deh__right-spacer {
  min-width: 0;
}

.deh__info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 16px 8px 0;
}
</style>

<style>
.deh-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.deh-icon-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.deh-icon-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}
</style>

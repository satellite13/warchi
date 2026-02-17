<script setup lang="ts">
import { computed, ref } from "vue"

const leftCollapsed = ref(false)
const rightCollapsed = ref(false)

const gridColumns = computed(() => {
  const left = leftCollapsed.value ? "0px" : "320px"
  const right = rightCollapsed.value ? "0px" : "360px"
  return `${left} minmax(0, 1fr) ${right}`
})
</script>

<template>
  <div class="model-panel-wrapper">
    <div class="model-panel" :style="{ gridTemplateColumns: gridColumns }">
      <aside class="model-panel__left" :class="{ 'model-panel__left--collapsed': leftCollapsed }">
        <slot name="left" />
      </aside>
      <section class="model-panel__center">
        <slot />
      </section>
      <aside class="model-panel__right" :class="{ 'model-panel__right--collapsed': rightCollapsed }">
        <slot name="right" />
      </aside>
    </div>
    <button
      type="button"
      class="model-panel__collapse-btn model-panel__collapse-btn--left"
      :title="leftCollapsed ? 'Показать левую панель' : 'Скрыть левую панель'"
      @click="leftCollapsed = !leftCollapsed"
    >
      <span class="material-symbols-outlined">{{ leftCollapsed ? "chevron_right" : "chevron_left" }}</span>
    </button>
    <button
      type="button"
      class="model-panel__collapse-btn model-panel__collapse-btn--right"
      :title="rightCollapsed ? 'Показать правую панель' : 'Скрыть правую панель'"
      @click="rightCollapsed = !rightCollapsed"
    >
      <span class="material-symbols-outlined">{{ rightCollapsed ? "chevron_left" : "chevron_right" }}</span>
    </button>
  </div>
</template>

<style scoped>
.model-panel-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}

.model-panel {
  width: 100%;
  height: 100%;
  display: grid;
  overflow: hidden;
}

.model-panel__left,
.model-panel__right {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--surface-panel);
}

.model-panel__left {
  border-right: 1px solid var(--border);
}

.model-panel__right {
  border-left: 1px solid var(--border);
}

.model-panel__left--collapsed {
  border-right-color: transparent;
}

.model-panel__right--collapsed {
  border-left-color: transparent;
}

.model-panel__center {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.model-panel__collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 40px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-subtle);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}

.model-panel__collapse-btn .material-symbols-outlined {
  font-size: 16px;
}

.model-panel__collapse-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
  border-color: var(--primary);
}

.model-panel__collapse-btn--left {
  left: 0;
  border-radius: 0 6px 6px 0;
}

.model-panel__collapse-btn--right {
  right: 0;
  border-radius: 6px 0 0 6px;
}
</style>

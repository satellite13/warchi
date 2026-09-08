<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export type TabDef = { id: string; label: string; icon?: string };

const props = defineProps<{
  tabs: TabDef[];
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const { t } = useI18n();
const headerRef = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let resizeObserver: ResizeObserver | null = null;

function updateArrows(): void {
  const el = headerRef.value;
  if (!el) {
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

function scrollByAmount(dir: -1 | 1): void {
  const el = headerRef.value;
  if (!el) return;
  el.scrollBy({ left: dir * Math.max(160, el.clientWidth / 2), behavior: "smooth" });
}

function scrollActiveIntoView(): void {
  const el = headerRef.value;
  const active = el?.querySelector<HTMLElement>(".tab-panel__tab--active");
  if (!el || !active) return;
  const overflowLeft = active.offsetLeft < el.scrollLeft;
  const overflowRight =
    active.offsetLeft + active.offsetWidth > el.scrollLeft + el.clientWidth;
  if (overflowLeft || overflowRight) {
    el.scrollTo({ left: Math.max(0, active.offsetLeft - 8), behavior: "smooth" });
  }
}

watch(
  () => [props.tabs.length, props.modelValue],
  () => {
    void nextTick(() => {
      updateArrows();
      scrollActiveIntoView();
    });
  }
);

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updateArrows());
  if (headerRef.value) resizeObserver.observe(headerRef.value);
  void nextTick(updateArrows);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function onHeaderScroll(): void {
  updateArrows();
}
</script>

<template>
  <div class="tab-panel">
    <div class="tab-panel__header-wrap">
      <button
        v-if="canScrollLeft"
        type="button"
        class="tab-panel__arrow tab-panel__arrow--left"
        :title="t('common.scrollLeft')"
        :aria-label="t('common.scrollLeft')"
        @click="scrollByAmount(-1)"
      >
        <UiIcon name="chevron_left" />
      </button>
      <div
        ref="headerRef"
        class="tab-panel__header"
        @scroll.passive="onHeaderScroll"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="tab-panel__tab"
          :class="{ 'tab-panel__tab--active': modelValue === tab.id }"
          @click="emit('update:modelValue', tab.id)"
        >
          <UiIcon v-if="tab.icon" :name="tab.icon" class="tab-panel__tab-icon" />
          <span class="tab-panel__tab-label">{{ tab.label }}</span>
        </button>
      </div>
      <button
        v-if="canScrollRight"
        type="button"
        class="tab-panel__arrow tab-panel__arrow--right"
        :title="t('common.scrollRight')"
        :aria-label="t('common.scrollRight')"
        @click="scrollByAmount(1)"
      >
        <UiIcon name="chevron_right" />
      </button>
    </div>
    <div class="tab-panel__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.tab-panel__header-wrap {
  position: relative;
  height: 36px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-panel);
}

.tab-panel__header {
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.tab-panel__header::-webkit-scrollbar {
  display: none;
}

.tab-panel__arrow {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--surface-panel);
  color: var(--text-muted);
  cursor: pointer;
  z-index: 2;
  padding: 0;
}

.tab-panel__arrow:hover {
  color: var(--base-text);
}

.tab-panel__arrow--left {
  left: 0;
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.12);
}

.tab-panel__arrow--right {
  right: 0;
  box-shadow: -2px 0 6px rgba(0, 0, 0, 0.12);
}

.tab-panel__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1 0 auto;
  padding: 0 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  white-space: nowrap;
}

.tab-panel__tab:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.tab-panel__tab--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.tab-panel__tab--active:hover {
  color: var(--primary);
  background: transparent;
}

.tab-panel__tab-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tab-panel__tab-label {
  line-height: 1;
}

.tab-panel__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>

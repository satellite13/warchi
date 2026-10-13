<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

export interface ToolbarDropdownItem {
  icon?: string;
  label: string;
  event: string;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  separator?: boolean;
}

export interface ToolbarButton {
  icon: string;
  event: string;
  title?: string;
  disabled?: boolean;
  badge?: boolean;
  active?: boolean;
  separator?: boolean;
  variant?: "default" | "primary";
  /** Кнопка-дропдаун: по клику открывает кастомное меню из items */
  dropdown?: ToolbarDropdownItem[];
  /** Заголовок внутри раскрытого меню (опционально) */
  menuTitle?: string;
}

defineProps<{
  buttons: ToolbarButton[];
}>();

const emit = defineEmits<{
  action: [event: string];
}>();

const openDropdown = ref<string | null>(null);
const rootRef = ref<HTMLElement | null>(null);

function toggleDropdown(event: string) {
  openDropdown.value = openDropdown.value === event ? null : event;
}

function closeDropdown() {
  openDropdown.value = null;
}

function runItem(item: ToolbarDropdownItem) {
  if (item.separator || item.disabled) return;
  closeDropdown();
  emit('action', item.event);
}

function onDocumentPointerDown(event: PointerEvent): void {
  const root = rootRef.value;
  if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
  closeDropdown();
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeDropdown();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div ref="rootRef" class="icon-toolbar">
    <template v-for="btn in buttons" :key="btn.event">
      <div v-if="btn.separator" class="icon-toolbar__sep" />
      <div v-else-if="btn.dropdown" class="icon-toolbar__dd">
        <button
          type="button"
          class="icon-toolbar__btn icon-toolbar__btn--dd"
          :class="{
            'icon-toolbar__btn--active': btn.active || openDropdown === btn.event,
            'icon-toolbar__btn--primary': btn.variant === 'primary'
          }"
          :title="btn.title"
          :disabled="btn.disabled"
          :aria-expanded="openDropdown === btn.event"
          aria-haspopup="true"
          @click="toggleDropdown(btn.event)"
        >
          <UiIcon :name="btn.icon" />
          <span v-if="btn.badge" class="icon-toolbar__badge" />
          <!-- DGTW-4060: каретка-треугольник у кнопок с подменю убрана (решение по демо). -->
        </button>
        <div v-if="openDropdown === btn.event" class="icon-toolbar__menu" role="menu">
          <div v-if="btn.menuTitle" class="icon-toolbar__menu-title">{{ btn.menuTitle }}</div>
          <template v-for="(item, i) in btn.dropdown" :key="item.event || `sep-${i}`">
            <div v-if="item.separator" class="icon-toolbar__menu-sep" />
            <button
              v-else
              type="button"
              class="icon-toolbar__menu-item"
              :class="{
                'icon-toolbar__menu-item--active': item.active,
                'icon-toolbar__menu-item--danger': item.danger
              }"
              :disabled="item.disabled"
              role="menuitem"
              @click="runItem(item)"
            >
              <UiIcon v-if="item.icon" :name="item.icon" />
              <span>{{ item.label }}</span>
            </button>
          </template>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="icon-toolbar__btn"
        :class="{
          'icon-toolbar__btn--active': btn.active,
          'icon-toolbar__btn--primary': btn.variant === 'primary'
        }"
        :title="btn.title"
        :disabled="btn.disabled"
        @click="emit('action', btn.event)"
      >
        <UiIcon :name="btn.icon" />
        <span v-if="btn.badge" class="icon-toolbar__badge" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.icon-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.icon-toolbar__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.icon-toolbar__badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  pointer-events: none;
}

.icon-toolbar__btn .ui-icon {
  width: 20px;
  height: 20px;
  line-height: 1;
}

.icon-toolbar__btn:hover:not(:disabled) {
  background: var(--surface);
  color: var(--base-text);
  box-shadow: var(--shadow-sm);
}

.icon-toolbar__btn:active:not(:disabled) {
  background: var(--primary-soft);
  color: var(--primary);
}

.icon-toolbar__btn--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.icon-toolbar__btn:disabled {
  color: var(--text-subtle);
  cursor: not-allowed;
  opacity: 0.5;
}

.icon-toolbar__btn--primary {
  background: var(--primary);
  color: #fff;
}

.icon-toolbar__btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
  color: #fff;
  box-shadow: var(--shadow-sm);
}

.icon-toolbar__btn--primary:active:not(:disabled) {
  background: var(--primary-hover);
  color: #fff;
}

.icon-toolbar__btn--dd {
  width: auto;
  min-width: 30px;
  padding: 0 4px;
}

.icon-toolbar__sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 6px;
  flex-shrink: 0;
}

/* --- Кастомное меню в стилистике DiagramCanvasSettings --- */

.icon-toolbar__dd {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.icon-toolbar__menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 30;
  min-width: 230px;
  padding: 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.icon-toolbar__menu-title {
  padding: 2px 8px 4px;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.icon-toolbar__menu-item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 7px 8px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.icon-toolbar__menu-item:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.icon-toolbar__menu-item--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.icon-toolbar__menu-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-toolbar__menu-item :deep(.ui-icon) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.icon-toolbar__menu-item--danger {
  color: var(--danger, #dc2626);
}

.icon-toolbar__menu-item--danger:hover:not(:disabled) {
  border-color: var(--danger, #dc2626);
  background: var(--danger-soft, rgba(220, 38, 38, 0.08));
  color: var(--danger, #dc2626);
}

.icon-toolbar__menu-sep {
  height: 1px;
  margin: 2px 6px;
  background: var(--border);
}
</style>

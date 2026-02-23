<script setup lang="ts">
import {computed} from "vue";
import {useRouter} from "vue-router";
import AppLogo from "../../../components/layout/AppLogo.vue";
import IconToolbar, {type ToolbarButton} from "./IconToolbar.vue";

const props = withDefaults(defineProps<{
  hasUnsavedChanges?: boolean;
  notationName?: string;
  notationVersion?: string;
  gridVisible?: boolean;
  miniMapVisible?: boolean;
  snapEnabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  canShare?: boolean;
  canvasMode?: boolean;
  hideToolbar?: boolean;
}>(), {
  hasUnsavedChanges: false,
  notationName: "",
  notationVersion: "",
  gridVisible: true,
  miniMapVisible: true,
  snapEnabled: false,
  canUndo: false,
  canRedo: false,
  canShare: false,
  canvasMode: false,
  hideToolbar: false
});

const router = useRouter();
const toolbarButtons = computed<ToolbarButton[]>(() => [
  {icon: "undo", event: "undo", title: "Отменить", disabled: !props.canUndo},
  {icon: "redo", event: "redo", title: "Повторить", disabled: !props.canRedo},
  {icon: "separator", event: "sep1", separator: true},
  {icon: "zoom_in", event: "zoom-in", title: "Приблизить"},
  {icon: "zoom_out", event: "zoom-out", title: "Отдалить"},
  {icon: "fit_screen", event: "fit-screen", title: "Вписать в экран"},
  {icon: "center_focus_strong", event: "zoom-selection", title: "Масштабировать выделение"},
  {icon: "format_align_center", event: "auto-layout-components", title: "Авторазмещение компонентов"},
  {icon: "restart_alt", event: "reset-view", title: "Сбросить масштаб"},
  {icon: "separator", event: "sep2", separator: true},
  {icon: "grid_on", event: "toggle-grid", title: "Сетка", active: props.gridVisible},
  {icon: "map", event: "toggle-minimap", title: "Миникарта", active: props.miniMapVisible},
  {icon: "straighten", event: "toggle-snap", title: "Привязка к сетке", active: props.snapEnabled},
  {icon: "separator", event: "sep3", separator: true},
  {icon: "image", event: "export-diagram-png", title: "Экспорт диаграммы в PNG"},
  {icon: "description", event: "export-diagram-svg", title: "Экспорт диаграммы в SVG"},
  {icon: "separator", event: "sep4", separator: true},
  {icon: "download", event: "export-notation", title: "Экспорт нотации"},
  {icon: "upload", event: "import-notation", title: "Импорт нотации"},
  {icon: "separator", event: "sep5", separator: true},
  {icon: "data_object", event: "show-attrs-json", title: "Просмотр JSON attrs"},
  {icon: "separator", event: "sep6", separator: true},
  {
    icon: "save",
    event: "save",
    title: props.hasUnsavedChanges ? "Сохранить (есть несохранённые изменения)" : "Сохранить",
    badge: props.hasUnsavedChanges,
    disabled: !props.hasUnsavedChanges,
    variant: props.hasUnsavedChanges ? "primary" : "default"
  },
]);

const emit = defineEmits<{
  action: [event: string];
  share: [];
}>();
</script>

<template>
  <div v-if="canvasMode" class="notation-header-canvas">
    <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)"/>
  </div>
  <header v-else class="notation-header" :class="{ 'notation-header--no-toolbar': hideToolbar }">
    <div class="notation-header__left">
      <button type="button" class="back-btn" title="К списку нотаций" @click="router.push({name: 'notations'})">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <AppLogo size="sm"/>
      <span class="notation-header__divider">/</span>
      <span class="notation-header__title">{{ notationName || "Редактор нотации" }}</span>
      <span v-if="notationVersion" class="notation-header__version">{{ notationVersion }}</span>
      <span v-if="hasUnsavedChanges" class="dirty-badge" title="Есть несохранённые изменения">
        <span class="dirty-dot"></span>
        Не сохранено
      </span>
      <button
        v-if="canShare"
        type="button"
        class="share-btn"
        title="Поделиться доступом"
        @click="emit('share')"
      >
        <span class="material-symbols-outlined">share</span>
      </button>
    </div>
    <div v-if="!hideToolbar" class="notation-header__center">
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)"/>
    </div>
    <div v-if="!hideToolbar" class="notation-header__right-spacer" />
  </header>
</template>

<style scoped>
.notation-header {
  display: grid;
  grid-template-columns: minmax(620px, max-content) minmax(0, 1fr) 360px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.notation-header--no-toolbar {
  grid-template-columns: minmax(0, 1fr);
}

.notation-header-canvas {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
}

.notation-header-canvas :deep(.icon-toolbar) {
  padding: 2px 3px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-strong) 92%, transparent);
}

.notation-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px;
}

.back-btn {
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

.back-btn .material-symbols-outlined {
  font-size: 16px;
}

.back-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.notation-header__divider {
  color: var(--border-strong);
  font-size: 16px;
  font-weight: 300;
}

.notation-header__title {
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
}

.notation-header__version {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 8px;
  border-radius: 6px;
}

.notation-header__center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 12px 16px;
}

.notation-header__right-spacer {
  min-width: 0;
}

.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 4px 12px;
  border-radius: 20px;
  white-space: nowrap;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
}

.share-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.share-btn .material-symbols-outlined {
  font-size: 16px;
}

.share-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}
</style>

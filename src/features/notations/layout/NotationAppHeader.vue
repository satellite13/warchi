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
}>(), {
  hasUnsavedChanges: false,
  notationName: "",
  notationVersion: "",
  gridVisible: true,
  miniMapVisible: true,
  snapEnabled: false,
  canUndo: false,
  canRedo: false
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
    variant: props.hasUnsavedChanges ? "primary" : "default"
  },
]);

const emit = defineEmits<{
  action: [event: string];
}>();
</script>

<template>
  <header class="notation-header">
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
    </div>
    <div class="notation-header__center">
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)"/>
    </div>
    <div class="notation-header__right-spacer" />
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
</style>

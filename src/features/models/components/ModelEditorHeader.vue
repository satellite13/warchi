<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import AppLogo from "../../../components/layout/AppLogo.vue"
import IconToolbar, { type ToolbarButton } from "../../notations/layout/IconToolbar.vue"

const props = withDefaults(defineProps<{
  hasUnsavedChanges?: boolean
  canSave?: boolean
  modelName?: string
  modelVersion?: string
  gridVisible?: boolean
  miniMapVisible?: boolean
  snapEnabled?: boolean
  lockAnchorsEnabled?: boolean
  hasActiveDiagram?: boolean
  canUndo?: boolean
  canRedo?: boolean
}>(), {
  hasUnsavedChanges: false,
  canSave: true,
  modelName: "",
  modelVersion: "",
  gridVisible: true,
  miniMapVisible: true,
  snapEnabled: false,
  lockAnchorsEnabled: true,
  hasActiveDiagram: false,
  canUndo: false,
  canRedo: false
})

const router = useRouter()
const emit = defineEmits<{
  action: [event: string]
}>()

const saveTitle = computed(() =>
  props.hasUnsavedChanges ? "Сохранить изменения" : "Изменений нет"
)

const toolbarButtons = computed<ToolbarButton[]>(() => [
  { icon: "undo", event: "undo", title: "Отменить", disabled: !props.canUndo || !props.hasActiveDiagram },
  { icon: "redo", event: "redo", title: "Повторить", disabled: !props.canRedo || !props.hasActiveDiagram },
  { icon: "separator", event: "sep0", separator: true },
  { icon: "zoom_in", event: "zoom-in", title: "Приблизить", disabled: !props.hasActiveDiagram },
  { icon: "zoom_out", event: "zoom-out", title: "Отдалить", disabled: !props.hasActiveDiagram },
  { icon: "fit_screen", event: "fit-screen", title: "Вписать в экран", disabled: !props.hasActiveDiagram },
  {
    icon: "center_focus_strong",
    event: "zoom-selection",
    title: "Масштабировать выделение",
    disabled: !props.hasActiveDiagram
  },
  {
    icon: "format_align_center",
    event: "auto-layout-nodes",
    title: "Авторазмещение нод",
    disabled: !props.hasActiveDiagram
  },
  { icon: "restart_alt", event: "reset-view", title: "Сбросить масштаб", disabled: !props.hasActiveDiagram },
  { icon: "separator", event: "sep1", separator: true },
  {
    icon: "grid_on",
    event: "toggle-grid",
    title: "Сетка",
    active: props.gridVisible,
    disabled: !props.hasActiveDiagram
  },
  {
    icon: "map",
    event: "toggle-minimap",
    title: "Миникарта",
    active: props.miniMapVisible,
    disabled: !props.hasActiveDiagram
  },
  {
    icon: "straighten",
    event: "toggle-snap",
    title: "Привязка к сетке",
    active: props.snapEnabled,
    disabled: !props.hasActiveDiagram
  },
  {
    icon: "commit",
    event: "toggle-lock-anchors",
    title: "Закрепить точки связей",
    active: props.lockAnchorsEnabled,
    disabled: !props.hasActiveDiagram
  },
  { icon: "separator", event: "sep2", separator: true },
  {
    icon: "close",
    event: "close-diagram",
    title: "Закрыть диаграмму",
    disabled: !props.hasActiveDiagram
  },
  { icon: "separator", event: "sep3", separator: true },
  {
    icon: "data_object",
    event: "show-diagram-json",
    title: "Просмотр JSON диаграммы",
    disabled: !props.hasActiveDiagram
  },
  { icon: "separator", event: "sep4", separator: true },
  {
    icon: "save",
    event: "save",
    title: saveTitle.value,
    badge: props.hasUnsavedChanges,
    variant: props.hasUnsavedChanges ? "primary" : "default",
    disabled: !props.canSave || !props.hasUnsavedChanges
  }
])
</script>

<template>
  <header class="model-header">
    <div class="model-header__left">
      <button type="button" class="back-btn" title="К списку моделей" @click="router.push({name: 'models'})">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <AppLogo size="sm" />
      <span class="model-header__divider">/</span>
      <span class="model-header__title">{{ modelName || 'Редактор модели' }}</span>
      <span v-if="modelVersion" class="model-header__version">{{ modelVersion }}</span>
      <span v-if="hasUnsavedChanges" class="dirty-badge" title="Есть несохранённые изменения">
        <span class="dirty-dot"></span>
        Не сохранено
      </span>
    </div>
    <div class="model-header__center">
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
    </div>
    <div class="model-header__right-spacer" />
  </header>
</template>

<style scoped>
.model-header {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 360px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.model-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px;
}

.model-header__title {
  font-size: 14px;
  color: var(--text-muted);
}

.model-header__center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 12px 16px;
}

.model-header__right-spacer {
  min-width: 0;
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

.back-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.model-header__divider {
  color: var(--border-strong);
  font-size: 16px;
  font-weight: 300;
}

.model-header__version {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 8px;
  border-radius: 6px;
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
  animation: fadeIn 0.2s ease;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
  animation: pulseGlow 1.5s ease-in-out infinite;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pulseGlow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>

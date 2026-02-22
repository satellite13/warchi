<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
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
  canShare?: boolean
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
  canRedo: false,
  canShare: false
})

const router = useRouter()
const emit = defineEmits<{
  action: [event: string]
  renameModel: [name: string]
  share: []
}>()

const isRenamingModel = ref(false)
const editableModelName = ref("")
const modelNameInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelName,
  (name) => {
    if (!isRenamingModel.value) editableModelName.value = name || ""
  },
  { immediate: true }
)

const startModelRename = async () => {
  editableModelName.value = props.modelName || ""
  isRenamingModel.value = true
  await nextTick()
  modelNameInputRef.value?.focus()
  modelNameInputRef.value?.select()
}

const cancelModelRename = () => {
  isRenamingModel.value = false
  editableModelName.value = props.modelName || ""
}

const commitModelRename = () => {
  const nextName = editableModelName.value.trim()
  isRenamingModel.value = false
  if (!nextName || nextName === (props.modelName || "").trim()) return
  emit("renameModel", nextName)
}

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
    icon: "image",
    event: "export-diagram-png",
    title: "Экспорт диаграммы в PNG",
    disabled: !props.hasActiveDiagram
  },
  {
    icon: "description",
    event: "export-diagram-svg",
    title: "Экспорт диаграммы в SVG",
    disabled: !props.hasActiveDiagram
  },
  { icon: "separator", event: "sep3", separator: true },
  {
    icon: "close",
    event: "close-diagram",
    title: "Закрыть диаграмму",
    disabled: !props.hasActiveDiagram
  },
  { icon: "separator", event: "sep4", separator: true },
  {
    icon: "data_object",
    event: "show-diagram-json",
    title: "Просмотр JSON диаграммы",
    disabled: !props.hasActiveDiagram
  },
  { icon: "info", event: "show-diagram-info", title: "Информация о диаграмме", disabled: !props.hasActiveDiagram },
  { icon: "separator", event: "sep5", separator: true },
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
      <div class="model-header__title-wrap">
        <input
          v-if="isRenamingModel"
          ref="modelNameInputRef"
          v-model="editableModelName"
          class="model-header__title-input"
          @blur="commitModelRename"
          @keydown.enter.prevent="commitModelRename"
          @keydown.esc.prevent="cancelModelRename"
        >
        <button
          v-else
          type="button"
          class="model-header__title-btn"
          title="Переименовать модель"
          @click="startModelRename"
        >
          <span class="model-header__title">{{ modelName || "Редактор модели" }}</span>
          <span class="material-symbols-outlined model-header__title-edit-icon">edit</span>
        </button>
      </div>
      <span v-if="modelVersion" class="model-header__version">{{ modelVersion }}</span>
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
        Поделиться
      </button>
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
  grid-template-columns: minmax(620px, max-content) minmax(0, 1fr) 360px;
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

.model-header__title-wrap {
  min-width: 0;
}

.model-header__title-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.model-header__title-btn .model-header__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-header__title-edit-icon {
  font-size: 14px;
  color: var(--text-subtle);
}

.model-header__title-btn:hover .model-header__title {
  color: var(--primary);
}

.model-header__title-btn:hover .model-header__title-edit-icon {
  color: var(--primary);
}

.model-header__title-input {
  width: 220px;
  max-width: 30vw;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--base-text);
  font-size: 14px;
  outline: none;
}

.model-header__title-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
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

.share-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  padding: 4px 8px;
  cursor: pointer;
}

.share-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}
</style>

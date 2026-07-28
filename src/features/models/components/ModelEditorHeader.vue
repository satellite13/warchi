<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppLogo from "@/components/layout/AppLogo.vue"
import UnsavedBadge from "@/components/UnsavedBadge.vue"
import IconToolbar, { type ToolbarButton } from "../../notations/layout/IconToolbar.vue"

import type { EditorDiagram } from '../types'

const props = withDefaults(
  defineProps<{
    hasUnsavedChanges?: boolean
    canSave?: boolean
    modelName?: string
    modelVersion?: string
    hasActiveDiagram?: boolean
    canUndo?: boolean
    canRedo?: boolean
    canShare?: boolean
    canvasMode?: boolean
    hideToolbar?: boolean
    diagramName?: string
    diagramVersion?: string
    notationName?: string
    notationId?: string
    notationVersion?: string
    notationOwnerInfo?: string
    canOpenNotation?: boolean
    diagramVersions?: EditorDiagram[]
    selectedDiagramId?: string | null
    isDiagramReadOnly?: boolean
    navigationOnlyMode?: boolean
    baselineCreating?: boolean
    baselineError?: string | null
    isAdmin?: boolean
    showCompareButton?: boolean
    /** Редактирование модели (имя и т.д.); false при доступе только VIEW по шаре */
    canEditModel?: boolean
    /** Кнопка wiki-документации модели в шапке: скрыть при VIEW, если у модели ещё нет привязанного файла */
    showModelWikiButton?: boolean
    /** Пункт тулбара «wiki страница диаграммы»: скрыть при VIEW, если у активной диаграммы нет documentFileId */
    showDiagramWikiButton?: boolean
    /** id текущей версии модели (для перехода к сравнению версий диаграммы). */
    modelId?: string | null
    layoutBusy?: boolean
    /** Диаграмма занята другим пользователем (эксклюзивный lock) */
    diagramLockBlockedByOther?: boolean
    /** Email/отображаемое имя держателя lock (для подписи рядом с иконкой) */
    diagramLockHolderDisplay?: string
    /** На сервере диаграмма новее локальной — показать CTA «Загрузить с сервера» */
    diagramLockServerNewer?: boolean
    /** Зрители смотрят диаграмму (только для держателя lock) */
    diagramSpectators?: { userId: string; displayName: string }[]
  }>(),
  {
    hasUnsavedChanges: false,
    canSave: true,
    modelName: '',
    modelVersion: '',
    hasActiveDiagram: false,
    canUndo: false,
    canRedo: false,
    canShare: false,
    canvasMode: false,
    hideToolbar: false,
    diagramName: '',
    diagramVersion: '',
    notationName: '',
    notationId: '',
    notationVersion: '',
    notationOwnerInfo: '',
    canOpenNotation: false,
    diagramVersions: () => [],
    selectedDiagramId: null,
    isDiagramReadOnly: false,
    navigationOnlyMode: false,
    baselineCreating: false,
    baselineError: null,
    isAdmin: false,
    showCompareButton: false,
    canEditModel: true,
    showModelWikiButton: true,
    showDiagramWikiButton: true,
    modelId: null,
    layoutBusy: false,
    diagramLockBlockedByOther: false,
    diagramLockHolderDisplay: '',
    diagramLockServerNewer: false,
    diagramSpectators: () => [],
  }
)

const router = useRouter()
const { t } = useI18n()
const emit = defineEmits<{
  action: [event: string]
  renameModel: [name: string]
  share: []
  openNotation: [notationId: string]
  selectDiagramVersion: [diagramId: string]
  createBaseline: []
  compare: []
  openRelationMatrix: []
  diagramLockReload: []
}>()

const isRenamingModel = ref(false)
const editableModelName = ref('')
const modelNameInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelName,
  name => {
    if (!isRenamingModel.value) editableModelName.value = name || ''
  },
  { immediate: true }
)

const startModelRename = async () => {
  editableModelName.value = props.modelName || ''
  isRenamingModel.value = true
  await nextTick()
  modelNameInputRef.value?.focus()
  modelNameInputRef.value?.select()
}

const cancelModelRename = () => {
  isRenamingModel.value = false
  editableModelName.value = props.modelName || ''
}

const goToDiagramCompare = () => {
  const id = props.modelId
  if (!id) return
  router.push({
    name: 'diagram-versions-compare',
    params: { id },
    query: props.diagramName ? { diagram: props.diagramName } : {},
  })
}

const commitModelRename = () => {
  const nextName = editableModelName.value.trim()
  isRenamingModel.value = false
  if (!nextName || nextName === (props.modelName || '').trim()) return
  emit('renameModel', nextName)
}

const saveTitle = computed(() =>
  props.hasUnsavedChanges ? t('toolbar.saveChanges') : t('toolbar.noChanges')
)

const toolbarButtons = computed<ToolbarButton[]>(() => [
  {
    icon: 'open_with',
    event: 'toggle-navigation-mode',
    title: t('toolbar.navigationMode'),
    active: props.navigationOnlyMode,
    disabled: !props.hasActiveDiagram || props.isDiagramReadOnly,
  },
  { icon: 'separator', event: 'sep-nav', separator: true },
  {
    icon: 'undo',
    event: 'undo',
    title: t('toolbar.undo'),
    disabled: !props.canUndo || !props.hasActiveDiagram || props.isDiagramReadOnly,
  },
  {
    icon: 'redo',
    event: 'redo',
    title: t('toolbar.redo'),
    disabled: !props.canRedo || !props.hasActiveDiagram || props.isDiagramReadOnly,
  },
  { icon: 'separator', event: 'sep0', separator: true },
  {
    icon: 'zoom_in',
    event: 'zoom-in',
    title: t('toolbar.zoomIn'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'zoom_out',
    event: 'zoom-out',
    title: t('toolbar.zoomOut'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'fit_screen',
    event: 'fit-screen',
    title: t('toolbar.fitScreen'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'center_focus_strong',
    event: 'zoom-selection',
    title: t('toolbar.zoomSelection'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'format_align_center',
    event: 'auto-layout-nodes',
    title: t('toolbar.autoLayoutNodes'),
    disabled: !props.hasActiveDiagram || props.isDiagramReadOnly || props.layoutBusy,
  },
  {
    icon: 'restart_alt',
    event: 'reset-view',
    title: t('toolbar.resetZoom'),
    disabled: !props.hasActiveDiagram,
  },
  { icon: 'separator', event: 'sep2', separator: true },
  {
    icon: 'image',
    event: 'export-diagram-png',
    title: t('toolbar.exportDiagramPng'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'description',
    event: 'export-diagram-svg',
    title: t('toolbar.exportDiagramSvg'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'link',
    event: 'share-diagram-image',
    title: t('toolbar.shareDiagramImage'),
    disabled: !props.hasActiveDiagram,
  },
  {
    icon: 'upload_file',
    event: 'import-oef',
    title: t('models.oefImportTitle'),
    disabled: !props.canEditModel,
  },
  {
    icon: 'download',
    event: 'export-model-package',
    title: t('toolbar.exportModelPackage'),
  },
  { icon: 'separator', event: 'sep3', separator: true },
  ...(props.isAdmin
    ? [
        {
          icon: 'data_object',
          event: 'show-diagram-json',
          title: t('toolbar.showDiagramJson'),
          disabled: !props.hasActiveDiagram,
        },
      ]
    : []),
  ...(props.showDiagramWikiButton
    ? [
        {
          icon: 'article',
          event: 'open-diagram-doc',
          title: t('models.diagramDocumentation'),
          disabled: !props.hasActiveDiagram,
        },
      ]
    : []),
  { icon: 'separator', event: 'sep5', separator: true },
  {
    icon: 'close',
    event: 'close-diagram',
    title: t('toolbar.closeDiagram'),
    disabled: !props.hasActiveDiagram,
  },
  ...(!props.isDiagramReadOnly
    ? [
        {
          icon: 'save',
          event: 'save',
          title: saveTitle.value,
          badge: props.hasUnsavedChanges,
          variant: (props.hasUnsavedChanges ? 'primary' : 'default') as 'primary' | 'default',
          disabled: !props.canSave || !props.hasUnsavedChanges,
        },
      ]
    : []),
])

const canCreateBaseline = computed(
  () =>
    props.hasActiveDiagram &&
    !props.isDiagramReadOnly &&
    (props.diagramVersions?.length ?? 0) >= 1 &&
    !props.baselineCreating
)

function spectatorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <div v-if="canvasMode" class="model-header-canvas">
    <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
    <div
      v-if="hasActiveDiagram && !diagramLockBlockedByOther && (diagramSpectators?.length ?? 0) > 0"
      class="model-header__spectators"
    >
      <span
        v-for="(s, i) in diagramSpectators!.slice(0, 3)"
        :key="s.userId"
        class="model-header__spectator-avatar"
        :style="{ zIndex: 3 - i }"
        :title="s.displayName"
      >{{ spectatorInitials(s.displayName) }}</span>
      <span
        v-if="diagramSpectators!.length > 3"
        class="model-header__spectator-avatar model-header__spectator-avatar--overflow"
        :style="{ zIndex: 0 }"
        :title="diagramSpectators!.slice(3).map((s) => s.displayName).join(', ')"
      >+{{ diagramSpectators!.length - 3 }}</span>
    </div>
    <div
      v-if="isDiagramReadOnly && diagramLockBlockedByOther"
      class="model-header__diagram-lock-group"
    >
      <span
        class="lock-chip"
        :title="t('models.diagramLockHeldBy', { name: diagramLockHolderDisplay || '—' })"
      >
        <span class="lock-chip__pulse"></span>
        <svg class="lock-chip__icon" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" />
          <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
        <span class="lock-chip__name">{{ diagramLockHolderDisplay || '—' }}</span>
      </span>
      <button
        v-if="diagramLockServerNewer"
        type="button"
        class="lock-reload-btn"
        @click="emit('diagramLockReload')"
      >
        <svg class="lock-reload-btn__icon" viewBox="0 0 14 14" fill="none">
          <path d="M12 2v3.5h-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M10.8 8.5a4.5 4.5 0 11-.9-5.2L12 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ t('models.diagramLockReload') }}
      </button>
    </div>
    <span
      v-else-if="isDiagramReadOnly"
      class="model-header__readonly-indicator"
      :title="t('models.viewOnly')"
    >
      <UiIcon name="visibility" class="model-header__readonly-icon" />
      <span class="model-header__readonly-text">{{ t('models.viewOnly') }}</span>
    </span>
  </div>
  <header v-else class="model-header" :class="{ 'model-header--no-toolbar': hideToolbar }">
    <div class="model-header__left">
      <button
        type="button"
        class="back-btn"
        :title="t('toolbar.backToModels')"
        @click="router.push({ name: 'models' })"
      >
        <UiIcon name="arrow_back" />
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
        />
        <button
          v-else
          type="button"
          class="model-header__title-btn"
          :title="canEditModel ? t('toolbar.renameModel') : t('models.viewOnly')"
          :disabled="!canEditModel"
          @click="canEditModel && startModelRename()"
        >
          <span class="model-header__title">{{ modelName || t('toolbar.modelEditor') }}</span>
          <UiIcon v-if="canEditModel" name="edit" class="model-header__title-edit-icon" />
        </button>
      </div>
      <span v-if="modelVersion" class="model-header__version">{{ modelVersion }}</span>
      <button
        v-if="showCompareButton"
        type="button"
        class="share-btn"
        :title="t('models.compareWithVersion')"
        @click="emit('compare')"
      >
        <UiIcon name="compare_arrows" />
      </button>
      <button
        v-if="modelId"
        type="button"
        class="share-btn"
        :title="t('models.relationMatrixOpen')"
        @click="emit('openRelationMatrix')"
      >
        <UiIcon name="grid_view" />
      </button>
      <UnsavedBadge v-if="hasUnsavedChanges" tooltip-key="toolbar.unsavedChangesHint" />
      <button
        v-if="canShare"
        type="button"
        class="share-btn"
        :title="t('toolbar.shareAccess')"
        @click="emit('share')"
      >
        <UiIcon name="share" />
      </button>
      <button
        v-if="showModelWikiButton"
        type="button"
        class="share-btn"
        :title="t('models.documentation')"
        @click="emit('action', 'open-model-doc')"
      >
        <UiIcon name="article" />
      </button>
    </div>
    <div v-if="hideToolbar" class="model-header__info">
      <template v-if="diagramName">
        <span class="model-header__info-label">{{ t('toolbar.diagramLabel') }}:</span>
        <span class="model-header__info-value model-header__info-value--diagram">{{ diagramName }}</span>
        <template v-if="diagramVersions && diagramVersions.length > 0">
          <select
            :value="selectedDiagramId ?? ''"
            class="model-header__version-select"
            :title="t('models.diagramVersion')"
            @change="emit('selectDiagramVersion', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="d in diagramVersions"
              :key="d.id"
              :value="d.id"
            >
              {{ d.version }}
            </option>
          </select>
          <button
            type="button"
            class="model-header__baseline-btn"
            :title="t('models.createBaseline')"
            :disabled="!canCreateBaseline"
            @click="emit('createBaseline')"
          >
            <UiIcon name="add_box" />
          </button>
          <button
            v-if="modelId"
            type="button"
            class="model-header__baseline-btn"
            :title="t('models.compareDiagramVersions')"
            @click="goToDiagramCompare"
          >
            <UiIcon name="compare" />
          </button>
          <span v-if="baselineError" class="model-header__baseline-error" :title="baselineError">!</span>
        </template>
        <template v-else-if="diagramVersion">
          <span class="model-header__version">{{ diagramVersion }}</span>
        </template>
      </template>
      <template v-if="notationName">
        <span class="model-header__info-label">{{ t('toolbar.notationLabel') }}:</span>
        <button
          v-if="canOpenNotation && notationId"
          type="button"
          class="model-header__info-link"
          :title="t('toolbar.openNotationEditor')"
          @click="emit('openNotation', notationId)"
        >
          <span class="model-header__info-value">{{ notationName }}</span>
          <span v-if="notationVersion" class="model-header__version">{{ notationVersion }}</span>
        </button>
        <template v-else>
          <span class="model-header__info-value">{{ notationName }}</span>
          <span v-if="notationVersion" class="model-header__version">{{ notationVersion }}</span>
        </template>
      </template>
      <span v-if="notationOwnerInfo" class="model-header__info-owner">{{ notationOwnerInfo }}</span>
      <span v-if="!diagramName" class="model-header__info-muted">{{ t('models.noDiagramSelected') }}</span>
    </div>
    <div v-if="!hideToolbar" class="model-header__center">
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
      <div
        v-if="isDiagramReadOnly && diagramLockBlockedByOther"
        class="model-header__diagram-lock-group"
      >
        <span
          class="lock-chip"
          :title="t('models.diagramLockHeldBy', { name: diagramLockHolderDisplay || '—' })"
        >
          <span class="lock-chip__pulse"></span>
          <svg class="lock-chip__icon" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" />
            <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
          <span class="lock-chip__name">{{ diagramLockHolderDisplay || '—' }}</span>
        </span>
        <button
          v-if="diagramLockServerNewer"
          type="button"
          class="lock-reload-btn"
          @click="emit('diagramLockReload')"
        >
          <svg class="lock-reload-btn__icon" viewBox="0 0 14 14" fill="none">
            <path d="M12 2v3.5h-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M10.8 8.5a4.5 4.5 0 11-.9-5.2L12 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ t('models.diagramLockReload') }}
        </button>
      </div>
      <span
        v-else-if="isDiagramReadOnly"
        class="model-header__readonly-indicator"
        :title="t('models.viewOnly')"
      >
        <UiIcon name="visibility" class="model-header__readonly-icon" />
        <span class="model-header__readonly-text">{{ t('models.viewOnly') }}</span>
      </span>
    </div>
    <div v-if="!hideToolbar" class="model-header__right-spacer" />
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

.model-header--no-toolbar {
  grid-template-columns: minmax(0, 1fr) auto;
}

.model-header-canvas {
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

.model-header__spectators {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding-left: 4px;
}

.model-header__spectator-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  background: var(--primary);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  position: relative;
  margin-left: -6px;
  cursor: default;
  transition: transform 0.15s ease;
}

.model-header__spectator-avatar:first-child {
  margin-left: 0;
}

.model-header__spectator-avatar:hover {
  transform: translateY(-2px);
}

.model-header__spectator-avatar--overflow {
  background: var(--surface-strong);
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 700;
}

.model-header__diagram-lock-group {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 1;
  pointer-events: auto;
}

/* (lock-reload-btn styles above) */

.model-header-canvas :deep(.icon-toolbar) {
  padding: 2px 3px;
  border-radius: 7px;
}

/* Diagram version & baseline in main header info */
.model-header__info-value--diagram {
  max-width: 160px;
}

.model-header__version-select {
  font-size: 12px;
  padding: 2px 6px;
  margin: 0 2px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--base-text);
  cursor: pointer;
  width: auto;
  max-width: 6em;
}

.model-header__baseline-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin: 0 2px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--base-text);
  cursor: pointer;
}

.model-header__baseline-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.model-header__baseline-btn:hover:not(:disabled) {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

.model-header__baseline-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.model-header__baseline-error {
  font-size: 12px;
  color: var(--danger);
  margin-left: 2px;
  cursor: help;
}

.model-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px;
}

.model-header__info {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 12px 0 0;
}

.model-header__info-label {
  font-size: 12px;
  color: var(--text-subtle);
}

.model-header__info-value {
  font-size: 13px;
  color: var(--base-text);
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-header__info-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.model-header__info-link:hover .model-header__info-value {
  color: var(--primary);
  text-decoration: underline;
}

.model-header__info-owner,
.model-header__info-muted {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.model-header__title-btn .model-header__title-edit-icon {
  width: 16px;
  height: 16px;
  opacity: 0.8;
}

.model-header__title-btn:hover .model-header__title {
  color: var(--primary);
}

.model-header__title-btn:hover .model-header__title-edit-icon {
  color: var(--primary);
}

.model-header__title-btn:disabled {
  cursor: default;
  opacity: 0.92;
}
.model-header__title-btn:disabled:hover .model-header__title,
.model-header__title-btn:disabled:hover .model-header__title-edit-icon {
  color: inherit;
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
  gap: 12px;
  min-width: 0;
  padding: 12px 16px;
}

.model-header__readonly-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--primary);
  border-radius: 8px;
  background: var(--primary-soft);
  border: 1px solid var(--primary);
}

.model-header__readonly-icon :deep(.ui-icon) {
  width: 18px;
  height: 18px;
  opacity: 1;
}

.model-header__readonly-text {
  font-weight: 600;
  letter-spacing: 0.01em;
}

/* ─── Lock chip (blocked by another user) ──────── */
.lock-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--warning);
  border-radius: 16px;
  background: var(--warning-soft);
  border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
  max-width: min(100%, 360px);
  position: relative;
  overflow: hidden;
}

.lock-chip__pulse {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  animation: lock-chip-pulse 2.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes lock-chip-pulse {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

.lock-chip__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  position: relative;
}

.lock-chip__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.01em;
  position: relative;
}

/* ─── Reload button ────────────────────────────── */
.lock-reload-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  border-radius: 7px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.15s, box-shadow 0.15s;
}

.lock-reload-btn:hover {
  filter: brightness(1.08);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent);
}

.lock-reload-btn__icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
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

.share-btn {
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

.share-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.share-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}
</style>

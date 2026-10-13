<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UnsavedBadge from "@/components/UnsavedBadge.vue"
import DiagramEditorHeaderShell from "@/components/layout/DiagramEditorHeaderShell.vue"
import IconToolbar, {
  type ToolbarButton,
  type ToolbarDropdownItem,
} from '@/components/layout/IconToolbar.vue'
import DiagramCanvasSettings from "./DiagramCanvasSettings.vue"
import { useFavorites } from '@/composables/useFavorites'
import { useAuth } from '@/composables/useAuth'
import {
  getOwnerDisplayNameFromMap,
  resolveOwnerDisplayNames,
} from '@/utils/resolveOwnerNames'
import { formatDate } from '@/utils/formatDate'
import { useFeatureGrants } from '@/composables/useFeatureGrants'
import type { EdgePathType } from "../composables/useModelToolbarState"

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
    /** Доступная для миграции более новая версия нотации; чип показывается, когда задана. */
    newerNotationVersion?: string
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
    /** Лок потерян (acquire не удался) — чип и кнопка «Попробовать редактировать» */
    diagramLockLost?: boolean
    /** Зрители смотрят диаграмму (только для держателя lock) */
    diagramSpectators?: { userId: string; displayName: string }[]
    /** Toolbar actions that must not run during save validation. */
    toolbarLocked?: boolean
    canvasToggleButtons?: ToolbarButton[]
    defaultLinkTypeOptions?: { value: EdgePathType; label: string; icon: string }[]
    defaultEdgeType?: EdgePathType
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
    newerNotationVersion: undefined,
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
    diagramLockLost: false,
    diagramSpectators: () => [],
    toolbarLocked: false,
    canvasToggleButtons: () => [],
    defaultLinkTypeOptions: () => [],
    defaultEdgeType: 'bezier',
  }
)

const router = useRouter()
const { t, locale } = useI18n()
const { hasGrant } = useFeatureGrants()
const { currentUser } = useAuth()
// DGTW-4060: звезда избранного убрана из триггера версии (избранное — в дереве
// диаграмм); isFavorite остался для маркеров в списке версий.
const { isFavorite } = useFavorites()

/** Элементы «для архитекторов»: авто-раскладка, wiki, JSON-инспектор и т.п. */
const isArchitectOrAdmin = computed(
  () => props.isAdmin || currentUser?.value?.role === 'architect'
)

/** Развитая группа: раскладка/вид/JSON — только архитектор и админ */
const canUseAdvancedTools = isArchitectOrAdmin
const emit = defineEmits<{
  action: [event: string]
  renameModel: [name: string]
  share: []
  openNotation: [notationId: string]
  migrateNotation: []
  selectDiagramVersion: [diagramId: string]
  createBaseline: []
  compare: []
  openRelationMatrix: []
  openValidation: []
  diagramLockReload: []
  diagramLockRetry: []
  'update:defaultEdgeType': [value: EdgePathType]
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
    icon: 'pan_tool',
    event: 'toggle-navigation-mode',
    title: t('toolbar.navigationMode'),
    active: props.navigationOnlyMode,
    disabled: !props.hasActiveDiagram || props.isDiagramReadOnly,
  },
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
  { icon: 'separator', event: 'sep-view', separator: true },
  {
    icon: 'zoom_in',
    event: 'zoom-in',
    title: t('toolbar.zoomIn'),
    disabled: !props.hasActiveDiagram || props.isDiagramReadOnly,
  },
  {
    icon: 'zoom_out',
    event: 'zoom-out',
    title: t('toolbar.zoomOut'),
    disabled: !props.hasActiveDiagram || props.isDiagramReadOnly,
  },
  {
    icon: 'more_vert',
    event: 'menu-view',
    title: t('toolbar.viewMenu'),
    disabled: !props.hasActiveDiagram,
    dropdown: [
      { icon: 'fit_screen', label: t('toolbar.fitScreen'), event: 'fit-screen' },
      { icon: 'center_focus_strong', label: t('toolbar.zoomSelection'), event: 'zoom-selection' },
      { icon: 'restart_alt', label: t('toolbar.resetZoom'), event: 'reset-view' },
      { icon: 'account_tree', label: t('toolbar.showDiagramInTree'), event: 'show-diagram-in-tree' },
    ],
  },
  { icon: 'separator', event: 'sep-service', separator: true },
  // DGTW-4060: сервисное меню развёрнуто в плоские кнопки (макет View Actions).
  // auto-layout остался вне тулбара (перенос — отдельная задача).
  ...(canUseAdvancedTools.value && hasGrant('model.runValidationScripts')
    ? [
        {
          icon: 'terminal',
          event: 'run-validation-script',
          title: t('validationScripts.toolbarRun'),
          disabled: !props.hasActiveDiagram || props.toolbarLocked,
        },
      ]
    : []),
  ...(canUseAdvancedTools.value && props.isAdmin && hasGrant('model.inspectJson')
    ? [
        {
          icon: 'data_object',
          event: 'show-diagram-json',
          title: t('toolbar.showDiagramJson'),
          disabled: !props.hasActiveDiagram,
        },
      ]
    : []),
  ...(canUseAdvancedTools.value && props.showDiagramWikiButton
    ? [
        {
          icon: 'article',
          event: 'open-diagram-doc',
          title: t('models.diagramDocumentation'),
          disabled: !props.hasActiveDiagram,
        },
      ]
    : []),
  ...(hasGrant('model.exportDiagramImage') || hasGrant('model.importOef') || hasGrant('model.export')
    ? [
        {
          icon: 'ios_share',
          event: 'menu-export',
          title: t('toolbar.exportMenu'),
          // The menu also holds model-level actions that do not need an active
          // diagram (OEF import, model package export) — keep it clickable when
          // any of those is available; items gate themselves.
          disabled:
            !props.hasActiveDiagram &&
            (!(hasGrant('model.importOef') && props.canEditModel) || props.toolbarLocked) &&
            !hasGrant('model.export'),
          dropdown: [
            ...(hasGrant('model.exportDiagramImage')
              ? [
                  {
                    icon: 'image',
                    label: t('toolbar.exportDiagramPng'),
                    event: 'export-diagram-png',
                    disabled: !props.hasActiveDiagram,
                  },
                  {
                    icon: 'code',
                    label: t('toolbar.exportDiagramSvg'),
                    event: 'export-diagram-svg',
                    disabled: !props.hasActiveDiagram,
                  },
                  {
                    icon: 'add_photo_alternate',
                    label: t('toolbar.shareDiagramImage'),
                    event: 'share-diagram-image',
                    disabled: !props.hasActiveDiagram,
                  },
                ]
              : []),
            ...(hasGrant('model.export')
              ? [
                  {
                    icon: 'download',
                    label: t('toolbar.exportModelPackage'),
                    event: 'export-model-package',
                  },
                ]
              : []),
            ...(hasGrant('model.importOef')
              ? [
                  {
                    icon: 'upload',
                    label: t('models.oefImportTitle'),
                    event: 'import-oef',
                    disabled: !props.canEditModel || props.toolbarLocked,
                  },
                ]
              : []),
          ] as ToolbarDropdownItem[],
        },
      ]
    : []),
  { icon: 'separator', event: 'sep-close', separator: true },
  {
    icon: 'link',
    event: 'copy-diagram-link',
    title: t('models.copyDiagramLink'),
    disabled: !props.hasActiveDiagram || !props.modelId,
  },
  // DGTW-4060: кнопка close-diagram удалена по макету (закрытие диаграммы — из дерева).
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

/** Версии для dropdown в info-слоте */
const isVersionMenuOpen = ref(false)
const versionMenuRef = ref<HTMLElement | null>(null)
const selectedVersion = computed(
  () => props.diagramVersions?.find(d => d.id === props.selectedDiagramId) ?? null
)

/** Имена авторов диаграмм (owner + updatedBy), резолвятся пачкой через /users/public/batch */
const authorNames = ref<Map<string, string>>(new Map())
watch(
  () =>
    (props.diagramVersions ?? [])
      .map(d => [d.ownerId, d.updatedBy])
      .flat()
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  async ids => {
    if (ids.length === 0) {
      authorNames.value = new Map()
      return
    }
    authorNames.value = await resolveOwnerDisplayNames(ids, authorNames.value, currentUser?.value ?? null, '—')
  },
  { immediate: true, deep: false }
)

function authorLabel(id?: string | null): string {
  return getOwnerDisplayNameFromMap(authorNames.value, id, '—')
}

function formatDiagramDate(value?: string | null): string {
  return formatDate(value, locale.value)
}

function selectVersion(id: string) {
  isVersionMenuOpen.value = false
  emit('selectDiagramVersion', id)
}

function onVersionMenuPointerDown(event: PointerEvent): void {
  const root = versionMenuRef.value
  if (!root || !(event.target instanceof Node) || root.contains(event.target)) return
  isVersionMenuOpen.value = false
}

function onVersionMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') isVersionMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onVersionMenuPointerDown)
  document.addEventListener('keydown', onVersionMenuKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onVersionMenuPointerDown)
  document.removeEventListener('keydown', onVersionMenuKeydown)
})

const canShowBaseline = computed(
  () =>
    hasGrant('model.createBaseline') &&
    props.hasActiveDiagram &&
    !props.isDiagramReadOnly &&
    (props.diagramVersions?.length ?? 0) >= 1
)

const canCreateBaseline = computed(() => canShowBaseline.value && !props.baselineCreating)

const canShowRelationMatrix = computed(
  () => hasGrant('model.relationMatrix') && !!props.modelId
)

const canShowDiagramCompare = computed(
  () => hasGrant('model.compareVersions') && !!props.modelId
)

const canShowValidationReport = computed(
  () => hasGrant('model.validationReport') && !!props.modelId
)

const SPECTATOR_AVATAR_COLORS = [
  '#f24726', '#ff9eb1', '#7b68ee', '#00c3a5',
  '#28a745', '#ffab00', '#2d7ff9', '#a25ddc',
]

/** Стабичный персональный цвет участника (как в Miro) по id/имени. */
function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return SPECTATOR_AVATAR_COLORS[h % SPECTATOR_AVATAR_COLORS.length]
}

function spectatorInitials(name: string): string {
  const parts = name.trim().split(/[\s.]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <DiagramEditorHeaderShell
    :canvas-mode="canvasMode"
    :hide-toolbar="hideToolbar"
    :version="modelVersion"
    :back-title="t('toolbar.backToModels')"
    @back="router.push({ name: 'models' })"
  >
    <template #toolbar>
      <div class="model-header__tools" role="toolbar">
        <DiagramCanvasSettings
          v-if="!isDiagramReadOnly"
          :buttons="canvasToggleButtons"
          :link-types="defaultLinkTypeOptions"
          :default-edge-type="defaultEdgeType"
          :disabled="!hasActiveDiagram"
          @action="emit('action', $event)"
          @update:default-edge-type="emit('update:defaultEdgeType', $event)"
        />
        <div v-if="!isDiagramReadOnly" class="model-header__tools-sep" />
        <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
      </div>
    </template>
    <template #canvas-extra>
    <div
      v-if="hasActiveDiagram && !diagramLockBlockedByOther && (diagramSpectators?.length ?? 0) > 0"
      class="model-header__spectators"
    >
      <span
        v-for="(s, i) in diagramSpectators!.slice(0, 3)"
        :key="s.userId"
        class="model-header__spectator-avatar"
        :style="{ zIndex: 3 - i, background: avatarColor(s.userId || s.displayName) }"
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
      v-if="diagramLockBlockedByOther || diagramLockLost"
      class="model-header__diagram-lock-group"
    >
      <span
        v-if="diagramLockBlockedByOther"
        class="model-header__spectator-avatar model-header__spectator-avatar--holder"
        :title="t('models.diagramLockHeldBy', { name: diagramLockHolderDisplay || '—' })"
      >{{ spectatorInitials(diagramLockHolderDisplay || '—') }}</span>
      <span
        v-else
        class="model-header__spectator-avatar model-header__spectator-avatar--holder model-header__spectator-avatar--warn"
        :title="t('models.diagramLockLost')"
      >
        <svg viewBox="0 0 16 16" fill="none" class="model-header__spectator-avatar__icon">
          <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4" />
          <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </span>
      <button
        type="button"
        class="lock-retry-btn"
        :title="t('models.diagramLockRetryEdit')"
        :aria-label="t('models.diagramLockRetryEdit')"
        @click="emit('diagramLockRetry')"
      >
        <svg viewBox="0 0 16 16" fill="none" class="lock-retry-btn__icon">
          <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9L13.5 5.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M13.5 2.5v3.2h-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
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
    </template>
    <template #title>
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
    </template>
    <template #left-extra>
      <!-- DGTW-4060: standalone-кнопка compare_arrows удалена — сравнение в меню версии
           (тот же грант model.compareVersions). -->
      <AppTooltip v-if="canShowRelationMatrix" :text="t('models.relationMatrixOpen')" placement="bottom">
        <button type="button" class="deh-icon-btn" @click="emit('openRelationMatrix')">
          <UiIcon name="grid_view" />
        </button>
      </AppTooltip>
      <AppTooltip v-if="canShowValidationReport" :text="t('models.validationReportOpen')" placement="bottom">
        <button type="button" class="deh-icon-btn" @click="emit('openValidation')">
          <UiIcon name="fact_check" />
        </button>
      </AppTooltip>
      <UnsavedBadge v-if="hasUnsavedChanges" tooltip-key="toolbar.unsavedChangesHint" />
      <AppTooltip v-if="canShare" :text="t('toolbar.shareAccess')" placement="bottom">
        <button type="button" class="deh-icon-btn" @click="emit('share')">
          <UiIcon name="share" />
        </button>
      </AppTooltip>
      <AppTooltip v-if="showModelWikiButton" :text="t('models.documentation')" placement="bottom">
        <button type="button" class="deh-icon-btn" @click="emit('action', 'open-model-doc')">
          <UiIcon name="article" />
        </button>
      </AppTooltip>
    </template>
    <template #info>
      <template v-if="diagramName">
        <template v-if="diagramVersions && diagramVersions.length > 0">
          <div ref="versionMenuRef" class="version-switch">
            <button
              type="button"
              class="version-switch__trigger"
              :title="diagramName"
              :aria-expanded="isVersionMenuOpen"
              aria-haspopup="true"
              @click="isVersionMenuOpen = !isVersionMenuOpen"
            >
              <!-- DGTW-4060: звезда избранного удалена из триггера — избранное в дереве диаграмм. -->
              <span class="version-switch__label">{{ selectedVersion?.version ?? diagramVersion }}</span>
              <UiIcon name="arrow_drop_down" class="version-switch__caret" />
            </button>
            <div v-if="isVersionMenuOpen" class="version-switch__menu" role="menu">
              <div class="version-switch__title">{{ t('models.version') }}</div>
              <div class="version-switch__meta">
                <div class="version-switch__meta-row">
                  <UiIcon name="person" class="version-switch__meta-icon" />
                  <span class="version-switch__meta-label">{{ t('models.author') }}</span>
                  <span class="version-switch__meta-value">{{ authorLabel(selectedVersion?.ownerId) }}</span>
                </div>
                <div class="version-switch__meta-row">
                  <UiIcon name="schedule" class="version-switch__meta-icon" />
                  <span class="version-switch__meta-label">{{ t('models.createdAt') }}</span>
                  <span class="version-switch__meta-value">{{ formatDiagramDate(selectedVersion?.createdAt) }}</span>
                </div>
                <div class="version-switch__meta-row">
                  <UiIcon name="edit" class="version-switch__meta-icon" />
                  <span class="version-switch__meta-label">{{ t('models.lastModified') }}</span>
                  <span class="version-switch__meta-value">
                    {{ formatDiagramDate(selectedVersion?.updatedAt) }}<template v-if="selectedVersion?.updatedBy"> · {{ authorLabel(selectedVersion.updatedBy) }}</template>
                  </span>
                </div>
              </div>
              <div class="version-switch__sep" />
              <!-- DGTW-4060: список версий скроллится сам; действия снизу закреплены и
                   всегда доступны без прокрутки. -->
              <div class="version-switch__list">
                <button
                  v-for="d in diagramVersions"
                  :key="d.id"
                  type="button"
                  class="version-switch__item"
                  :class="{ 'version-switch__item--active': d.id === selectedDiagramId }"
                  role="menuitem"
                  @click="selectVersion(d.id)"
                >
                  <UiIcon
                    v-if="d.id === selectedDiagramId"
                    name="check"
                    class="version-switch__item-check"
                  />
                  <UiIcon
                    v-else-if="isFavorite(d.id)"
                    name="favorite"
                    class="version-switch__item-fav"
                  />
                  <span>{{ d.version }}</span>
                </button>
              </div>
              <div class="version-switch__sep" />
              <button
                v-if="canShowDiagramCompare"
                type="button"
                class="version-switch__item"
                role="menuitem"
                @click="isVersionMenuOpen = false; goToDiagramCompare()"
              >
                <UiIcon name="compare_arrows" />
                <span>{{ t('models.compareDiagramVersions') }}</span>
              </button>
              <button
                v-if="canShowBaseline"
                type="button"
                class="version-switch__item"
                :disabled="!canCreateBaseline"
                role="menuitem"
                @click="isVersionMenuOpen = false; emit('createBaseline')"
              >
                <UiIcon name="bookmark_add" />
                <span>{{ t('models.createBaseline') }}</span>
              </button>
            </div>
            <span
              v-if="baselineError"
              class="model-header__baseline-error"
              :title="baselineError"
            >!</span>
          </div>
        </template>
        <template v-else-if="diagramVersion">
          <span class="model-header__version" :title="diagramName">{{ diagramVersion }}</span>
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
        <button
          v-if="newerNotationVersion"
          type="button"
          class="model-header__notation-upgrade"
          :title="t('diagram.migrateNotationTitle')"
          @click="emit('migrateNotation')"
        >
          <UiIcon name="upgrade" class="model-header__notation-upgrade-icon" />
          <span>{{ newerNotationVersion }}</span>
        </button>
      </template>
      <span v-if="notationOwnerInfo" class="model-header__info-owner">{{ notationOwnerInfo }}</span>
      <span v-if="!diagramName" class="model-header__info-muted">{{ t('models.noDiagramSelected') }}</span>
    </template>
    <template #center-extra>
      <div
        v-if="hasActiveDiagram && !diagramLockBlockedByOther && (diagramSpectators?.length ?? 0) > 0"
        class="model-header__spectators"
      >
        <span
          v-for="(s, i) in diagramSpectators!.slice(0, 3)"
          :key="s.userId"
          class="model-header__spectator-avatar"
          :style="{ zIndex: 3 - i, background: avatarColor(s.userId || s.displayName) }"
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
        v-if="diagramLockBlockedByOther || diagramLockLost"
        class="model-header__diagram-lock-group"
      >
        <span
          v-if="diagramLockBlockedByOther"
          class="model-header__spectator-avatar model-header__spectator-avatar--holder"
          :title="t('models.diagramLockHeldBy', { name: diagramLockHolderDisplay || '—' })"
        >{{ spectatorInitials(diagramLockHolderDisplay || '—') }}</span>
        <span
          v-else
          class="model-header__spectator-avatar model-header__spectator-avatar--holder model-header__spectator-avatar--warn"
          :title="t('models.diagramLockLost')"
        >
          <svg viewBox="0 0 16 16" fill="none" class="model-header__spectator-avatar__icon">
            <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4" />
            <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </span>
        <button
          type="button"
          class="lock-retry-btn"
          :title="t('models.diagramLockRetryEdit')"
          :aria-label="t('models.diagramLockRetryEdit')"
          @click="emit('diagramLockRetry')"
        >
          <svg viewBox="0 0 16 16" fill="none" class="lock-retry-btn__icon">
            <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9L13.5 5.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M13.5 2.5v3.2h-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
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
    </template>
  </DiagramEditorHeaderShell>
</template>

<style scoped>
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
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  position: relative;
  margin-left: -8px;
  cursor: default;
  transition: transform 0.15s ease;
  box-sizing: border-box;
  flex-shrink: 0;
  user-select: none;
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

/* Кружок держателя lock (редактирующий) — с белым кольцом, как выделенный в Miro */
.model-header__spectator-avatar--holder {
  margin-left: 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--warning) 60%, transparent);
}

.model-header__spectator-avatar--warn {
  background: var(--warning);
}

.model-header__spectator-avatar__icon {
  width: 13px;
  height: 13px;
}

/* Иконка-кнопка «Попробовать редактировать» */
.lock-retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  background: var(--surface);
  color: var(--primary);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, box-shadow 0.15s;
}

.lock-retry-btn:hover {
  background: color-mix(in srgb, var(--primary) 12%, var(--surface));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 25%, transparent);
}

.lock-retry-btn__icon {
  width: 14px;
  height: 14px;
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

.model-header__tools {
  display: inline-flex;
  align-items: center;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-muted);
}

.model-header__tools-sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--border);
  flex-shrink: 0;
}

.model-header__tools :deep(.icon-toolbar) {
  padding: 1px 2px;
}

.model-header__tools :deep(.icon-toolbar__btn) {
  width: 30px;
  height: 30px;
}

.model-header__tools :deep(.icon-toolbar__sep) {
  margin: 0 4px;
}

/* Diagram version & baseline in main header info */
.version-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.version-switch__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  margin: 0 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--base-text);
  font-size: 12px;
  cursor: pointer;
  max-width: 10em;
}

.version-switch__trigger:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.version-switch__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-switch__caret {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

.version-switch__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  min-width: 210px;
  padding: 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* DGTW-4060: список версий скроллится внутри себя — действия (сравнение/baseline)
   остаются закреплены внизу меню и доступны без прокрутки. */
.version-switch__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.version-switch__title {
  padding: 2px 8px 4px;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.version-switch__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px 4px;
}

.version-switch__meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
}

.version-switch__meta-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.7;
}

.version-switch__meta-label {
  color: var(--text-muted);
  flex-shrink: 0;
}

.version-switch__meta-value {
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-switch__meta-value .version-switch__meta-author {
  color: var(--text-muted);
}

.version-switch__item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.version-switch__item:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.version-switch__item--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.version-switch__item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.version-switch__item :deep(.ui-icon) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.version-switch__item-fav {
  color: var(--primary);
}

.version-switch__item-check {
  color: var(--primary);
}

.version-switch__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}

/* Legacy fallbacks (используются при отсутствии версий) */
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

.model-header__favorite-btn--active {
  background: var(--primary-soft);
  border-color: var(--primary);
}

.model-header__baseline-error {
  font-size: 12px;
  color: var(--danger);
  margin-left: 2px;
  cursor: help;
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

.model-header__version {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-subtle);
  background: var(--surface-strong);
  padding: 2px 8px;
  border-radius: 6px;
}

.model-header__notation-upgrade {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--primary);
  background: var(--primary-soft);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.model-header__notation-upgrade:hover {
  background: var(--accent-soft);
  border-color: var(--primary);
}

.model-header__notation-upgrade-icon {
  width: 13px;
  height: 13px;
}

</style>

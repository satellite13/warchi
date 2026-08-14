<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UnsavedBadge from '@/components/UnsavedBadge.vue'
import DiagramEditorHeaderShell from '@/components/layout/DiagramEditorHeaderShell.vue'
import IconToolbar, { type ToolbarButton } from './IconToolbar.vue'

const props = withDefaults(
  defineProps<{
    hasUnsavedChanges?: boolean
    notationName?: string
    notationVersion?: string
    gridVisible?: boolean
    miniMapVisible?: boolean
    snapEnabled?: boolean
    alignEnabled?: boolean
    rulersEnabled?: boolean
    canUndo?: boolean
    canRedo?: boolean
    canShare?: boolean
    canvasMode?: boolean
    hideToolbar?: boolean
    isAdmin?: boolean
    /** Wiki нотации в шапке: скрыть при доступе VIEW, если страницы ещё нет */
    showWikiButton?: boolean
  }>(),
  {
    hasUnsavedChanges: false,
    notationName: '',
    notationVersion: '',
    gridVisible: true,
    miniMapVisible: true,
    snapEnabled: false,
    alignEnabled: true,
    rulersEnabled: true,
    canUndo: false,
    canRedo: false,
    canShare: false,
    canvasMode: false,
    hideToolbar: false,
    isAdmin: false,
    showWikiButton: true,
  },
)

const router = useRouter()
const { t } = useI18n()
const toolbarButtons = computed<ToolbarButton[]>(() => [
  { icon: 'undo', event: 'undo', title: t('toolbar.undo'), disabled: !props.canUndo },
  { icon: 'redo', event: 'redo', title: t('toolbar.redo'), disabled: !props.canRedo },
  { icon: 'separator', event: 'sep1', separator: true },
  { icon: 'zoom_in', event: 'zoom-in', title: t('toolbar.zoomIn') },
  { icon: 'zoom_out', event: 'zoom-out', title: t('toolbar.zoomOut') },
  { icon: 'fit_screen', event: 'fit-screen', title: t('toolbar.fitScreen') },
  { icon: 'center_focus_strong', event: 'zoom-selection', title: t('toolbar.zoomSelection') },
  {
    icon: 'auto_awesome_mosaic',
    event: 'auto-layout-components',
    title: t('toolbar.autoLayoutComponents'),
  },
  { icon: 'restart_alt', event: 'reset-view', title: t('toolbar.resetZoom') },
  { icon: 'separator', event: 'sep2', separator: true },
  { icon: 'grid_on', event: 'toggle-grid', title: t('toolbar.grid'), active: props.gridVisible },
  {
    icon: 'map',
    event: 'toggle-minimap',
    title: t('toolbar.minimap'),
    active: props.miniMapVisible,
  },
  {
    icon: 'grid_3x3',
    event: 'toggle-snap',
    title: t('toolbar.snapToGrid'),
    active: props.snapEnabled,
  },
  {
    icon: 'align_justify_center',
    event: 'toggle-align',
    title: t('toolbar.smartAlign'),
    active: props.alignEnabled,
  },
  {
    icon: 'straighten',
    event: 'toggle-rulers',
    title: t('toolbar.rulers'),
    active: props.rulersEnabled,
  },
  { icon: 'separator', event: 'sep3', separator: true },
  {
    icon: 'grid_view',
    event: 'open-relation-rules-matrix',
    title: t('diagram.relationRulesMatrixOpen'),
  },
  { icon: 'separator', event: 'sep3b', separator: true },
  { icon: 'image', event: 'export-diagram-png', title: t('toolbar.exportDiagramPng') },
  { icon: 'code', event: 'export-diagram-svg', title: t('toolbar.exportDiagramSvg') },
  { icon: 'separator', event: 'sep4', separator: true },
  { icon: 'download', event: 'export-notation', title: t('toolbar.exportNotation') },
  { icon: 'upload', event: 'import-notation', title: t('toolbar.importNotation') },
  ...(props.isAdmin
    ? [
        { icon: 'separator', event: 'sep5', separator: true },
        { icon: 'data_object', event: 'show-attrs-json', title: t('toolbar.showAttrsJson') },
        { icon: 'separator', event: 'sep6', separator: true },
      ]
    : []),
  {
    icon: 'save',
    event: 'save',
    title: props.hasUnsavedChanges ? t('toolbar.saveWithUnsaved') : t('toolbar.save'),
    badge: props.hasUnsavedChanges,
    disabled: !props.hasUnsavedChanges,
    variant: props.hasUnsavedChanges ? 'primary' : 'default',
  },
])

const emit = defineEmits<{
  action: [event: string]
  share: []
}>()
</script>

<template>
  <DiagramEditorHeaderShell
    :canvas-mode="canvasMode"
    :hide-toolbar="hideToolbar"
    :version="notationVersion"
    :back-title="t('toolbar.backToNotations')"
    @back="router.push({ name: 'notations' })"
  >
    <template #title>
      <span class="notation-header__title">{{ notationName || t('toolbar.notationEditor') }}</span>
    </template>
    <template #left-extra>
      <UnsavedBadge v-if="hasUnsavedChanges" tooltip-key="toolbar.unsavedChangesHint" />
      <button
        v-if="canShare"
        type="button"
        class="deh-icon-btn"
        :title="t('toolbar.shareAccess')"
        @click="emit('share')"
      >
        <UiIcon name="share" />
      </button>
      <button
        v-if="showWikiButton"
        type="button"
        class="deh-icon-btn"
        :title="t('notations.documentation')"
        @click="emit('action', 'open-notation-doc')"
      >
        <UiIcon name="article" />
      </button>
    </template>
    <template #toolbar>
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
    </template>
  </DiagramEditorHeaderShell>
</template>

<style scoped>
.notation-header__title {
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>

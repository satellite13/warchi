<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppLogo from "@/components/layout/AppLogo.vue"
import UnsavedBadge from "@/components/UnsavedBadge.vue"
import IconToolbar, { type ToolbarButton } from "./IconToolbar.vue"

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
  }
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
    icon: 'format_align_center',
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
    icon: 'my_location',
    event: 'toggle-snap',
    title: t('toolbar.snapToGrid'),
    active: props.snapEnabled,
  },
  {
    icon: 'align_horizontal_left',
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
  { icon: 'image', event: 'export-diagram-png', title: t('toolbar.exportDiagramPng') },
  { icon: 'description', event: 'export-diagram-svg', title: t('toolbar.exportDiagramSvg') },
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
  <div v-if="canvasMode" class="notation-header-canvas">
    <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
  </div>
  <header v-else class="notation-header" :class="{ 'notation-header--no-toolbar': hideToolbar }">
    <div class="notation-header__left">
      <button
        type="button"
        class="back-btn"
        :title="t('toolbar.backToNotations')"
        @click="router.push({ name: 'notations' })"
      >
        <UiIcon name="arrow_back" />
      </button>
      <AppLogo size="sm" />
      <span class="notation-header__divider">/</span>
      <span class="notation-header__title">{{ notationName || t('toolbar.notationEditor') }}</span>
      <span v-if="notationVersion" class="notation-header__version">{{ notationVersion }}</span>
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
        type="button"
        class="share-btn"
        :title="t('notations.documentation')"
        @click="emit('action', 'open-notation-doc')"
      >
        <UiIcon name="article" />
      </button>
    </div>
    <div v-if="!hideToolbar" class="notation-header__center">
      <IconToolbar :buttons="toolbarButtons" @action="emit('action', $event)" />
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
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.back-btn .ui-icon {
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

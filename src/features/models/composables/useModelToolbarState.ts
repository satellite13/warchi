import { ref, computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePersistedToolbarState } from '@/composables/usePersistedToolbarState'
import type { ToolbarButton } from '@/components/layout/IconToolbar.vue'

export type EdgePathType = 'straight' | 'polyline' | 'editable-polyline' | 'bezier'

export type ModelToolbarState = {
  gridVisible: boolean
  miniMapVisible: boolean
  snapEnabled: boolean
  alignEnabled: boolean
  rulersEnabled: boolean
  lockAnchorsEnabled: boolean
  attachToOutlineEnabled: boolean
  canvasSettingsVisible: boolean
  paletteVisible: boolean
  defaultEdgeType: EdgePathType
  autoLinkInGroups: boolean
}

const STORAGE_PREFIX = 'warchi:model-editor:toolbar-state'
const VALID_EDGE_TYPES: EdgePathType[] = ['straight', 'polyline', 'editable-polyline', 'bezier']

function isEdgePathType(value: unknown): value is EdgePathType {
  return typeof value === 'string' && VALID_EDGE_TYPES.includes(value as EdgePathType)
}

export function useModelToolbarState(
  userId: Ref<string | null>,
  hasActiveDiagram: Ref<boolean>,
) {
  const { t } = useI18n()

  const gridVisible = ref(true)
  const miniMapVisible = ref(true)
  const snapEnabled = ref(false)
  const alignEnabled = ref(true)
  const rulersEnabled = ref(true)
  const lockAnchorsEnabled = ref(true)
  const attachToOutlineEnabled = ref(true)
  const selectionSyncEnabled = ref(true)
  const canvasSettingsVisible = ref(true)
  const paletteVisible = ref(true)
  const autoLinkInGroups = ref(true)
  const diagramNavigationOnlyMode = ref(false)
  const defaultEdgeType = ref<EdgePathType>('bezier')

  usePersistedToolbarState<ModelToolbarState>(
    STORAGE_PREFIX,
    userId,
    {
      gridVisible,
      miniMapVisible,
      snapEnabled,
      alignEnabled,
      rulersEnabled,
      lockAnchorsEnabled,
      attachToOutlineEnabled,
      canvasSettingsVisible,
      paletteVisible,
      defaultEdgeType,
      autoLinkInGroups,
    },
    {
      validate: {
        defaultEdgeType: isEdgePathType,
      },
    },
  )

  const canvasToggleButtons = computed<ToolbarButton[]>(() => [
    {
      icon: 'grid_on',
      event: 'toggle-grid',
      title: t('toolbar.grid'),
      active: gridVisible.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'map',
      event: 'toggle-minimap',
      title: t('toolbar.minimap'),
      active: miniMapVisible.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'grid_3x3',
      event: 'toggle-snap',
      title: t('toolbar.snapToGrid'),
      active: snapEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'align_justify_center',
      event: 'toggle-align',
      title: t('toolbar.smartAlign'),
      active: alignEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'straighten',
      event: 'toggle-rulers',
      title: t('toolbar.rulers'),
      active: rulersEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'push_pin',
      event: 'toggle-lock-anchors',
      title: t('toolbar.lockLinkAnchors'),
      active: lockAnchorsEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'route',
      event: 'toggle-outline',
      title: t('toolbar.outline'),
      active: attachToOutlineEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: 'join_inner',
      event: 'toggle-auto-link-in-groups',
      title: t('models.autoLinkInGroups'),
      active: autoLinkInGroups.value,
      disabled: !hasActiveDiagram.value,
    },
  ])

  const defaultLinkTypeOptions = computed<
    { value: EdgePathType; label: string; icon: string }[]
  >(() => [
    { value: 'straight', label: t('diagram.linkTypeStraight'), icon: 'remove' },
    { value: 'polyline', label: t('diagram.linkTypePolyline'), icon: 'timeline' },
    {
      value: 'editable-polyline',
      label: t('diagram.linkTypeEditablePolyline'),
      icon: 'polyline',
    },
    { value: 'bezier', label: t('diagram.linkTypeBezier'), icon: 'line_curve' },
  ])

  return {
    gridVisible,
    miniMapVisible,
    snapEnabled,
    alignEnabled,
    rulersEnabled,
    lockAnchorsEnabled,
    attachToOutlineEnabled,
    selectionSyncEnabled,
    canvasSettingsVisible,
    paletteVisible,
    autoLinkInGroups,
    diagramNavigationOnlyMode,
    defaultEdgeType,
    canvasToggleButtons,
    defaultLinkTypeOptions,
  }
}

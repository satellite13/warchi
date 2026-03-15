import { ref, watch, computed, type Ref } from "vue"
import { useI18n } from "vue-i18n"
import { loadJson, saveJson } from "@/utils/localStorage"
import type { ToolbarButton } from "@/features/notations/layout/IconToolbar.vue"

export type EdgePathType = "straight" | "polyline" | "editable-polyline" | "bezier"

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

const STORAGE_PREFIX = "warchi:model-editor:toolbar-state"
const VALID_EDGE_TYPES: EdgePathType[] = ["straight", "polyline", "editable-polyline", "bezier"]

function getStorageKey(userId: string | null): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:anonymous`
}

export function useModelToolbarState(
  userId: Ref<string | null>,
  hasActiveDiagram: Ref<boolean>
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
  const defaultEdgeType = ref<EdgePathType>("bezier")

  function applyState(saved: Partial<ModelToolbarState> | null) {
    if (!saved) return
    if (typeof saved.gridVisible === "boolean") gridVisible.value = saved.gridVisible
    if (typeof saved.miniMapVisible === "boolean") miniMapVisible.value = saved.miniMapVisible
    if (typeof saved.snapEnabled === "boolean") snapEnabled.value = saved.snapEnabled
    if (typeof saved.alignEnabled === "boolean") alignEnabled.value = saved.alignEnabled
    if (typeof saved.rulersEnabled === "boolean") rulersEnabled.value = saved.rulersEnabled
    if (typeof saved.lockAnchorsEnabled === "boolean")
      lockAnchorsEnabled.value = saved.lockAnchorsEnabled
    if (typeof saved.attachToOutlineEnabled === "boolean")
      attachToOutlineEnabled.value = saved.attachToOutlineEnabled
    if (typeof saved.canvasSettingsVisible === "boolean")
      canvasSettingsVisible.value = saved.canvasSettingsVisible
    if (typeof saved.paletteVisible === "boolean") paletteVisible.value = saved.paletteVisible
    if (
      typeof saved.defaultEdgeType === "string" &&
      VALID_EDGE_TYPES.includes(saved.defaultEdgeType as EdgePathType)
    ) {
      defaultEdgeType.value = saved.defaultEdgeType as EdgePathType
    }
    if (typeof saved.autoLinkInGroups === "boolean")
      autoLinkInGroups.value = saved.autoLinkInGroups
  }

  function persistState(userIdValue: string | null) {
    const next: ModelToolbarState = {
      gridVisible: gridVisible.value,
      miniMapVisible: miniMapVisible.value,
      snapEnabled: snapEnabled.value,
      alignEnabled: alignEnabled.value,
      rulersEnabled: rulersEnabled.value,
      lockAnchorsEnabled: lockAnchorsEnabled.value,
      attachToOutlineEnabled: attachToOutlineEnabled.value,
      canvasSettingsVisible: canvasSettingsVisible.value,
      paletteVisible: paletteVisible.value,
      defaultEdgeType: defaultEdgeType.value,
      autoLinkInGroups: autoLinkInGroups.value,
    }
    saveJson(getStorageKey(userIdValue), next)
  }

  watch(userId, id => applyState(loadJson<ModelToolbarState>(getStorageKey(id))), {
    immediate: true,
  })

  watch(
    [
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
      userId,
    ],
    ([, , , , , , , , , , , uid]) => {
      persistState(uid as string | null)
    }
  )

  const canvasToggleButtons = computed<ToolbarButton[]>(() => [
    {
      icon: "grid_on",
      event: "toggle-grid",
      title: t("toolbar.grid"),
      active: gridVisible.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "map",
      event: "toggle-minimap",
      title: t("toolbar.minimap"),
      active: miniMapVisible.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "my_location",
      event: "toggle-snap",
      title: t("toolbar.snapToGrid"),
      active: snapEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "align_horizontal_left",
      event: "toggle-align",
      title: t("toolbar.smartAlign"),
      active: alignEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "straighten",
      event: "toggle-rulers",
      title: t("toolbar.rulers"),
      active: rulersEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "commit",
      event: "toggle-lock-anchors",
      title: t("toolbar.lockLinkAnchors"),
      active: lockAnchorsEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "route",
      event: "toggle-outline",
      title: t("toolbar.outline"),
      active: attachToOutlineEnabled.value,
      disabled: !hasActiveDiagram.value,
    },
    {
      icon: "account_tree",
      event: "toggle-auto-link-in-groups",
      title: t("models.autoLinkInGroups"),
      active: autoLinkInGroups.value,
      disabled: !hasActiveDiagram.value,
    },
  ])

  const defaultLinkTypeOptions = computed<
    { value: EdgePathType; label: string; icon: string }[]
  >(() => [
    { value: "straight", label: t("diagram.linkTypeStraight"), icon: "remove" },
    { value: "polyline", label: t("diagram.linkTypePolyline"), icon: "timeline" },
    {
      value: "editable-polyline",
      label: t("diagram.linkTypeEditablePolyline"),
      icon: "polyline",
    },
    { value: "bezier", label: t("diagram.linkTypeBezier"), icon: "line_curve" },
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

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- Papirus integration requires dynamic runtime node access */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, useRouter, type RouteLocationNormalized } from "vue-router"
import { useI18n } from "vue-i18n"
import { apiGet } from "../../composables/useApi"
import MainLayout from "../../layouts/MainLayout.vue"
import AppFooter from "../../components/layout/AppFooter.vue"
import BaseModal from "../../components/modals/BaseModal.vue"
import ShareAccessModal from "../../components/modals/ShareAccessModal.vue"
import { ImageExporter, SvgExporter } from "@ngroznykh/papirus"
import { createId, parseLinkAttrs, parseNodeAttrs, resolveComponentByNodeType, resolveRelationByLinkType } from "./modelAttrs"
import type { EditorLink, EditorNode } from "./types"
import { useModelEditor } from "./composables/useModelEditor"
import { useAuth } from "../../composables/useAuth"
import { useCanShare } from "../../composables/useCanShare"
import ModelEditorHeader from "./components/ModelEditorHeader.vue"
import ModelMainPanelLayout from "./layout/ModelMainPanelLayout.vue"
import ModelTreePalettePanel from "./components/ModelTreePalettePanel.vue"
import ModelDiagramCanvas from "./components/ModelDiagramCanvas.vue"
import ModelPropertiesPanel from "./components/ModelPropertiesPanel.vue"
import type { ToolbarButton } from "../notations/layout/IconToolbar.vue"
import { parseEntityAttrs, parseTypeAttrs, type DiagramStyle } from "../notations/notationAttrs"
import NodeStylePanel from "../notations/components/NodeStylePanel.vue"
import { bumpMinor, compareVersions } from "../../utils/version"
import type { NotationMetaResponse } from "../../types/api"

const {
  model,
  state,
  isLoading,
  errorMessage,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadModel,
  saveChanges,
  markNodeDirty,
  markLinkDirty,
  markDiagramDirty,
  renameModel
} = useModelEditor()
const { currentUser } = useAuth()
const { t } = useI18n()

const selectedNodeId = ref<string | null>(null)
const showShareModal = ref(false)
const selectedDiagramId = ref<string | null>(null)
const selectedModelNodeIds = ref<string[]>([])
const selectedModelLinkId = ref<string | null>(null)
const selectedCanvasElementId = ref<string | null>(null)
const showNoteEditorModal = ref(false)
const editingNoteInstanceId = ref<string | null>(null)
const noteEditorText = ref("")
const diagramRenderer = ref<any>(null)
const diagramInteractionManager = ref<any>(null)
const stylePanelCollapsed = ref(true)
const rightStackRows = computed(() =>
  stylePanelCollapsed.value ? "minmax(240px, 1fr) 46px" : "minmax(240px, 1fr) minmax(320px, 1fr)"
)
const { canShare: canShareModel } = useCanShare(model, currentUser)
const diagramCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const treePanelRef = ref<InstanceType<typeof ModelTreePalettePanel> | null>(null)
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
const NOTE_NODE_PREFIX = "__diagram-note__:"
const NOTE_EDGE_PREFIX = "__diagram-note-edge__:"

type ToolbarState = {
  gridVisible: boolean
  miniMapVisible: boolean
  snapEnabled: boolean
  alignEnabled: boolean
  rulersEnabled: boolean
  lockAnchorsEnabled: boolean
  attachToOutlineEnabled: boolean
  canvasSettingsVisible: boolean
  paletteVisible: boolean
}

const TOOLBAR_STATE_STORAGE_PREFIX = "warchi:model-editor:toolbar-state"

const getToolbarStateStorageKey = (userId: string | null): string =>
  userId ? `${TOOLBAR_STATE_STORAGE_PREFIX}:${userId}` : `${TOOLBAR_STATE_STORAGE_PREFIX}:anonymous`

const readToolbarState = (userId: string | null): Partial<ToolbarState> | null => {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(getToolbarStateStorageKey(userId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ToolbarState>
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

const applyToolbarState = (stateValue: Partial<ToolbarState> | null) => {
  if (!stateValue) return
  if (typeof stateValue.gridVisible === "boolean") gridVisible.value = stateValue.gridVisible
  if (typeof stateValue.miniMapVisible === "boolean") miniMapVisible.value = stateValue.miniMapVisible
  if (typeof stateValue.snapEnabled === "boolean") snapEnabled.value = stateValue.snapEnabled
  if (typeof stateValue.alignEnabled === "boolean") alignEnabled.value = stateValue.alignEnabled
  if (typeof stateValue.rulersEnabled === "boolean") rulersEnabled.value = stateValue.rulersEnabled
  if (typeof stateValue.lockAnchorsEnabled === "boolean") lockAnchorsEnabled.value = stateValue.lockAnchorsEnabled
  if (typeof stateValue.attachToOutlineEnabled === "boolean") attachToOutlineEnabled.value = stateValue.attachToOutlineEnabled
  if (typeof stateValue.canvasSettingsVisible === "boolean") canvasSettingsVisible.value = stateValue.canvasSettingsVisible
  if (typeof stateValue.paletteVisible === "boolean") paletteVisible.value = stateValue.paletteVisible
}

const persistToolbarState = (userId: string | null) => {
  if (typeof window === "undefined") return
  const nextState: ToolbarState = {
    gridVisible: gridVisible.value,
    miniMapVisible: miniMapVisible.value,
    snapEnabled: snapEnabled.value,
    alignEnabled: alignEnabled.value,
    rulersEnabled: rulersEnabled.value,
    lockAnchorsEnabled: lockAnchorsEnabled.value,
    attachToOutlineEnabled: attachToOutlineEnabled.value,
    canvasSettingsVisible: canvasSettingsVisible.value,
    paletteVisible: paletteVisible.value
  }
  window.localStorage.setItem(getToolbarStateStorageKey(userId), JSON.stringify(nextState))
}

const canUndo = computed(() => diagramCanvasRef.value?.getCanUndo() ?? false)
const canRedo = computed(() => diagramCanvasRef.value?.getCanRedo() ?? false)
const canvasToggleButtons = computed<ToolbarButton[]>(() => [
  {
    icon: "grid_on",
    event: "toggle-grid",
    title: t("toolbar.grid"),
    active: gridVisible.value,
    disabled: !activeDiagram.value
  },
  {
    icon: "map",
    event: "toggle-minimap",
    title: t("toolbar.minimap"),
    active: miniMapVisible.value,
    disabled: !activeDiagram.value
  },
  {
    icon: "my_location",
    event: "toggle-snap",
    title: t("toolbar.snapToGrid"),
    active: snapEnabled.value,
    disabled: !activeDiagram.value
  },
  {
    icon: "align_horizontal_left",
    event: "toggle-align",
    title: t("toolbar.smartAlign"),
    active: alignEnabled.value,
    disabled: !activeDiagram.value
  },
  {
    icon: "straighten",
    event: "toggle-rulers",
    title: t("toolbar.rulers"),
    active: rulersEnabled.value,
    disabled: !activeDiagram.value
  },
  {
    icon: "commit",
    event: "toggle-lock-anchors",
    title: t("toolbar.lockLinkAnchors"),
    active: lockAnchorsEnabled.value,
    disabled: !activeDiagram.value
  },
  {
    icon: "route",
    event: "toggle-outline",
    title: t("toolbar.outline"),
    active: attachToOutlineEnabled.value,
    disabled: !activeDiagram.value
  }
])

const activeDiagram = computed(() =>
  selectedDiagramId.value
    ? state.value.diagrams.find((diagram) => diagram.id === selectedDiagramId.value && !diagram._isDeleted) ?? null
    : null
)
const activeNotationId = computed(() => activeDiagram.value?.notationId ?? null)
const fallbackNotationMeta = ref<NotationMetaResponse | null>(null)
const fallbackNotationMetaLoading = ref(false)
const fallbackNotationMetaError = ref<string | null>(null)
const activeDiagramNotationName = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return ""
  const notation = state.value.notations.find((item) => item.id === notationId)
  if (notation) return notation.name
  if (fallbackNotationMeta.value?.id === notationId) return fallbackNotationMeta.value.name
  if (fallbackNotationMetaLoading.value) return "Нотация загружается..."
  if (fallbackNotationMetaError.value) return fallbackNotationMetaError.value
  return "Нотация недоступна"
})
const activeDiagramNotationVersion = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return ""
  const notation = state.value.notations.find((item) => item.id === notationId)
  if (notation) return notation.version
  if (fallbackNotationMeta.value?.id === notationId) return fallbackNotationMeta.value.version
  return ""
})
const activeDiagramNotationOwnerLabel = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return ""
  if (fallbackNotationMeta.value?.id !== notationId) return ""
  return fallbackNotationMeta.value.ownerEmail
})
const canOpenActiveDiagramNotation = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return false
  if (state.value.notations.some((item) => item.id === notationId)) return true
  return fallbackNotationMeta.value?.id === notationId
})

watch(
  () => currentUser.value?.id ?? null,
  (userId) => {
    applyToolbarState(readToolbarState(userId))
  },
  { immediate: true }
)

watch(
  [gridVisible, miniMapVisible, snapEnabled, alignEnabled, rulersEnabled, lockAnchorsEnabled, attachToOutlineEnabled, canvasSettingsVisible, paletteVisible, () => currentUser.value?.id ?? null],
  ([, , , , , , , , , userId]) => {
    persistToolbarState(userId as string | null)
  }
)

watch(
  () => activeDiagram.value?.notationId ?? null,
  async (notationId) => {
    fallbackNotationMeta.value = null
    fallbackNotationMetaError.value = null
    fallbackNotationMetaLoading.value = false
    if (!notationId) return
    const hasNotationInState = state.value.notations.some((item) => item.id === notationId)
    if (hasNotationInState) return

    fallbackNotationMetaLoading.value = true
    const result = await apiGet<NotationMetaResponse>(`/notations/${notationId}/meta`)
    if (activeDiagram.value?.notationId !== notationId) return
    fallbackNotationMetaLoading.value = false
    if (!result.success) {
      fallbackNotationMetaError.value =
        result.error.status === 404
          ? "Метаданные нотации недоступны (backend не обновлён или нотация удалена)"
          : result.error.status === 403
            ? "Нет доступа к нотации"
            : "Не удалось загрузить нотацию"
      return
    }
    fallbackNotationMeta.value = result.data
  }
)

const selectedTreeNode = computed(() =>
  selectedNodeId.value
    ? state.value.nodes.find((node) => node.id === selectedNodeId.value && !node._isDeleted) ?? null
    : null
)
const selectedDiagramNode = computed(() =>
  selectedModelNodeIds.value.length === 1
    ? state.value.nodes.find((node) => node.id === selectedModelNodeIds.value[0] && !node._isDeleted) ?? null
    : null
)
const selectedNode = computed(() => selectedDiagramNode.value ?? selectedTreeNode.value)

const selectedLink = computed(() =>
  selectedModelLinkId.value
    ? state.value.links.find((link) => link.id === selectedModelLinkId.value && !link._isDeleted) ?? null
    : null
)

const availableNodeComponents = computed(() => {
  const notationId = activeNotationId.value
  const node = selectedNode.value
  if (!notationId || !node) return []
  return resolveComponentByNodeType(state.value.components, notationId, node.nodeTypeId)
})

const nodeBindingComponentId = computed(() => {
  const notationId = activeNotationId.value
  const node = selectedNode.value
  if (!notationId || !node) return null
  return node.parsedAttrs.notationComponents[notationId]?.componentId ?? null
})

const nodeScopedValues = computed<Record<string, unknown>>(() => {
  const notationId = activeNotationId.value
  const componentId = nodeBindingComponentId.value
  const node = selectedNode.value
  if (!notationId || !componentId || !node) return {}
  return node.parsedAttrs.componentProperties[notationId]?.[componentId] ?? {}
})

const availableLinkRelations = computed(() => {
  const notationId = activeNotationId.value
  const link = selectedLink.value
  if (!notationId || !link) return []
  return resolveRelationByLinkType(state.value.relations, notationId, link.linkTypeId)
})

const linkBindingRelationId = computed(() => {
  const notationId = activeNotationId.value
  const link = selectedLink.value
  if (!notationId || !link) return null
  return link.parsedAttrs.notationRelations[notationId]?.relationId ?? null
})

const linkScopedValues = computed<Record<string, unknown>>(() => {
  const notationId = activeNotationId.value
  const relationId = linkBindingRelationId.value
  const link = selectedLink.value
  if (!notationId || !relationId || !link) return {}
  return link.parsedAttrs.relationProperties[notationId]?.[relationId] ?? {}
})

const uiError = ref<string | null>(null)
let uiErrorTimer: ReturnType<typeof setTimeout> | null = null
const setUiError = (msg: string) => {
  if (uiErrorTimer) clearTimeout(uiErrorTimer)
  uiError.value = msg
  uiErrorTimer = setTimeout(() => {
    uiError.value = null
    uiErrorTimer = null
  }, 5000)
}

const handleRenameModel = (nextName: string) => {
  const error = renameModel(nextName)
  if (error) setUiError(error)
}
const handleOpenNotationEditor = (notationId: string) => {
  router.push({ name: "notation-editor", params: { id: notationId } })
}
const createNodeModal = ref<{ parentNodeId: string | null; kind: "folder" | "node" }>({
  parentNodeId: null,
  kind: "node"
})
const showCreateNodeModal = ref(false)
const newNodeName = ref("")
const newNodeTypeId = ref("")

const showCreateDiagramModal = ref(false)
const createDiagramNodeId = ref<string | null>(null)
const newDiagramName = ref("")
const newDiagramVersion = ref("1.0.0")
const newDiagramNotationId = ref("")

const normalizedNewDiagramName = computed(() => newDiagramName.value.trim().toLowerCase())
const normalizedNewDiagramVersion = computed(() => (newDiagramVersion.value || "1.0.0").trim())
const hasDiagramNameVersionConflict = computed(() => {
  if (!normalizedNewDiagramName.value || !normalizedNewDiagramVersion.value) return false
  return state.value.diagrams.some((diagram) => {
    if (diagram._isDeleted) return false
    return (
      diagram.name.trim().toLowerCase() === normalizedNewDiagramName.value &&
      diagram.version.trim() === normalizedNewDiagramVersion.value
    )
  })
})

watch([normalizedNewDiagramName, () => newDiagramNotationId.value], () => {
  const name = normalizedNewDiagramName.value
  const notationId = newDiagramNotationId.value
  if (!name || !notationId) return
  const matching = state.value.diagrams.filter(
    (d) => !d._isDeleted && d.name.trim().toLowerCase() === name && d.notationId === notationId
  )
  if (matching.length === 0) return
  const maxVersion = matching.reduce((max, d) => (compareVersions(d.version, max) > 0 ? d.version : max), matching[0]!.version)
  const bumped = bumpMinor(maxVersion)
  if (bumped) newDiagramVersion.value = bumped
})

const showComponentChoiceModal = ref(false)
const componentChoiceOptions = ref<{ id: string; name: string }[]>([])
const componentChoiceNodeId = ref<string | null>(null)

const showRelationChoiceModal = ref(false)
const relationChoiceOptions = ref<{ id: string; name: string; linkTypeId: string }[]>([])
const pendingConnection = ref<{
  sourceModelNodeId: string
  targetModelNodeId: string
  sourceInstanceId: string
  targetInstanceId: string
  sourcePortId?: string
  targetPortId?: string
  sourceOutlineParam?: number
  targetOutlineParam?: number
} | null>(null)

const showReuseLinkModal = ref(false)
const reuseLinkOptions = ref<EditorLink[]>([])
const pendingRelationId = ref<string | null>(null)
const showLinkDeleteModal = ref(false)
const pendingDeleteLinkId = ref<string | null>(null)
const showNodeDeleteModal = ref(false)
const pendingDeleteNodeIds = ref<string[]>([])
const pendingDeleteNodeSource = ref<"canvas" | "tree">("tree")
const showDiagramDeleteModal = ref(false)
const pendingDeleteDiagramId = ref<string | null>(null)
const showDiagramSwitchModal = ref(false)
const pendingDiagramSwitchId = ref<string | null>(null)
const pendingDiagramAction = ref<"switch" | "close" | null>(null)
const pendingDeleteNodeCount = computed(() => pendingDeleteNodeIds.value.length)
const pendingDeleteNodeSingleName = computed(() => {
  if (pendingDeleteNodeIds.value.length !== 1) return ""
  const nodeId = pendingDeleteNodeIds.value[0]
  if (!nodeId) return ""
  if (isDiagramNoteModelNodeId(nodeId)) return "Заметка"
  return state.value.nodes.find((item) => item.id === nodeId)?.name ?? ""
})
const pendingDeleteDiagramName = computed(() => {
  const diagramId = pendingDeleteDiagramId.value
  if (!diagramId) return ""
  return state.value.diagrams.find((item) => item.id === diagramId)?.name ?? ""
})

const getLinkTypeName = (linkTypeId: string): string =>
  state.value.linkTypes.find((item) => item.id === linkTypeId)?.name ?? "Неизвестный тип"

const extractLinkLabelValue = (link: EditorLink): string => {
  const notationId = activeNotationId.value
  if (!notationId) return "без метки"

  const relationId = link.parsedAttrs.notationRelations[notationId]?.relationId ?? pendingRelationId.value
  if (!relationId) return "без метки"

  const scopedValues = link.parsedAttrs.relationProperties[notationId]?.[relationId]
  if (!scopedValues) return "без метки"

  for (const key of ["label", "name", "title", "метка"]) {
    const value = scopedValues[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  for (const value of Object.values(scopedValues)) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return "без метки"
}

const formatReuseLinkOption = (link: EditorLink): string =>
  `${getLinkTypeName(link.linkTypeId)}: ${extractLinkLabelValue(link)}`

const directoryNodeType = computed(
  () => state.value.nodeTypes.find((typeItem) => typeItem.name.trim().toLowerCase() === "directory") ?? null
)
const nonDirectoryNodeTypes = computed(() =>
  state.value.nodeTypes.filter((typeItem) => typeItem.name.trim().toLowerCase() !== "directory")
)
const nodeTypeDefaultDirectoryById = computed(() => {
  const map = new Map<string, string>()
  for (const nodeType of state.value.nodeTypes) {
    const defaultDirectoryPath = parseTypeAttrs(nodeType.attrs ?? null).defaultDirectoryPath?.trim()
    if (defaultDirectoryPath) {
      map.set(nodeType.id, defaultDirectoryPath)
    }
  }
  return map
})
const createNodeModalTitle = computed(() =>
  createNodeModal.value.kind === "folder" ? t("models.createFolderTitle") : t("models.createNodeTitle")
)
const nodeTypeSearchQuery = ref("")
const nodeTypeDropdownOpen = ref(false)
const filteredNodeTypes = computed(() => {
  const query = nodeTypeSearchQuery.value.trim().toLowerCase()
  if (!query) return nonDirectoryNodeTypes.value
  return nonDirectoryNodeTypes.value.filter((t) => t.name.toLowerCase().includes(query))
})
const selectedNodeTypeName = computed(() => {
  if (!newNodeTypeId.value) return ""
  return nonDirectoryNodeTypes.value.find((t) => t.id === newNodeTypeId.value)?.name ?? ""
})

const treeRootNodeId = computed<string | null>(() => {
  const raw = model.value?.attrs
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const rootId = parsed.treeRootNodeId
    return typeof rootId === "string" && rootId.trim().length > 0 ? rootId : null
  } catch {
    return null
  }
})

const resolveTreeParentId = (parentNodeId: string | null): string | null =>
  parentNodeId ?? treeRootNodeId.value ?? null

const canCreateNodeFromModal = computed(() => {
  if (!newNodeName.value.trim()) return false
  if (createNodeModal.value.kind === "folder") return !!directoryNodeType.value
  return !!newNodeTypeId.value
})

const getNextTreeOrderForParent = (parentNodeId: string | null): number => {
  const siblingOrders = state.value.nodes
    .filter((node) => !node._isDeleted && node.parentNodeId === parentNodeId)
    .map((node) => node.parsedAttrs.treeOrder ?? 0)
  if (siblingOrders.length === 0) return 0
  return Math.max(...siblingOrders) + 1
}

const normalizeDirectoryPathSegments = (rawPath: string): string[] =>
  rawPath
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

const ensureDirectoryPath = (rawPath: string): { parentNodeId: string | null; createdDirectoryIds: string[] } => {
  const directoryTypeId = directoryNodeType.value?.id
  if (!directoryTypeId) return { parentNodeId: null, createdDirectoryIds: [] }

  const segments = normalizeDirectoryPathSegments(rawPath)
  if (segments.length === 0) return { parentNodeId: resolveTreeParentId(null), createdDirectoryIds: [] }

  let currentParentNodeId = resolveTreeParentId(null)
  const createdDirectoryIds: string[] = []

  for (const segment of segments) {
    const normalizedSegment = segment.toLowerCase()
    const existingDirectory = state.value.nodes.find((node) => {
      if (node._isDeleted) return false
      if (node.nodeTypeId !== directoryTypeId) return false
      if ((node.parentNodeId ?? null) !== (currentParentNodeId ?? null)) return false
      return node.name.trim().toLowerCase() === normalizedSegment
    })

    if (existingDirectory) {
      currentParentNodeId = existingDirectory.id
      continue
    }

    const createdDirectoryId = createId()
    state.value.nodes.push({
      id: createdDirectoryId,
      name: segment,
      modelId: state.value.modelId,
      ownerId: state.value.ownerId,
      nodeTypeId: directoryTypeId,
      parentNodeId: currentParentNodeId,
      createdAt: null,
      updatedAt: null,
      parsedAttrs: {
        ...parseNodeAttrs(null),
        treeOrder: getNextTreeOrderForParent(currentParentNodeId)
      },
      _isNew: true
    })
    createdDirectoryIds.push(createdDirectoryId)
    currentParentNodeId = createdDirectoryId
  }

  return { parentNodeId: currentParentNodeId, createdDirectoryIds }
}

const reindexTreeOrders = () => {
  const counters = new Map<string, number>()
  for (const node of state.value.nodes) {
    if (node._isDeleted) continue
    const parentKey = node.parentNodeId ?? "__root__"
    const nextOrder = counters.get(parentKey) ?? 0
    counters.set(parentKey, nextOrder + 1)
    if (node.parsedAttrs.treeOrder !== nextOrder) {
      node.parsedAttrs.treeOrder = nextOrder
      markNodeDirty(node.id)
    }
  }
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const isDiagramNoteModelNodeId = (modelNodeId: string): boolean =>
  modelNodeId.startsWith(NOTE_NODE_PREFIX)

const isDiagramOnlyEdgeModelLinkId = (modelLinkId: string): boolean =>
  modelLinkId.startsWith(NOTE_EDGE_PREFIX)

const isNoteInstance = (instance: { attrs?: Record<string, unknown> }): boolean =>
  instance.attrs?.isNote === true

const executeDiagramHistoryCommand = (command: { execute: () => void; undo: () => void }) => {
  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === "function") {
    history.execute(command)
    return
  }
  command.execute()
}

const applyDefaultCustomValues = (
  target: Record<string, unknown>,
  attrsRaw: string | null | undefined
) => {
  const customProperties = parseEntityAttrs(attrsRaw ?? null).customProperties
  for (const property of customProperties) {
    const hasOwnValue = Object.prototype.hasOwnProperty.call(target, property.name)
    if (hasOwnValue) continue
    if (property.defaultValue === undefined) continue
    target[property.name] = property.defaultValue
  }
}

const syncDefaultsOnLoad = () => {
  for (const node of state.value.nodes) {
    for (const [notationId, binding] of Object.entries(node.parsedAttrs.notationComponents)) {
      const componentId = binding.componentId
      if (!componentId) continue
      if (!node.parsedAttrs.componentProperties[notationId]) node.parsedAttrs.componentProperties[notationId] = {}
      if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
        node.parsedAttrs.componentProperties[notationId][componentId] = {}
      }
      const component = state.value.components.find(
        (item) => item.id === componentId && item.notationId === notationId
      )
      if (component) {
        const target = node.parsedAttrs.componentProperties[notationId][componentId]!
        const before = JSON.stringify(target)
        applyDefaultCustomValues(target, component.attrs)
        if (JSON.stringify(target) !== before) markNodeDirty(node.id)
      }
    }
  }
  for (const link of state.value.links) {
    for (const [notationId, binding] of Object.entries(link.parsedAttrs.notationRelations)) {
      const relationId = binding.relationId
      if (!relationId) continue
      if (!link.parsedAttrs.relationProperties[notationId]) link.parsedAttrs.relationProperties[notationId] = {}
      if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
        link.parsedAttrs.relationProperties[notationId][relationId] = {}
      }
      const relation = state.value.relations.find(
        (item) => item.id === relationId && item.notationId === notationId
      )
      if (relation) {
        const target = link.parsedAttrs.relationProperties[notationId][relationId]!
        const before = JSON.stringify(target)
        applyDefaultCustomValues(target, relation.attrs)
        if (JSON.stringify(target) !== before) markLinkDirty(link.id)
      }
    }
  }
}

const bindNodeComponent = (node: EditorNode, componentId: string) => {
  const notationId = activeNotationId.value
  if (!notationId) return
  node.parsedAttrs.notationComponents[notationId] = { componentId }
  if (!node.parsedAttrs.componentProperties[notationId]) node.parsedAttrs.componentProperties[notationId] = {}
  if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
    node.parsedAttrs.componentProperties[notationId][componentId] = {}
  }
  const component = state.value.components.find(
    (item) => item.id === componentId && item.notationId === notationId
  )
  if (component) {
    applyDefaultCustomValues(node.parsedAttrs.componentProperties[notationId][componentId]!, component.attrs)
  }
  markNodeDirty(node.id)
}

const bindLinkRelation = (link: EditorLink, relationId: string, options?: { markDirty?: boolean }) => {
  const notationId = activeNotationId.value
  if (!notationId) return
  link.parsedAttrs.notationRelations[notationId] = { relationId }
  if (!link.parsedAttrs.relationProperties[notationId]) link.parsedAttrs.relationProperties[notationId] = {}
  if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
    link.parsedAttrs.relationProperties[notationId][relationId] = {}
  }
  const relation = state.value.relations.find(
    (item) => item.id === relationId && item.notationId === notationId
  )
  if (relation) {
    applyDefaultCustomValues(link.parsedAttrs.relationProperties[notationId][relationId]!, relation.attrs)
  }
  if (options?.markDirty ?? true) {
    markLinkDirty(link.id)
  }
}

const openCreateFolder = (parentNodeId: string | null) => {
  if (!directoryNodeType.value) {
    setUiError("Тип Directory не найден. Невозможно создать папку.")
    return
  }
  createNodeModal.value = { parentNodeId: resolveTreeParentId(parentNodeId), kind: "folder" }
  newNodeName.value = ""
  newNodeTypeId.value = directoryNodeType.value.id
  uiError.value = null
  showCreateNodeModal.value = true
}

const openCreateRegularNode = (parentNodeId: string | null) => {
  if (nonDirectoryNodeTypes.value.length === 0) {
    setUiError("Нет доступных типов нод, кроме Directory.")
    return
  }
  createNodeModal.value = { parentNodeId: resolveTreeParentId(parentNodeId), kind: "node" }
  newNodeName.value = ""
  newNodeTypeId.value = nonDirectoryNodeTypes.value[0]?.id ?? ""
  nodeTypeSearchQuery.value = ""
  nodeTypeDropdownOpen.value = false
  uiError.value = null
  showCreateNodeModal.value = true
}

const createNode = () => {
  if (!newNodeName.value.trim()) return
  const nodeTypeId =
    createNodeModal.value.kind === "folder"
      ? (directoryNodeType.value?.id ?? "")
      : newNodeTypeId.value
  if (!nodeTypeId) return
  const parentNodeId = createNodeModal.value.parentNodeId ?? null
  state.value.nodes.push({
    id: createId(),
    name: newNodeName.value.trim(),
    modelId: state.value.modelId,
    ownerId: state.value.ownerId,
    nodeTypeId,
    parentNodeId,
    createdAt: null,
    updatedAt: null,
    parsedAttrs: {
      ...parseNodeAttrs(null),
      treeOrder: getNextTreeOrderForParent(parentNodeId)
    },
    _isNew: true
  })
  showCreateNodeModal.value = false
}

const openCreateDiagram = (nodeId: string) => {
  createDiagramNodeId.value = nodeId
  newDiagramName.value = ""
  newDiagramVersion.value = "1.0.0"
  newDiagramNotationId.value = state.value.notations[0]?.id ?? ""
  uiError.value = null
  showCreateDiagramModal.value = true
}

const createDiagram = () => {
  if (!createDiagramNodeId.value || !newDiagramName.value.trim() || !newDiagramNotationId.value) return
  if (hasDiagramNameVersionConflict.value) {
    setUiError("Диаграмма с таким именем и версией уже существует в модели.")
    return
  }
  uiError.value = null
  const id = createId()
  state.value.diagrams.push({
    id,
    name: newDiagramName.value.trim(),
    version: newDiagramVersion.value || "1.0.0",
    ownerId: state.value.ownerId,
    modelId: state.value.modelId,
    nodeId: createDiagramNodeId.value,
    notationId: newDiagramNotationId.value,
    createdAt: null,
    updatedAt: null,
    parsedAttrs: { instances: { nodes: [], edges: [] } },
    _isNew: true
  })
  selectedDiagramId.value = id
  showCreateDiagramModal.value = false
}

const markNodeDeleted = (nodeId: string) => {
  const node = state.value.nodes.find((item) => item.id === nodeId)
  if (!node) return

  for (const diagram of state.value.diagrams) {
    if (diagram._isDeleted) continue
    const removedInstanceIds = new Set(
      diagram.parsedAttrs.instances.nodes
        .filter((instance) => instance.modelNodeId === nodeId)
        .map((instance) => instance.id)
    )
    if (removedInstanceIds.size === 0) continue

    diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
      (instance) => !removedInstanceIds.has(instance.id)
    )
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      (edge) =>
        !removedInstanceIds.has(edge.sourceInstanceId) &&
        !removedInstanceIds.has(edge.targetInstanceId)
    )
    markDiagramDirty(diagram.id)
  }

  if (node._isNew) {
    state.value.nodes = state.value.nodes.filter((item) => item.id !== nodeId)
  } else {
    node._isDeleted = true
    node._isDirty = true
  }
  state.value.diagrams.forEach((diagram) => {
    if (diagram.nodeId !== nodeId) return
    if (diagram._isNew) {
      diagram._isDeleted = true
    } else {
      diagram._isDeleted = true
      diagram._isDirty = true
    }
  })

  selectedModelNodeIds.value = selectedModelNodeIds.value.filter((id) => id !== nodeId)
  if (selectedNodeId.value === nodeId) selectedNodeId.value = null
}

const markDiagramDeleted = (diagramId: string) => {
  const row = state.value.diagrams.find((item) => item.id === diagramId)
  if (!row) return
  if (row._isNew) {
    state.value.diagrams = state.value.diagrams.filter((item) => item.id !== diagramId)
  } else {
    row._isDeleted = true
    row._isDirty = true
  }
  if (selectedDiagramId.value === diagramId) selectedDiagramId.value = null
}

const openNodeDeleteDialog = (nodeIds: string[], source: "canvas" | "tree") => {
  if (nodeIds.length === 0) return
  pendingDeleteNodeIds.value = [...new Set(nodeIds)]
  pendingDeleteNodeSource.value = source
  showNodeDeleteModal.value = true
}

const cancelNodeDelete = () => {
  pendingDeleteNodeIds.value = []
  pendingDeleteNodeSource.value = "tree"
  showNodeDeleteModal.value = false
}

const openDiagramDeleteDialog = (diagramId: string) => {
  pendingDeleteDiagramId.value = diagramId
  showDiagramDeleteModal.value = true
}

const cancelDiagramDelete = () => {
  pendingDeleteDiagramId.value = null
  showDiagramDeleteModal.value = false
}

const markLinkDeleted = (linkId: string) => {
  const row = state.value.links.find((item) => item.id === linkId)
  if (!row) return

  if (row._isNew) {
    state.value.links = state.value.links.filter((item) => item.id !== linkId)
  } else {
    row._isDeleted = true
    row._isDirty = true
  }

  if (selectedModelLinkId.value === linkId) selectedModelLinkId.value = null
  if (selectedCanvasElementId.value?.startsWith("edge-")) selectedCanvasElementId.value = null
}

const applyDiagramSelection = (diagramId: string) => {
  selectedDiagramId.value = diagramId
  selectedModelNodeIds.value = []
  selectedModelLinkId.value = null
}

const cancelDiagramSwitch = () => {
  pendingDiagramSwitchId.value = null
  pendingDiagramAction.value = null
  showDiagramSwitchModal.value = false
}

const switchDiagramWithoutSave = async () => {
  const action = pendingDiagramAction.value
  if (!action) return

  await loadModel()
  syncDefaultsOnLoad()
  if (action === "close") {
    selectedDiagramId.value = null
    selectedModelNodeIds.value = []
    selectedModelLinkId.value = null
    cancelDiagramSwitch()
    return
  }

  const targetDiagramId = pendingDiagramSwitchId.value
  if (!targetDiagramId) {
    cancelDiagramSwitch()
    return
  }
  const restoredTarget = state.value.diagrams.find((diagram) => diagram.id === targetDiagramId && !diagram._isDeleted)
  if (!restoredTarget) {
    setUiError("Не удалось открыть выбранную диаграмму после обновления данных.")
    cancelDiagramSwitch()
    return
  }

  applyDiagramSelection(restoredTarget.id)
  cancelDiagramSwitch()
}

const isRequiredPropertyFilled = (value: unknown, type: string): boolean => {
  if (type === "boolean") return typeof value === "boolean"
  if (type === "number") return typeof value === "number" && Number.isFinite(value)
  if (typeof value === "string") return value.trim().length > 0
  return value !== null && value !== undefined
}

const validateRequiredCustomProperties = (): string | null => {
  const componentById = new Map(state.value.components.map((component) => [component.id, component]))
  const relationById = new Map(state.value.relations.map((relation) => [relation.id, relation]))

  for (const node of state.value.nodes) {
    if (node._isDeleted) continue

    for (const [notationId, binding] of Object.entries(node.parsedAttrs.notationComponents)) {
      const component = componentById.get(binding.componentId)
      if (!component || component.notationId !== notationId) continue

      const requiredProperties = parseEntityAttrs(component.attrs ?? null).customProperties.filter(
        (property) => property.required
      )
      if (requiredProperties.length === 0) continue

      const scopedValues = node.parsedAttrs.componentProperties[notationId]?.[binding.componentId] ?? {}
      for (const property of requiredProperties) {
        const value = scopedValues[property.name]
        if (!isRequiredPropertyFilled(value, property.type)) {
          return `У ноды "${node.name}" не заполнено обязательное свойство "${property.name}" (компонент "${component.name}").`
        }
      }
    }
  }

  for (const link of state.value.links) {
    if (link._isDeleted) continue

    for (const [notationId, binding] of Object.entries(link.parsedAttrs.notationRelations)) {
      const relation = relationById.get(binding.relationId)
      if (!relation || relation.notationId !== notationId) continue

      const requiredProperties = parseEntityAttrs(relation.attrs ?? null).customProperties.filter(
        (property) => property.required
      )
      if (requiredProperties.length === 0) continue

      const scopedValues = link.parsedAttrs.relationProperties[notationId]?.[binding.relationId] ?? {}
      for (const property of requiredProperties) {
        const value = scopedValues[property.name]
        if (!isRequiredPropertyFilled(value, property.type)) {
          return `У связи "${relation.name}" не заполнено обязательное свойство "${property.name}".`
        }
      }
    }
  }

  return null
}

const saveWithValidation = async (): Promise<boolean> => {
  const validationError = validateRequiredCustomProperties()
  if (validationError) {
    setUiError(validationError)
    return false
  }
  const ok = await saveChanges()
  if (ok) {
    diagramInteractionManager.value?.history?.clear?.()
  }
  return ok
}

const saveAndSwitchDiagram = async () => {
  const action = pendingDiagramAction.value
  if (!action) return
  const ok = await saveWithValidation()
  if (!ok) return
  if (action === "close") {
    selectedDiagramId.value = null
    selectedModelNodeIds.value = []
    selectedModelLinkId.value = null
    cancelDiagramSwitch()
    return
  }

  const targetDiagramId = pendingDiagramSwitchId.value
  if (!targetDiagramId) {
    cancelDiagramSwitch()
    return
  }
  applyDiagramSelection(targetDiagramId)
  cancelDiagramSwitch()
}

const selectDiagram = (diagramId: string) => {
  if (diagramId === selectedDiagramId.value) return
  if (activeDiagram.value && hasUnsavedChanges.value) {
    pendingDiagramAction.value = "switch"
    pendingDiagramSwitchId.value = diagramId
    showDiagramSwitchModal.value = true
    return
  }
  applyDiagramSelection(diagramId)
}

const cancelLinkDelete = () => {
  pendingDeleteLinkId.value = null
  showLinkDeleteModal.value = false
}

const openLinkDeleteDialog = (linkId: string) => {
  pendingDeleteLinkId.value = linkId
  showLinkDeleteModal.value = true
}

const removeLinkFromCurrentDiagram = () => {
  const linkId = pendingDeleteLinkId.value
  const diagram = activeDiagram.value
  if (!linkId || !diagram) {
    cancelLinkDelete()
    return
  }

  const removedEdges = diagram.parsedAttrs.instances.edges
    .map((edge, index) => ({ index, edge: JSON.parse(JSON.stringify(edge)) }))
    .filter((entry) => entry.edge.modelLinkId === linkId)
  if (removedEdges.length === 0) {
    cancelLinkDelete()
    return
  }

  const applyRemoval = () => {
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      (edge) => edge.modelLinkId !== linkId
    )
    if (selectedModelLinkId.value === linkId) selectedModelLinkId.value = null
    if (selectedCanvasElementId.value?.startsWith("edge-")) selectedCanvasElementId.value = null
    markDiagramDirty(diagram.id)
  }

  const restoreRemoved = () => {
    const currentEdges = [...diagram.parsedAttrs.instances.edges]
    for (const { index, edge } of removedEdges) {
      const alreadyExists = currentEdges.some((item) => item.id === edge.id)
      if (alreadyExists) continue
      const safeIndex = Math.max(0, Math.min(index, currentEdges.length))
      currentEdges.splice(safeIndex, 0, JSON.parse(JSON.stringify(edge)))
    }
    diagram.parsedAttrs.instances.edges = currentEdges
    markDiagramDirty(diagram.id)
  }

  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === "function") {
    history.execute({
      execute: applyRemoval,
      undo: restoreRemoved
    })
  } else {
    applyRemoval()
  }

  cancelLinkDelete()
}

const removeLinkFromModel = () => {
  const linkId = pendingDeleteLinkId.value
  if (!linkId) {
    cancelLinkDelete()
    return
  }

  for (const diagram of state.value.diagrams) {
    if (diagram._isDeleted) continue
    const initial = diagram.parsedAttrs.instances.edges.length
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      (edge) => edge.modelLinkId !== linkId
    )
    if (diagram.parsedAttrs.instances.edges.length !== initial) {
      markDiagramDirty(diagram.id)
    }
  }

  if (isDiagramOnlyEdgeModelLinkId(linkId)) {
    if (selectedModelLinkId.value === linkId) {
      selectedModelLinkId.value = null
      if (selectedCanvasElementId.value?.startsWith("edge-")) selectedCanvasElementId.value = null
    }
    cancelLinkDelete()
    return
  }

  markLinkDeleted(linkId)
  cancelLinkDelete()
}

const shouldSkipDeleteHotkey = (event: KeyboardEvent): boolean => {
  const target = event.target as HTMLElement | null
  if (!target) return false
  const tag = target.tagName
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

const onDeleteKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Delete" && event.key !== "Backspace") return
  if (!activeDiagram.value) return
  if (showLinkDeleteModal.value || showNodeDeleteModal.value || shouldSkipDeleteHotkey(event)) return

  if (selectedModelNodeIds.value.length > 0) {
    event.preventDefault()
    openNodeDeleteDialog(selectedModelNodeIds.value, "canvas")
    return
  }

  if (!selectedModelLinkId.value) return
  event.preventDefault()
  openLinkDeleteDialog(selectedModelLinkId.value)
}

watch(
  () => activeDiagram.value?.id ?? null,
  (diagramId) => {
    if (!diagramId) {
      selectedCanvasElementId.value = null
    }
  }
)

const setDiagramAttrs = (next: any) => {
  if (!activeDiagram.value) return
  activeDiagram.value.parsedAttrs = next
  markDiagramDirty(activeDiagram.value.id)
}

const ensureNodeBindingByNodeType = (node: EditorNode): boolean => {
  const notationId = activeNotationId.value
  if (!notationId) return false
  const existing = node.parsedAttrs.notationComponents[notationId]?.componentId
  if (existing) return true
  const options = resolveComponentByNodeType(state.value.components, notationId, node.nodeTypeId)
  if (options.length === 1) {
    bindNodeComponent(node, options[0]!.id)
    return true
  }
  if (options.length > 1) {
    componentChoiceNodeId.value = node.id
    componentChoiceOptions.value = options.map((item) => ({ id: item.id, name: item.name }))
    showComponentChoiceModal.value = true
    return false
  }
  setUiError("В выбранной нотации нет подходящего компонента для типа узла.")
  return false
}

const addExistingNodeToDiagram = (modelNodeId: string, x: number, y: number) => {
  const diagram = activeDiagram.value
  if (!diagram) return
  const node = state.value.nodes.find((item) => item.id === modelNodeId && !item._isDeleted)
  if (!node) return
  const hasBinding = ensureNodeBindingByNodeType(node)
  if (!hasBinding) {
    return
  }

  const notationId = activeNotationId.value
  const componentId = notationId
    ? node.parsedAttrs.notationComponents[notationId]?.componentId ?? null
    : null
  const component = componentId
    ? state.value.components.find((item) => item.id === componentId && item.notationId === notationId)
    : null
  const diagramStyle = component ? parseEntityAttrs(component.attrs ?? null).diagramStyle : undefined
  const width = typeof diagramStyle?.width === "number" ? diagramStyle.width : 160
  const height = typeof diagramStyle?.height === "number" ? diagramStyle.height : 56

  const nodeInstance = {
    id: createId(),
    modelNodeId,
    x,
    y,
    width,
    height,
    attrs: diagramStyle ? { diagramStyle: JSON.parse(JSON.stringify(diagramStyle)) } : undefined
  }

  executeDiagramHistoryCommand({
    execute: () => {
      const alreadyExists = diagram.parsedAttrs.instances.nodes.some((item) => item.id === nodeInstance.id)
      if (!alreadyExists) {
        diagram.parsedAttrs.instances.nodes.push(deepClone(nodeInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        (item) => item.id !== nodeInstance.id
      )
      markDiagramDirty(diagram.id)
    }
  })
}

const createNodeFromPaletteComponent = (componentId: string, x: number, y: number) => {
  const diagram = activeDiagram.value
  if (!diagram || !diagram.nodeId) {
    setUiError("Нельзя создать ноду без активной директории диаграммы.")
    return
  }
  const component = state.value.components.find((item) => item.id === componentId)
  if (!component) return
  const nodeId = createId()
  const notationId = activeNotationId.value
  const defaultDirectoryPath = nodeTypeDefaultDirectoryById.value.get(component.nodeTypeId) ?? ""
  if (defaultDirectoryPath && !directoryNodeType.value) {
    setUiError("Для автосоздания пути нужен тип узла Directory.")
    return
  }
  const parsedComponentAttrs = parseEntityAttrs(component.attrs ?? null)
  const ds = parsedComponentAttrs.diagramStyle
  const width = typeof ds?.width === "number" ? ds.width : 160
  const height = typeof ds?.height === "number" ? ds.height : 56
  const instanceId = createId()
  const newInstance = {
    id: instanceId,
    modelNodeId: nodeId,
    x,
    y,
    width,
    height,
    attrs: ds ? { diagramStyle: JSON.parse(JSON.stringify(ds)) } : undefined
  }
  let createdDirectoryIds: string[] = []

  executeDiagramHistoryCommand({
    execute: () => {
      createdDirectoryIds = []
      let parentNodeId = diagram.nodeId

      if (defaultDirectoryPath) {
        const ensuredPath = ensureDirectoryPath(defaultDirectoryPath)
        if (!ensuredPath.parentNodeId) return
        parentNodeId = ensuredPath.parentNodeId
        createdDirectoryIds = ensuredPath.createdDirectoryIds
      }

      const parsedAttrs = parseNodeAttrs(null)
      parsedAttrs.treeOrder = getNextTreeOrderForParent(parentNodeId ?? null)
      if (notationId) {
        parsedAttrs.notationComponents[notationId] = { componentId }
        const scopedDefaults: Record<string, unknown> = {}
        applyDefaultCustomValues(scopedDefaults, component.attrs)
        parsedAttrs.componentProperties[notationId] = { [componentId]: scopedDefaults }
      }

      const newNode: EditorNode = {
        id: nodeId,
        name: component.name,
        modelId: state.value.modelId,
        ownerId: state.value.ownerId,
        nodeTypeId: component.nodeTypeId,
        parentNodeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true
      }

      const hasNode = state.value.nodes.some((item) => item.id === nodeId)
      if (!hasNode) {
        state.value.nodes.push(deepClone(newNode))
      }
      const hasInstance = diagram.parsedAttrs.instances.nodes.some((item) => item.id === newInstance.id)
      if (!hasInstance) {
        diagram.parsedAttrs.instances.nodes.push(deepClone(newInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      state.value.nodes = state.value.nodes.filter(
        (item) => item.id !== nodeId && !createdDirectoryIds.includes(item.id)
      )
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        (item) => item.id !== newInstance.id
      )
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        (edge) => edge.sourceInstanceId !== newInstance.id && edge.targetInstanceId !== newInstance.id
      )
      if (selectedModelNodeIds.value.includes(nodeId)) {
        selectedModelNodeIds.value = selectedModelNodeIds.value.filter((id) => id !== nodeId)
      }
      if (selectedNodeId.value === nodeId || createdDirectoryIds.includes(selectedNodeId.value ?? "")) {
        selectedNodeId.value = null
      }
      markDiagramDirty(diagram.id)
    }
  })
}

const createDiagramNote = (x: number, y: number) => {
  const diagram = activeDiagram.value
  if (!diagram) return

  const instanceId = createId()
  const modelNodeId = `${NOTE_NODE_PREFIX}${instanceId}`
  const noteInstance = {
    id: instanceId,
    modelNodeId,
    x,
    y,
    width: 220,
    height: 120,
    attrs: {
      isNote: true,
      noteText: "Новая заметка",
      diagramStyle: {
        nodeShape: "rectangle",
        fillColor: "#fff9c4",
        strokeColor: "#e6c85b",
        strokeWidth: 1.5,
        labelColor: "#5a4600",
        labelFontSize: 13,
        labelAlign: "left",
        labelPadding: 10,
        labelPlacement: "center"
      }
    } as Record<string, unknown>
  }

  executeDiagramHistoryCommand({
    execute: () => {
      const exists = diagram.parsedAttrs.instances.nodes.some((item) => item.id === noteInstance.id)
      if (!exists) {
        diagram.parsedAttrs.instances.nodes.push(deepClone(noteInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        (item) => item.id !== noteInstance.id
      )
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        (edge) => edge.sourceInstanceId !== noteInstance.id && edge.targetInstanceId !== noteInstance.id
      )
      selectedModelNodeIds.value = selectedModelNodeIds.value.filter((id) => id !== modelNodeId)
      if (selectedCanvasElementId.value === `instance-${noteInstance.id}`) {
        selectedCanvasElementId.value = null
      }
      if (editingNoteInstanceId.value === noteInstance.id) {
        showNoteEditorModal.value = false
        editingNoteInstanceId.value = null
      }
      markDiagramDirty(diagram.id)
    }
  })
}

const startConnectNodes = (
  sourceModelNodeId: string,
  targetModelNodeId: string,
  sourceInstanceId: string,
  targetInstanceId: string,
  sourcePortId?: string,
  targetPortId?: string,
  sourceOutlineParam?: number,
  targetOutlineParam?: number
) => {
  const diagram = activeDiagram.value
  if (!diagram) return
  if (isDiagramNoteModelNodeId(sourceModelNodeId) || isDiagramNoteModelNodeId(targetModelNodeId)) {
    const modelLinkId = `${NOTE_EDGE_PREFIX}${createId()}`
    const edgeAttrs: Record<string, unknown> = {
      isDiagramOnly: true,
      diagramStyle: {
        startMarkerType: "none",
        endMarkerType: "none",
        lineDash: [4, 4]
      }
    }
    if (sourcePortId) edgeAttrs.fromPortId = sourcePortId
    if (targetPortId) edgeAttrs.toPortId = targetPortId
    if (sourceOutlineParam !== undefined) edgeAttrs.fromOutlineParam = sourceOutlineParam
    if (targetOutlineParam !== undefined) edgeAttrs.toOutlineParam = targetOutlineParam
    const noteEdgeInstance = {
      id: createId(),
      modelLinkId,
      sourceInstanceId,
      targetInstanceId,
      attrs: edgeAttrs
    }
    executeDiagramHistoryCommand({
      execute: () => {
        const hasEdge = diagram.parsedAttrs.instances.edges.some((edge) => edge.id === noteEdgeInstance.id)
        if (!hasEdge) {
          diagram.parsedAttrs.instances.edges.push(deepClone(noteEdgeInstance))
        }
        markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          (edge) => edge.id !== noteEdgeInstance.id
        )
        if (selectedModelLinkId.value === modelLinkId) {
          selectedModelLinkId.value = null
          selectedCanvasElementId.value = null
        }
        markDiagramDirty(diagram.id)
      }
    })
    return
  }

  const notationId = activeNotationId.value
  if (!notationId) return
  const sourceNode = state.value.nodes.find((item) => item.id === sourceModelNodeId)
  const targetNode = state.value.nodes.find((item) => item.id === targetModelNodeId)
  if (!sourceNode || !targetNode) return

  const sourceComponentId = sourceNode.parsedAttrs.notationComponents[notationId]?.componentId
  const targetComponentId = targetNode.parsedAttrs.notationComponents[notationId]?.componentId
  if (!sourceComponentId || !targetComponentId) {
    setUiError("Перед созданием связи нужно выбрать компоненты для обеих нод в текущей нотации.")
    return
  }

  const ruleRelationIds = state.value.relationRules
    .filter((rule) => rule.fromComponentId === sourceComponentId && rule.toComponentId === targetComponentId)
    .map((rule) => rule.relationId)
  if (ruleRelationIds.length === 0) {
    setUiError("Для этой пары компонентов нет разрешённых связей по правилам нотации.")
    return
  }
  const allowedRelations = state.value.relations.filter((relation) =>
    relation.notationId === notationId && ruleRelationIds.includes(relation.id)
  )
  if (allowedRelations.length === 0) {
    setUiError("Для этой пары компонентов нет доступных relation по правилам нотации.")
    return
  }
  pendingConnection.value = {
    sourceModelNodeId,
    targetModelNodeId,
    sourceInstanceId,
    targetInstanceId,
    sourcePortId,
    targetPortId,
    sourceOutlineParam,
    targetOutlineParam
  }
  if (allowedRelations.length === 1) {
    finalizeConnection(allowedRelations[0]!.id)
    return
  }
  relationChoiceOptions.value = allowedRelations.map((relation) => ({
    id: relation.id,
    name: relation.name,
    linkTypeId: relation.linkTypeId
  }))
  showRelationChoiceModal.value = true
}

const finalizeConnection = (relationId: string) => {
  const notationId = activeNotationId.value
  const diagram = activeDiagram.value
  const connection = pendingConnection.value
  if (!notationId || !diagram || !connection) return
  showRelationChoiceModal.value = false
  const relation = state.value.relations.find((item) => item.id === relationId)
  if (!relation) return

  const existing = state.value.links.filter((link) =>
    !link._isDeleted &&
    link.sourceId === connection.sourceModelNodeId &&
    link.targetId === connection.targetModelNodeId &&
    link.linkTypeId === relation.linkTypeId
  )
  pendingRelationId.value = relationId
  if (existing.length > 0) {
    reuseLinkOptions.value = existing
    showReuseLinkModal.value = true
    return
  }
  createOrReuseLink(null)
}

const createOrReuseLink = (linkId: string | null) => {
  const notationId = activeNotationId.value
  const diagram = activeDiagram.value
  const connection = pendingConnection.value
  const relationId = pendingRelationId.value
  if (!notationId || !diagram || !connection || !relationId) return
  const relation = state.value.relations.find((item) => item.id === relationId)
  if (!relation) return

  const isNewLink = !linkId
  const resolvedLinkId = linkId ?? createId()
  const existingLink = state.value.links.find((item) => item.id === resolvedLinkId) ?? null
  if (!isNewLink && !existingLink) return
  const previousParsedAttrs = existingLink ? deepClone(existingLink.parsedAttrs) : null
  const newLink: EditorLink | null = isNewLink
    ? {
        id: resolvedLinkId,
        sourceId: connection.sourceModelNodeId,
        targetId: connection.targetModelNodeId,
        modelId: state.value.modelId,
        ownerId: state.value.ownerId,
        linkTypeId: relation.linkTypeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs: parseLinkAttrs(null),
        _isNew: true
      }
    : null

  const relParsed = parseEntityAttrs(relation.attrs ?? null)
  const relationDs = relParsed.diagramStyle
  const edgeAttrs: Record<string, unknown> = {}
  if (relationDs) {
    edgeAttrs.diagramStyle = JSON.parse(JSON.stringify(relationDs))
  }
  if (connection.sourcePortId) {
    edgeAttrs.fromPortId = connection.sourcePortId
  }
  if (connection.targetPortId) {
    edgeAttrs.toPortId = connection.targetPortId
  }
  if (connection.sourceOutlineParam !== undefined) {
    edgeAttrs.fromOutlineParam = connection.sourceOutlineParam
  }
  if (connection.targetOutlineParam !== undefined) {
    edgeAttrs.toOutlineParam = connection.targetOutlineParam
  }
  const newEdgeInstance = {
    id: createId(),
    modelLinkId: resolvedLinkId,
    sourceInstanceId: connection.sourceInstanceId,
    targetInstanceId: connection.targetInstanceId,
    attrs: Object.keys(edgeAttrs).length ? edgeAttrs : undefined
  }

  executeDiagramHistoryCommand({
    execute: () => {
      let link = state.value.links.find((item) => item.id === resolvedLinkId) ?? null
      if (!link && newLink) {
        state.value.links.push(deepClone(newLink))
        link = state.value.links.find((item) => item.id === resolvedLinkId) ?? null
      }
      if (!link) return

      bindLinkRelation(link, relation.id)
      const hasEdge = diagram.parsedAttrs.instances.edges.some((edge) => edge.id === newEdgeInstance.id)
      if (!hasEdge) {
        diagram.parsedAttrs.instances.edges.push(deepClone(newEdgeInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        (edge) => edge.id !== newEdgeInstance.id
      )

      if (isNewLink) {
        state.value.links = state.value.links.filter((item) => item.id !== resolvedLinkId)
      } else if (previousParsedAttrs) {
        const link = state.value.links.find((item) => item.id === resolvedLinkId)
        if (link) {
          link.parsedAttrs = deepClone(previousParsedAttrs)
          markLinkDirty(link.id)
        }
      }
      markDiagramDirty(diagram.id)
    }
  })

  pendingConnection.value = null
  pendingRelationId.value = null
  showReuseLinkModal.value = false
}

const canConnect = (sourceModelNodeId: string, targetModelNodeId: string): boolean => {
  if (isDiagramNoteModelNodeId(sourceModelNodeId) || isDiagramNoteModelNodeId(targetModelNodeId)) {
    return true
  }
  const notationId = activeNotationId.value
  if (!notationId) return false
  const sourceNode = state.value.nodes.find((item) => item.id === sourceModelNodeId)
  const targetNode = state.value.nodes.find((item) => item.id === targetModelNodeId)
  if (!sourceNode || !targetNode) return false
  const sourceComponentId = sourceNode.parsedAttrs.notationComponents[notationId]?.componentId
  const targetComponentId = targetNode.parsedAttrs.notationComponents[notationId]?.componentId
  if (!sourceComponentId || !targetComponentId) return false
  return state.value.relationRules.some(
    (rule) => rule.fromComponentId === sourceComponentId && rule.toComponentId === targetComponentId
  )
}

const handleFindInTree = (modelNodeId: string) => {
  selectedNodeId.value = modelNodeId
  treePanelRef.value?.focusNode?.(modelNodeId)
}

const handleTreeSelectNode = (nodeId: string) => {
  selectedNodeId.value = nodeId
  if (!selectionSyncEnabled.value) return
  selectedModelLinkId.value = null
  selectedModelNodeIds.value = [nodeId]
  nextTick(() => {
    diagramCanvasRef.value?.zoomToSelection()
  })
}

const handleCanvasSelectNodes = (modelNodeIds: string[]) => {
  selectedModelNodeIds.value = modelNodeIds
  selectedModelLinkId.value = null
  if (!selectionSyncEnabled.value || modelNodeIds.length !== 1) return
  const modelNodeId = modelNodeIds[0]!
  if (isDiagramNoteModelNodeId(modelNodeId)) {
    selectedNodeId.value = null
    return
  }
  selectedNodeId.value = modelNodeId
  treePanelRef.value?.focusNode?.(modelNodeId)
}

const toggleSelectionSync = () => {
  selectionSyncEnabled.value = !selectionSyncEnabled.value
  if (!selectionSyncEnabled.value) return

  if (selectedModelNodeIds.value.length === 1) {
    const modelNodeId = selectedModelNodeIds.value[0]!
    selectedNodeId.value = modelNodeId
    treePanelRef.value?.focusNode?.(modelNodeId)
    return
  }

  if (selectedNodeId.value) {
    selectedModelLinkId.value = null
    selectedModelNodeIds.value = [selectedNodeId.value]
    nextTick(() => {
      diagramCanvasRef.value?.zoomToSelection()
    })
  }
}

const handleNodeLabelChange = (modelNodeId: string, newLabel: string) => {
  const node = state.value.nodes.find((item) => item.id === modelNodeId)
  if (!node || node.name === newLabel) return
  node.name = newLabel
  markNodeDirty(node.id)
}

const isDirectoryNode = (nodeId: string): boolean => {
  const node = state.value.nodes.find((item) => item.id === nodeId)
  if (!node) return false
  const nodeType = state.value.nodeTypes.find((type) => type.id === node.nodeTypeId)
  return (nodeType?.name ?? "").trim().toLowerCase() === "directory"
}

const isDescendantNode = (nodeId: string, potentialParentId: string): boolean => {
  const children = state.value.nodes.filter((item) => item.parentNodeId === potentialParentId && !item._isDeleted)
  for (const child of children) {
    if (child.id === nodeId) return true
    if (isDescendantNode(nodeId, child.id)) return true
  }
  return false
}

const handleMoveNode = (
  nodeId: string,
  targetNodeId: string | null,
  position: "above" | "below" | "inside"
) => {
  const nodes = state.value.nodes
  const fromIndex = nodes.findIndex((item) => item.id === nodeId)
  if (fromIndex < 0) return
  const movingNode = nodes[fromIndex]!

  if (targetNodeId && (targetNodeId === nodeId || isDescendantNode(targetNodeId, nodeId))) return

  const targetNode = targetNodeId ? nodes.find((item) => item.id === targetNodeId) : null
  if (targetNodeId && !targetNode) return

  let newParentNodeId: string | null
  let insertIndex: number

  if (!targetNode) {
    newParentNodeId = treeRootNodeId.value ?? null
    const rootIndices = nodes
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.id !== nodeId && !item._isDeleted && !item.parentNodeId)
      .map(({ index }) => index)
    insertIndex = rootIndices.length > 0 ? rootIndices[rootIndices.length - 1]! + 1 : nodes.length
  } else if (position === "inside" && isDirectoryNode(targetNode.id)) {
    newParentNodeId = targetNode.id
    const childIndices = nodes
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.id !== nodeId && !item._isDeleted && item.parentNodeId === targetNode.id)
      .map(({ index }) => index)
    insertIndex = childIndices.length > 0 ? childIndices[childIndices.length - 1]! + 1 : nodes.indexOf(targetNode) + 1
  } else {
    newParentNodeId = targetNode.parentNodeId ?? null
    const targetIndex = nodes.indexOf(targetNode)
    insertIndex = position === "above" ? targetIndex : targetIndex + 1
  }

  const parentChanged = movingNode.parentNodeId !== newParentNodeId
  movingNode.parentNodeId = newParentNodeId

  nodes.splice(fromIndex, 1)
  if (fromIndex < insertIndex) insertIndex -= 1
  insertIndex = Math.max(0, Math.min(insertIndex, nodes.length))
  nodes.splice(insertIndex, 0, movingNode)

  const orderChanged = fromIndex !== insertIndex
  if (parentChanged || orderChanged) {
    markNodeDirty(movingNode.id)
    reindexTreeOrders()
  }
}

const handleMoveDiagram = (diagramId: string, newNodeId: string) => {
  const diagram = state.value.diagrams.find((item) => item.id === diagramId && !item._isDeleted)
  if (!diagram) return
  if (diagram.nodeId === newNodeId) return
  diagram.nodeId = newNodeId
  markDiagramDirty(diagram.id)
}

const handleRenameNode = (nodeId: string, newName: string) => {
  const node = state.value.nodes.find((item) => item.id === nodeId)
  if (!node || node.name === newName) return
  node.name = newName
  markNodeDirty(node.id)
}

const removeNodesFromCurrentDiagram = (modelNodeIds: string[]) => {
  const diagram = activeDiagram.value
  if (!diagram || modelNodeIds.length === 0) return

  const selectedSet = new Set(modelNodeIds)
  const removedNodes = diagram.parsedAttrs.instances.nodes
    .filter((nodeInst) => selectedSet.has(nodeInst.modelNodeId))
    .map((nodeInst) => JSON.parse(JSON.stringify(nodeInst)))
  const removedInstanceIds = new Set(removedNodes.map((nodeInst) => nodeInst.id))
  if (removedInstanceIds.size === 0) return

  const removedEdges = diagram.parsedAttrs.instances.edges
    .filter(
      (edgeInst) =>
        removedInstanceIds.has(edgeInst.sourceInstanceId) ||
        removedInstanceIds.has(edgeInst.targetInstanceId)
    )
    .map((edgeInst) => JSON.parse(JSON.stringify(edgeInst)))

  const applyRemoval = () => {
    diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
      (nodeInst) => !removedInstanceIds.has(nodeInst.id)
    )
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      (edgeInst) => !removedEdges.some((removed) => removed.id === edgeInst.id)
    )
    selectedModelNodeIds.value = []
    selectedCanvasElementId.value = null
    markDiagramDirty(diagram.id)
  }

  const restoreRemoved = () => {
    const existingNodeIds = new Set(diagram.parsedAttrs.instances.nodes.map((nodeInst) => nodeInst.id))
    for (const nodeInst of removedNodes) {
      if (!existingNodeIds.has(nodeInst.id)) {
        diagram.parsedAttrs.instances.nodes.push(JSON.parse(JSON.stringify(nodeInst)))
      }
    }

    const existingEdgeIds = new Set(diagram.parsedAttrs.instances.edges.map((edgeInst) => edgeInst.id))
    for (const edgeInst of removedEdges) {
      if (!existingEdgeIds.has(edgeInst.id)) {
        diagram.parsedAttrs.instances.edges.push(JSON.parse(JSON.stringify(edgeInst)))
      }
    }

    markDiagramDirty(diagram.id)
  }

  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === "function") {
    history.execute({
      execute: applyRemoval,
      undo: restoreRemoved
    })
    return
  }

  applyRemoval()
}

const handleRequestDeleteNodeFromDiagram = (modelNodeId: string) => {
  selectedModelLinkId.value = null
  selectedModelNodeIds.value = [modelNodeId]
  openNodeDeleteDialog([modelNodeId], "canvas")
}

const openNoteEditor = (instanceId: string) => {
  const diagram = activeDiagram.value
  if (!diagram) return
  const instance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId)
  if (!instance || !isNoteInstance(instance)) return
  const currentText = instance.attrs?.noteText
  noteEditorText.value = typeof currentText === "string" ? currentText : "Новая заметка"
  editingNoteInstanceId.value = instanceId
  showNoteEditorModal.value = true
}

const saveNoteEditor = () => {
  const diagram = activeDiagram.value
  const instanceId = editingNoteInstanceId.value
  if (!diagram || !instanceId) return
  const instance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId)
  if (!instance || !isNoteInstance(instance)) return

  const nextText = noteEditorText.value.trim()
  if (!instance.attrs) instance.attrs = {}
  instance.attrs.noteText = nextText.length > 0 ? nextText : "Новая заметка"
  markDiagramDirty(diagram.id)
  showNoteEditorModal.value = false
  editingNoteInstanceId.value = null
}

const cancelNoteEditor = () => {
  showNoteEditorModal.value = false
  editingNoteInstanceId.value = null
}

const handleRequestDeleteLink = (linkId: string) => {
  selectedModelNodeIds.value = []
  selectedModelLinkId.value = linkId
  openLinkDeleteDialog(linkId)
}

const confirmNodeDelete = () => {
  const nodeIds = pendingDeleteNodeIds.value
  const source = pendingDeleteNodeSource.value
  if (nodeIds.length === 0) {
    cancelNodeDelete()
    return
  }

  if (source === "canvas") {
    removeNodesFromCurrentDiagram(nodeIds)
  } else {
    for (const nodeId of nodeIds) {
      markNodeDeleted(nodeId)
    }
  }
  cancelNodeDelete()
}

const confirmDiagramDelete = () => {
  const diagramId = pendingDeleteDiagramId.value
  if (!diagramId) {
    cancelDiagramDelete()
    return
  }
  markDiagramDeleted(diagramId)
  cancelDiagramDelete()
}

const sanitizeFileName = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

const getDiagramExportBaseName = () => {
  const modelName = model.value?.name?.trim() || "model"
  const diagramName = activeDiagram.value?.name?.trim() || "diagram"
  const modelPart = sanitizeFileName(modelName) || "model"
  const diagramPart = sanitizeFileName(diagramName) || "diagram"
  return `${modelPart}-${diagramPart}`
}

const getDiagramExportBackgroundColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--base-bg").trim() || "#ffffff"

const exportActiveDiagramAsPng = async () => {
  if (!activeDiagram.value || !diagramRenderer.value) {
    setUiError("Откройте диаграмму перед экспортом.")
    return
  }

  const exporter = new ImageExporter(diagramRenderer.value)
  await exporter.download(`${getDiagramExportBaseName()}.png`, {
    scale: 2,
    padding: 24,
    backgroundColor: getDiagramExportBackgroundColor()
  })
}

const exportActiveDiagramAsSvg = () => {
  if (!activeDiagram.value || !diagramRenderer.value) {
    setUiError("Откройте диаграмму перед экспортом.")
    return
  }

  const exporter = new SvgExporter(diagramRenderer.value)
  exporter.download(`${getDiagramExportBaseName()}.svg`, {
    includeBackground: true,
    backgroundColor: getDiagramExportBackgroundColor(),
    padding: 24
  })
}

const handleToolbarAction = async (event: string) => {
  switch (event) {
    case "save": {
      const openedBeforeSave = activeDiagram.value
        ? {
            name: activeDiagram.value.name,
            version: activeDiagram.value.version,
            nodeId: activeDiagram.value.nodeId ?? null,
            notationId: activeDiagram.value.notationId
          }
        : null
      const ok = await saveWithValidation()
      if (!ok || !openedBeforeSave) break
      const stillOpened = state.value.diagrams.some(
        (diagram) => diagram.id === selectedDiagramId.value && !diagram._isDeleted
      )
      if (stillOpened) break
      const restored = state.value.diagrams.find(
        (diagram) =>
          !diagram._isDeleted &&
          diagram.name === openedBeforeSave.name &&
          diagram.version === openedBeforeSave.version &&
          (diagram.nodeId ?? null) === openedBeforeSave.nodeId &&
          diagram.notationId === openedBeforeSave.notationId
      )
      if (restored) {
        selectedDiagramId.value = restored.id
      }
      break
    }
    case "undo":
      diagramCanvasRef.value?.undo()
      break
    case "redo":
      diagramCanvasRef.value?.redo()
      break
    case "zoom-in":
      diagramCanvasRef.value?.zoomIn()
      break
    case "zoom-out":
      diagramCanvasRef.value?.zoomOut()
      break
    case "fit-screen":
      diagramCanvasRef.value?.fitToView()
      break
    case "zoom-selection":
      diagramCanvasRef.value?.zoomToSelection()
      break
    case "auto-layout-nodes":
      diagramCanvasRef.value?.autoLayoutNodes()
      break
    case "reset-view":
      diagramCanvasRef.value?.resetView()
      break
    case "toggle-grid": {
      const next = diagramCanvasRef.value?.toggleGrid()
      if (typeof next === "boolean") {
        gridVisible.value = next
      }
      break
    }
    case "toggle-minimap": {
      const next = diagramCanvasRef.value?.toggleMiniMap()
      if (typeof next === "boolean") {
        miniMapVisible.value = next
      }
      break
    }
    case "toggle-snap": {
      const next = diagramCanvasRef.value?.toggleSnap()
      if (typeof next === "boolean") {
        snapEnabled.value = next
      }
      break
    }
    case "toggle-align": {
      const next = diagramCanvasRef.value?.toggleAlign()
      if (typeof next === "boolean") {
        alignEnabled.value = next
      }
      break
    }
    case "toggle-rulers": {
      const next = diagramCanvasRef.value?.toggleRulers()
      if (typeof next === "boolean") {
        rulersEnabled.value = next
      }
      break
    }
    case "toggle-outline": {
      attachToOutlineEnabled.value = !attachToOutlineEnabled.value
      break
    }
    case "toggle-lock-anchors": {
      const next = diagramCanvasRef.value?.toggleLockAnchors()
      if (typeof next === "boolean") lockAnchorsEnabled.value = next
      break
    }
    case "export-diagram-png":
      await exportActiveDiagramAsPng()
      break
    case "export-diagram-svg":
      exportActiveDiagramAsSvg()
      break
    case "close-diagram":
      if (activeDiagram.value && hasUnsavedChanges.value) {
        pendingDiagramAction.value = "close"
        pendingDiagramSwitchId.value = null
        showDiagramSwitchModal.value = true
        break
      }
      selectedDiagramId.value = null
      selectedModelNodeIds.value = []
      selectedModelLinkId.value = null
      break
    case "show-diagram-json":
      openDiagramJson()
      break
  }
}

const setNodeScopedValue = (key: string, value: unknown) => {
  const notationId = activeNotationId.value
  const componentId = nodeBindingComponentId.value
  const node = selectedNode.value
  if (!notationId || !componentId || !node) return
  if (!node.parsedAttrs.componentProperties[notationId]) node.parsedAttrs.componentProperties[notationId] = {}
  if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
    node.parsedAttrs.componentProperties[notationId][componentId] = {}
  }
  node.parsedAttrs.componentProperties[notationId][componentId][key] = value
  markNodeDirty(node.id)
}

const setLinkScopedValue = (key: string, value: unknown) => {
  const notationId = activeNotationId.value
  const relationId = linkBindingRelationId.value
  const link = selectedLink.value
  if (!notationId || !relationId || !link) return
  if (!link.parsedAttrs.relationProperties[notationId]) link.parsedAttrs.relationProperties[notationId] = {}
  if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
    link.parsedAttrs.relationProperties[notationId][relationId] = {}
  }
  link.parsedAttrs.relationProperties[notationId][relationId][key] = value
  markLinkDirty(link.id)
}

const handleCanvasContextChange = (ctx: {
  renderer: any
  interactionManager: any
}) => {
  diagramRenderer.value = ctx.renderer
  diagramInteractionManager.value = ctx.interactionManager
}

const handleDiagramElementStyleChange = (style: DiagramStyle) => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram) return

  let targetNodeInstance = null as (typeof diagram.parsedAttrs.instances.nodes)[number] | null
  let targetEdgeInstance = null as (typeof diagram.parsedAttrs.instances.edges)[number] | null

  if (selectedElementId?.startsWith("instance-")) {
    const instanceId = selectedElementId.slice("instance-".length)
    targetNodeInstance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId) ?? null
  } else if (selectedElementId?.startsWith("edge-")) {
    const edgeId = selectedElementId.slice("edge-".length)
    targetEdgeInstance = diagram.parsedAttrs.instances.edges.find((item) => item.id === edgeId) ?? null
  }

  if (!targetNodeInstance && !targetEdgeInstance && selectedModelNodeIds.value.length === 1) {
    const modelNodeId = selectedModelNodeIds.value[0]
    targetNodeInstance =
      diagram.parsedAttrs.instances.nodes.find((item) => item.modelNodeId === modelNodeId) ?? null
  }

  if (!targetNodeInstance && !targetEdgeInstance && selectedModelLinkId.value) {
    targetEdgeInstance =
      diagram.parsedAttrs.instances.edges.find((item) => item.modelLinkId === selectedModelLinkId.value) ?? null
  }

  if (targetNodeInstance) {
    if (!targetNodeInstance.attrs) targetNodeInstance.attrs = {}
    targetNodeInstance.attrs.diagramStyle = JSON.parse(JSON.stringify(style))
    markDiagramDirty(diagram.id)
    return
  }

  if (targetEdgeInstance) {
    if (!targetEdgeInstance.attrs) targetEdgeInstance.attrs = {}
    const baseStyle =
      targetEdgeInstance.attrs.diagramStyle && typeof targetEdgeInstance.attrs.diagramStyle === "object"
        ? (targetEdgeInstance.attrs.diagramStyle as Record<string, unknown>)
        : {}
    const currentType = (baseStyle.edgeType as string | undefined) ?? "bezier"
    const newType = (style as Record<string, unknown>).edgeType as string | undefined
    const fromPolyline = currentType === "polyline" || currentType === "editable-polyline"
    const toNonPolyline = newType === "bezier" || newType === "straight"
    targetEdgeInstance.attrs.diagramStyle = JSON.parse(JSON.stringify(style))
    if (fromPolyline && toNonPolyline && targetEdgeInstance.attrs.controlPoints) {
      delete targetEdgeInstance.attrs.controlPoints
    }
    markDiagramDirty(diagram.id)
  }
}

const selectedElementDiagramStyle = computed((): DiagramStyle | undefined => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !selectedElementId) return undefined

  if (selectedElementId.startsWith("instance-")) {
    const instanceId = selectedElementId.slice("instance-".length)
    const instance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId)
    if (instance?.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === "object") {
      return instance.attrs.diagramStyle as DiagramStyle
    }
    const notationId = activeNotationId.value
    if (!notationId) return undefined
    const modelNode = state.value.nodes.find((item) => item.id === instance?.modelNodeId)
    const componentId = modelNode?.parsedAttrs.notationComponents[notationId]?.componentId
    if (!componentId) return undefined
    const component = state.value.components.find((item) => item.id === componentId)
    if (!component) return undefined
    return parseEntityAttrs(component.attrs ?? null).diagramStyle
  }

  if (selectedElementId.startsWith("edge-")) {
    const edgeId = selectedElementId.slice("edge-".length)
    const edge = diagram.parsedAttrs.instances.edges.find((item) => item.id === edgeId)
    if (edge?.attrs?.diagramStyle && typeof edge.attrs.diagramStyle === "object") {
      return edge.attrs.diagramStyle as DiagramStyle
    }
  }

  return undefined
})

const hasDiagramStyleOverride = computed(() => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !selectedElementId) return false

  if (selectedElementId.startsWith("instance-")) {
    const instanceId = selectedElementId.slice("instance-".length)
    const instance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId)
    if (instance && isNoteInstance(instance)) return false
    return Boolean(instance?.attrs?.diagramStyle)
  }

  if (selectedElementId.startsWith("edge-")) {
    const edgeId = selectedElementId.slice("edge-".length)
    const edge = diagram.parsedAttrs.instances.edges.find((item) => item.id === edgeId)
    if (edge?.attrs?.isDiagramOnly === true) return false
    return Boolean(edge?.attrs?.diagramStyle)
  }

  return false
})

const restoreStyleFromNotation = () => {
  const diagram = activeDiagram.value
  const notationId = activeNotationId.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !notationId || !selectedElementId) return

  if (selectedElementId.startsWith("instance-")) {
    const instanceId = selectedElementId.slice("instance-".length)
    const instance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId)
    if (!instance) return
    if (isNoteInstance(instance)) return

    const modelNode = state.value.nodes.find((item) => item.id === instance.modelNodeId && !item._isDeleted)
    const componentId = modelNode?.parsedAttrs.notationComponents[notationId]?.componentId
    const component = componentId
      ? state.value.components.find((item) => item.id === componentId && item.notationId === notationId)
      : null

    if (!component) {
      setUiError("Для выбранной фигуры не найден компонент нотации.")
      return
    }

    if (instance.attrs && typeof instance.attrs === "object") {
      delete instance.attrs.diagramStyle
      if (Object.keys(instance.attrs).length === 0) delete instance.attrs
    }
    markDiagramDirty(diagram.id)
    return
  }

  if (selectedElementId.startsWith("edge-")) {
    const edgeId = selectedElementId.slice("edge-".length)
    const edge = diagram.parsedAttrs.instances.edges.find((item) => item.id === edgeId)
    if (!edge) return
    if (edge.attrs?.isDiagramOnly === true) return

    const modelLink = state.value.links.find((item) => item.id === edge.modelLinkId && !item._isDeleted)
    const relationId = modelLink?.parsedAttrs.notationRelations[notationId]?.relationId
    const relation = relationId
      ? state.value.relations.find((item) => item.id === relationId && item.notationId === notationId)
      : null

    if (!relation) {
      setUiError("Для выбранной связи не найден relation нотации.")
      return
    }

    if (edge.attrs && typeof edge.attrs === "object") {
      delete edge.attrs.diagramStyle
      if (Object.keys(edge.attrs).length === 0) delete edge.attrs
    }
    markDiagramDirty(diagram.id)
  }
}

const showDiagramJson = ref(false)
const diagramJsonContent = ref("")

const openDiagramJson = () => {
  const diagram = activeDiagram.value
  if (!diagram) return
  diagramJsonContent.value = JSON.stringify(diagram.parsedAttrs, null, 2)
  showDiagramJson.value = true
}

const copyDiagramJson = () => {
  navigator.clipboard.writeText(diagramJsonContent.value)
}

const router = useRouter()
const showLeaveDialog = ref(false)
const allowLeave = ref(false)
let pendingRoute: RouteLocationNormalized | null = null
const confirmLeave = () => {
  showLeaveDialog.value = false
  allowLeave.value = true
  if (pendingRoute) {
    const route = pendingRoute
    pendingRoute = null
    router.push(route)
  }
}
const cancelLeave = () => {
  showLeaveDialog.value = false
  pendingRoute = null
}

onBeforeRouteLeave((to, _from, next) => {
  if (allowLeave.value) {
    allowLeave.value = false
    next()
    return
  }
  if (hasUnsavedChanges.value) {
    showLeaveDialog.value = true
    pendingRoute = to
    next(false)
    return
  }
  next()
})

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    event.preventDefault()
  }
}

onMounted(async () => {
  await loadModel()
  syncDefaultsOnLoad()
  window.addEventListener("beforeunload", onBeforeUnload)
  window.addEventListener("keydown", onDeleteKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload)
  window.removeEventListener("keydown", onDeleteKeydown)
})
</script>

<template>
  <MainLayout>
    <template #header>
      <ModelEditorHeader
        hide-toolbar
        :has-unsaved-changes="hasUnsavedChanges"
        :can-save="!isSaving"
        :model-name="model?.name"
        :model-version="model?.version"
        :grid-visible="gridVisible"
        :mini-map-visible="miniMapVisible"
        :snap-enabled="snapEnabled"
        :align-enabled="alignEnabled"
        :rulers-enabled="rulersEnabled"
        :lock-anchors-enabled="lockAnchorsEnabled"
        :has-active-diagram="!!activeDiagram"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :can-share="canShareModel"
        :diagram-name="activeDiagram?.name ?? ''"
        :diagram-version="activeDiagram?.version ?? ''"
        :notation-name="activeDiagram ? activeDiagramNotationName : ''"
        :notation-id="activeDiagram?.notationId ?? ''"
        :notation-version="activeDiagram ? activeDiagramNotationVersion : ''"
        :notation-owner-info="activeDiagram ? activeDiagramNotationOwnerLabel : ''"
        :can-open-notation="canOpenActiveDiagramNotation"
        @action="handleToolbarAction"
        @rename-model="handleRenameModel"
        @share="showShareModal = true"
        @open-notation="handleOpenNotationEditor"
      />
    </template>
    <template #default>
      <ModelMainPanelLayout>
        <template #left>
          <ModelTreePalettePanel
            ref="treePanelRef"
            :nodes="state.nodes"
            :diagrams="state.diagrams"
            :node-types="state.nodeTypes"
            :tree-root-node-id="treeRootNodeId"
            :selected-node-id="selectedNodeId"
            :selected-diagram-id="selectedDiagramId"
            :model-name="model?.name"
            :sync-selection-enabled="selectionSyncEnabled"
            @select-node="handleTreeSelectNode"
            @toggle-sync-selection="toggleSelectionSync"
            @open-diagram="selectDiagram"
            @create-folder="openCreateFolder"
            @create-node="openCreateRegularNode"
            @delete-node="openNodeDeleteDialog([$event], 'tree')"
            @create-diagram="openCreateDiagram"
            @delete-diagram="openDiagramDeleteDialog"
            @move-diagram="handleMoveDiagram"
            @move-node="handleMoveNode"
            @rename-node="handleRenameNode"
          />
        </template>

        <div class="model-canvas-area">
          <template v-if="activeDiagram">
            <button
              v-if="!canvasSettingsVisible"
              type="button"
              class="canvas-settings-toggle"
              :title="t('models.showDiagramSettings')"
              @click="canvasSettingsVisible = true"
            >
              <span class="material-symbols-outlined">settings</span>
            </button>
            <div v-else class="canvas-settings">
              <div class="canvas-settings__header">
                <span class="material-symbols-outlined">tune</span>
                <span>{{ t("common.settings") }}</span>
                <button
                  type="button"
                  class="canvas-settings__hide"
                  :title="t('models.hideDiagramSettings')"
                  @click="canvasSettingsVisible = false"
                >
                  <span class="material-symbols-outlined">chevron_left</span>
                </button>
              </div>
              <div class="canvas-settings__list">
                <button
                  v-for="button in canvasToggleButtons"
                  :key="button.event"
                  type="button"
                  class="canvas-settings__item"
                  :class="{ 'canvas-settings__item--active': button.active }"
                  :title="button.title"
                  :disabled="button.disabled"
                  @click="handleToolbarAction(button.event)"
                >
                  <span class="material-symbols-outlined">{{ button.icon }}</span>
                  <span>{{ button.title }}</span>
                </button>
              </div>
            </div>
          </template>
          <div class="model-canvas-area__toolbar">
            <ModelEditorHeader
              canvas-mode
              :has-unsaved-changes="hasUnsavedChanges"
              :can-save="!isSaving"
              :model-name="model?.name"
              :model-version="model?.version"
              :grid-visible="gridVisible"
              :mini-map-visible="miniMapVisible"
              :snap-enabled="snapEnabled"
              :align-enabled="alignEnabled"
              :rulers-enabled="rulersEnabled"
              :lock-anchors-enabled="lockAnchorsEnabled"
              :has-active-diagram="!!activeDiagram"
              :can-undo="canUndo"
              :can-redo="canRedo"
              :can-share="canShareModel"
              :can-open-notation="canOpenActiveDiagramNotation"
              @action="handleToolbarAction"
              @rename-model="handleRenameModel"
              @share="showShareModal = true"
              @open-notation="handleOpenNotationEditor"
            />
          </div>
          <ModelDiagramCanvas
            ref="diagramCanvasRef"
            :active-diagram="activeDiagram"
            :nodes="state.nodes"
            :links="state.links"
            :relations="state.relations"
            :components="state.components"
            :node-types="state.nodeTypes"
            :grid-visible="gridVisible"
            :mini-map-visible="miniMapVisible"
            :snap-enabled="snapEnabled"
            :align-enabled="alignEnabled"
            :rulers-enabled="rulersEnabled"
            :palette-visible="paletteVisible"
            :lock-anchors-enabled="lockAnchorsEnabled"
            :attach-to-outline-enabled="attachToOutlineEnabled"
            :selected-model-node-ids="selectedModelNodeIds"
            :selected-model-link-id="selectedModelLinkId"
            :connection-validator="canConnect"
            @update-diagram="setDiagramAttrs"
            @select-nodes="handleCanvasSelectNodes"
            @select-link="selectedModelLinkId = $event; selectedModelNodeIds = []; selectedNodeId = null"
            @create-node-from-component="createNodeFromPaletteComponent"
            @create-note="createDiagramNote"
            @add-existing-node="addExistingNodeToDiagram"
            @connect-nodes="startConnectNodes"
            @find-in-tree="handleFindInTree"
            @node-label-change="handleNodeLabelChange"
            @request-delete-node-from-diagram="handleRequestDeleteNodeFromDiagram"
            @request-edit-note="openNoteEditor"
            @request-delete-link="handleRequestDeleteLink"
            @select-canvas-element-id="selectedCanvasElementId = $event"
            @canvas-context-change="handleCanvasContextChange"
            @palette-visible-change="paletteVisible = $event"
          />
        </div>

        <template #right>
          <div class="model-right-stack" :style="{ gridTemplateRows: rightStackRows }">
            <div class="model-right-stack__top">
              <ModelPropertiesPanel
                :active-notation-id="activeNotationId"
                :selected-node="selectedNode"
                :selected-link="selectedLink"
                :node-binding-component-id="nodeBindingComponentId"
                :link-binding-relation-id="linkBindingRelationId"
                :available-components="availableNodeComponents"
                :available-relations="availableLinkRelations"
                :node-scoped-values="nodeScopedValues"
                :link-scoped-values="linkScopedValues"
                @bind-node-component="selectedNode && bindNodeComponent(selectedNode, $event)"
                @bind-link-relation="selectedLink && bindLinkRelation(selectedLink, $event)"
                @set-node-scoped-value="setNodeScopedValue"
                @set-link-scoped-value="setLinkScopedValue"
              />
            </div>
            <div class="model-right-stack__bottom" :class="{ 'model-right-stack__bottom--collapsed': stylePanelCollapsed }">
              <NodeStylePanel
                :selected-element-id="selectedCanvasElementId"
                :interaction-manager="diagramInteractionManager"
                :renderer="diagramRenderer"
                :current-diagram-style="selectedElementDiagramStyle"
                :show-panel-actions="true"
                :style-panel-collapsed="stylePanelCollapsed"
                :can-restore-style="hasDiagramStyleOverride"
                @style-change="handleDiagramElementStyleChange"
                @restore-style="restoreStyleFromNotation"
                @toggle-collapse="stylePanelCollapsed = !stylePanelCollapsed"
              />
            </div>
          </div>
        </template>
      </ModelMainPanelLayout>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>

  <Teleport to="body">
    <Transition name="toast">
      <div v-if="isSaving" class="save-toast save-toast--progress">
        <span class="material-symbols-outlined save-toast__icon spin">sync</span>
        <span>{{ saveProgress || t("common.saving") }}</span>
      </div>
      <div v-else-if="saveSuccess" class="save-toast save-toast--success">
        <span class="material-symbols-outlined save-toast__icon">check_circle</span>
        <span>{{ t("common.saved") }}</span>
      </div>
      <div v-else-if="saveError || uiError" class="save-toast save-toast--error">
        <span class="material-symbols-outlined save-toast__icon">error</span>
        <span>{{ saveError || uiError }}</span>
      </div>
    </Transition>
  </Teleport>

  <BaseModal v-if="showCreateNodeModal" :title="createNodeModalTitle" max-width="440px" @close="showCreateNodeModal = false">
    <div class="form-grid">
      <label>
        <span>{{ t("common.name") }}</span>
        <input
          v-model="newNodeName"
          class="field-input"
          :placeholder="createNodeModal.kind === 'folder' ? t('models.newFolderPlaceholder') : t('models.newNodePlaceholder')"
          @keydown.enter.prevent="canCreateNodeFromModal && createNode()"
        >
      </label>
      <div v-if="createNodeModal.kind === 'node'" class="node-type-dropdown">
        <span class="node-type-dropdown__label">{{ t("models.nodeTypeLabel") }}</span>
        <div class="node-type-dropdown__control" @click="nodeTypeDropdownOpen = !nodeTypeDropdownOpen">
          <span class="node-type-dropdown__value">{{ selectedNodeTypeName || t("models.selectType") }}</span>
          <span class="material-symbols-outlined node-type-dropdown__arrow">
            {{ nodeTypeDropdownOpen ? 'expand_less' : 'expand_more' }}
          </span>
        </div>
        <div v-if="nodeTypeDropdownOpen" class="node-type-dropdown__panel">
          <input
            v-model="nodeTypeSearchQuery"
            class="node-type-dropdown__search"
            type="text"
            :placeholder="t('models.typeSearchPlaceholder')"
            @click.stop
          >
          <div class="node-type-dropdown__list">
            <button
              v-for="typeItem in filteredNodeTypes"
              :key="typeItem.id"
              type="button"
              class="node-type-dropdown__item"
              :class="{ 'node-type-dropdown__item--active': newNodeTypeId === typeItem.id }"
              @click="newNodeTypeId = typeItem.id; nodeTypeDropdownOpen = false"
            >
              {{ typeItem.name }}
            </button>
            <div v-if="filteredNodeTypes.length === 0" class="node-type-dropdown__empty">
              {{ t("common.nothingFound") }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="form-hint">{{ t("models.directoryTypeHint") }}</div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="showCreateNodeModal = false">{{ t("common.cancel") }}</button>
      <button type="button" class="btn btn--primary" :disabled="!canCreateNodeFromModal" @click="createNode">
        {{ t("common.create") }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showNoteEditorModal"
    :title="t('diagram.editNote')"
    max-width="560px"
    @close="cancelNoteEditor"
  >
    <div class="form-grid">
      <label>
        <span>{{ t("models.noteTextLabel") }}</span>
        <textarea
          v-model="noteEditorText"
          class="field-textarea"
          rows="8"
          :placeholder="t('models.noteTextPlaceholder')"
        />
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelNoteEditor">{{ t("common.cancel") }}</button>
      <button type="button" class="btn btn--primary" @click="saveNoteEditor">{{ t("common.save") }}</button>
    </template>
  </BaseModal>

  <BaseModal v-if="showCreateDiagramModal" :title="t('models.createDiagramTitle')" max-width="460px" @close="showCreateDiagramModal = false">
    <div class="form-grid">
      <label>
        <span>{{ t("common.name") }}</span>
        <input v-model="newDiagramName" class="field-input" :placeholder="t('models.newDiagramPlaceholder')">
      </label>
      <label>
        <span>{{ t("common.version") }}</span>
        <input v-model="newDiagramVersion" class="field-input" placeholder="1.0.0">
      </label>
      <label>
        <span>{{ t("models.notationLabel") }}</span>
        <select v-model="newDiagramNotationId" class="field-input">
          <option v-for="notation in state.notations" :key="notation.id" :value="notation.id">
            {{ notation.name }} ({{ notation.version }})
          </option>
        </select>
      </label>
      <div v-if="hasDiagramNameVersionConflict" class="form-error-text">
        {{ t("models.diagramConflictMessage") }}
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="showCreateDiagramModal = false">{{ t("common.cancel") }}</button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="hasDiagramNameVersionConflict"
        @click="createDiagram"
      >
        {{ t("common.create") }}
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showComponentChoiceModal" :title="t('diagram.selectComponent')" max-width="420px" @close="showComponentChoiceModal = false">
    <div class="choice-list">
      <button
        v-for="option in componentChoiceOptions"
        :key="option.id"
        type="button"
        class="choice-item"
        @click="
          componentChoiceNodeId &&
          state.nodes.find((node) => node.id === componentChoiceNodeId) &&
          bindNodeComponent(state.nodes.find((node) => node.id === componentChoiceNodeId)!, option.id);
          showComponentChoiceModal = false
        "
      >
        {{ option.name }}
      </button>
    </div>
  </BaseModal>

  <BaseModal v-if="showRelationChoiceModal" :title="t('diagram.selectRelation')" max-width="420px" @close="showRelationChoiceModal = false">
    <div class="choice-list">
      <button
        v-for="option in relationChoiceOptions"
        :key="option.id"
        type="button"
        class="choice-item"
        @click="finalizeConnection(option.id)"
      >
        {{ option.name }}
      </button>
    </div>
  </BaseModal>

  <BaseModal v-if="showReuseLinkModal" :title="t('models.existingLinksFoundTitle')" max-width="500px" @close="showReuseLinkModal = false">
    <div class="choice-list">
      <button
        v-for="link in reuseLinkOptions"
        :key="link.id"
        type="button"
        class="choice-item"
        @click="createOrReuseLink(link.id)"
      >
        {{ t("models.useExistingLink", { link: formatReuseLinkOption(link) }) }}
      </button>
      <button type="button" class="choice-item choice-item--primary" @click="createOrReuseLink(null)">
        {{ t("models.createNewLink") }}
      </button>
    </div>
  </BaseModal>

  <BaseModal
    v-if="showDiagramSwitchModal"
    :title="t('models.unsavedChangesTitle')"
    max-width="500px"
    @close="cancelDiagramSwitch"
  >
    <p class="leave-text">
      {{
        pendingDiagramAction === "close"
          ? t("models.saveBeforeCloseDiagram")
          : t("models.saveBeforeSwitchDiagram")
      }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelDiagramSwitch">{{ t("common.cancel") }}</button>
      <button type="button" class="btn btn--secondary" :disabled="isLoading || isSaving" @click="switchDiagramWithoutSave">
        {{ t("models.dontSave") }}
      </button>
      <button type="button" class="btn btn--primary" :disabled="isSaving" @click="saveAndSwitchDiagram">
        {{ pendingDiagramAction === "close" ? t("models.saveAndClose") : t("models.saveAndSwitch") }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showNodeDeleteModal"
    :title="t('models.deleteNodeTitle')"
    max-width="500px"
    @close="cancelNodeDelete"
  >
    <p class="leave-text">
      <template v-if="pendingDeleteNodeSource === 'canvas'">
        <template v-if="pendingDeleteNodeCount === 1">
          {{ t("models.deleteNodeFromDiagramSingle", { name: pendingDeleteNodeSingleName || t("common.unnamed") }) }}
        </template>
        <template v-else>
          {{ t("models.deleteNodeFromDiagramMultiple", { count: pendingDeleteNodeCount }) }}
        </template>
      </template>
      <template v-else>
        <template v-if="pendingDeleteNodeCount === 1">
          {{ t("models.deleteNodeFromModelSingle", { name: pendingDeleteNodeSingleName || t("common.unnamed") }) }}
        </template>
        <template v-else>
          {{ t("models.deleteNodeFromModelMultiple", { count: pendingDeleteNodeCount }) }}
        </template>
      </template>
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelNodeDelete">{{ t("common.cancel") }}</button>
      <button type="button" class="btn btn--danger" @click="confirmNodeDelete">{{ t("common.delete") }}</button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showDiagramDeleteModal"
    :title="t('models.deleteDiagramTitle')"
    max-width="500px"
    @close="cancelDiagramDelete"
  >
    <p class="leave-text">
      {{ t("models.deleteDiagramConfirm", { name: pendingDeleteDiagramName || t("common.unnamed") }) }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelDiagramDelete">{{ t("common.cancel") }}</button>
      <button type="button" class="btn btn--danger" @click="confirmDiagramDelete">{{ t("common.delete") }}</button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showLinkDeleteModal"
    :title="t('models.deleteLinkTitle')"
    max-width="500px"
    @close="cancelLinkDelete"
  >
    <p class="leave-text">
      {{ t("models.deleteLinkQuestion") }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLinkDelete">{{ t("common.cancel") }}</button>
      <button type="button" class="btn btn--secondary" @click="removeLinkFromCurrentDiagram">
        {{ t("models.removeLinkFromDiagram") }}
      </button>
      <button
        v-if="pendingDeleteLinkId && !isDiagramOnlyEdgeModelLinkId(pendingDeleteLinkId)"
        type="button"
        class="btn btn--danger"
        @click="removeLinkFromModel"
      >
        {{ t("models.removeLinkFromModel") }}
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showLeaveDialog" :title="t('models.unsavedChangesTitle')" max-width="400px" @close="cancelLeave">
    <p class="leave-text">
      {{ t("models.leaveUnsavedText") }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLeave">{{ t("models.stay") }}</button>
      <button type="button" class="btn btn--danger" @click="confirmLeave">{{ t("models.leave") }}</button>
    </template>
  </BaseModal>

  <BaseModal v-if="showDiagramJson" :title="t('models.diagramJsonTitle')" max-width="600px" @close="showDiagramJson = false">
    <pre class="json-viewer">{{ diagramJsonContent }}</pre>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="copyDiagramJson">{{ t("models.copy") }}</button>
      <button type="button" class="btn btn--secondary" @click="showDiagramJson = false">{{ t("common.close") }}</button>
    </template>
  </BaseModal>

  <ShareAccessModal
    v-if="showShareModal && model"
    :title="t('models.accessTitle')"
    resource-type="MODEL"
    :resource-id="model.id"
    @close="showShareModal = false"
  />

  <div v-if="isLoading" class="overlay-loading">{{ t("common.loading") }}</div>
  <div v-else-if="errorMessage" class="overlay-loading overlay-loading--error">{{ errorMessage }}</div>
</template>

<style scoped>
.overlay-loading {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 2000;
  font-size: 16px;
}

.overlay-loading--error {
  color: var(--danger);
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.field-input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.field-textarea {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 140px;
}

.form-error-text {
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border: 1px solid rgba(220, 53, 69, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.btn {
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
}

.btn:disabled {
  opacity: 0.6;
}

.btn--secondary {
  background: var(--surface-strong);
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}

.choice-item--primary {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.leave-text {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.json-viewer {
  margin: 0;
  padding: 12px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 420px;
  overflow: auto;
}

.model-right-stack {
  height: 100%;
  min-height: 0;
  display: grid;
}

.model-canvas-area {
  position: relative;
  height: 100%;
  min-height: 0;
}

.canvas-settings-toggle {
  position: absolute;
  left: 6px;
  top: 10px;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 12;
}

.canvas-settings-toggle:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

.canvas-settings {
  position: absolute;
  left: 6px;
  top: 10px;
  width: 196px;
  padding: 8px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 12;
}

.canvas-settings__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
}

.canvas-settings__header .material-symbols-outlined {
  font-size: 14px;
}

.canvas-settings__hide {
  position: absolute;
  left: -1px;
  top: -1px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 10px 0 8px 0;
  background: var(--surface);
  color: var(--text-subtle);
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.canvas-settings__hide .material-symbols-outlined {
  font-size: 16px;
}

.canvas-settings__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.canvas-settings__item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 7px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.canvas-settings__item:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.canvas-settings__item--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.canvas-settings__item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.canvas-settings__item .material-symbols-outlined {
  font-size: 16px;
}

.model-canvas-area__toolbar {
  position: absolute;
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  pointer-events: none;
}

.model-canvas-area__toolbar :deep(*) {
  pointer-events: auto;
}

.model-right-stack__top,
.model-right-stack__bottom {
  min-height: 0;
  overflow: hidden;
}

.model-right-stack__bottom {
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.model-right-stack__bottom--collapsed {
  min-height: 46px;
}

.save-toast {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  z-index: 2100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.save-toast--progress {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.save-toast--success {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid rgba(43, 184, 150, 0.2);
}

.save-toast--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger-soft);
}

.save-toast__icon {
  font-size: 20px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.node-type-dropdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.node-type-dropdown__label {
  font-size: 12px;
  color: var(--text-muted);
}

.node-type-dropdown__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  cursor: pointer;
  background: var(--surface);
}

.node-type-dropdown__control:hover {
  border-color: var(--primary);
}

.node-type-dropdown__value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-type-dropdown__arrow {
  font-size: 18px;
  color: var(--text-subtle);
}

.node-type-dropdown__panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  margin-top: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.node-type-dropdown__search {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  background: var(--surface-muted);
}

.node-type-dropdown__list {
  max-height: 160px;
  overflow: auto;
  padding: 4px;
}

.node-type-dropdown__item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
}

.node-type-dropdown__item:hover {
  background: var(--surface-strong);
}

.node-type-dropdown__item--active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 500;
}

.node-type-dropdown__empty {
  padding: 8px;
  font-size: 12px;
  color: var(--text-subtle);
  text-align: center;
}
</style>

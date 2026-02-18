<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, useRouter, type RouteLocationNormalized } from "vue-router"
import MainLayout from "../../layouts/MainLayout.vue"
import AppFooter from "../../components/layout/AppFooter.vue"
import BaseModal from "../../components/modals/BaseModal.vue"
import { createId, parseLinkAttrs, parseNodeAttrs, resolveComponentByNodeType, resolveRelationByLinkType } from "./modelAttrs"
import type { EditorLink, EditorNode } from "./types"
import { useModelEditor } from "./composables/useModelEditor"
import ModelEditorHeader from "./components/ModelEditorHeader.vue"
import ModelMainPanelLayout from "./layout/ModelMainPanelLayout.vue"
import ModelTreePalettePanel from "./components/ModelTreePalettePanel.vue"
import ModelDiagramCanvas from "./components/ModelDiagramCanvas.vue"
import ModelPropertiesPanel from "./components/ModelPropertiesPanel.vue"
import { parseEntityAttrs, type DiagramStyle } from "../notations/notationAttrs"
import NodeStylePanel from "../notations/components/NodeStylePanel.vue"
import { bumpMinor, compareVersions } from "../../utils/version"

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
  markDiagramDirty
} = useModelEditor()

const selectedNodeId = ref<string | null>(null)
const selectedDiagramId = ref<string | null>(null)
const selectedModelNodeIds = ref<string[]>([])
const selectedModelLinkId = ref<string | null>(null)
const selectedCanvasElementId = ref<string | null>(null)
const diagramRenderer = ref<any>(null)
const diagramInteractionManager = ref<any>(null)
const stylePanelCollapsed = ref(true)
const rightStackRows = computed(() =>
  stylePanelCollapsed.value ? "minmax(240px, 1fr) 46px" : "minmax(240px, 1fr) minmax(320px, 1fr)"
)
const diagramCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const treePanelRef = ref<InstanceType<typeof ModelTreePalettePanel> | null>(null)
const gridVisible = ref(true)
const miniMapVisible = ref(true)
const snapEnabled = ref(false)
const lockAnchorsEnabled = ref(true)

const canUndo = computed(() => diagramCanvasRef.value?.getCanUndo() ?? false)
const canRedo = computed(() => diagramCanvasRef.value?.getCanRedo() ?? false)

const activeDiagram = computed(() =>
  selectedDiagramId.value
    ? state.value.diagrams.find((diagram) => diagram.id === selectedDiagramId.value && !diagram._isDeleted) ?? null
    : null
)
const activeNotationId = computed(() => activeDiagram.value?.notationId ?? null)

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
} | null>(null)

const showReuseLinkModal = ref(false)
const reuseLinkOptions = ref<EditorLink[]>([])
const pendingRelationId = ref<string | null>(null)
const showLinkDeleteModal = ref(false)
const pendingDeleteLinkId = ref<string | null>(null)
const showDiagramSwitchModal = ref(false)
const pendingDiagramSwitchId = ref<string | null>(null)

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
const createNodeModalTitle = computed(() =>
  createNodeModal.value.kind === "folder" ? "Создать папку" : "Создать ноду"
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

const canCreateNodeFromModal = computed(() => {
  if (!newNodeName.value.trim()) return false
  if (createNodeModal.value.kind === "folder") return !!directoryNodeType.value
  return !!newNodeTypeId.value
})

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

const bindLinkRelation = (link: EditorLink, relationId: string) => {
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
  markLinkDirty(link.id)
}

const openCreateFolder = (parentNodeId: string | null) => {
  if (!directoryNodeType.value) {
    setUiError("Тип Directory не найден. Невозможно создать папку.")
    return
  }
  createNodeModal.value = { parentNodeId, kind: "folder" }
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
  createNodeModal.value = { parentNodeId, kind: "node" }
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
  state.value.nodes.push({
    id: createId(),
    name: newNodeName.value.trim(),
    modelId: state.value.modelId,
    ownerId: state.value.ownerId,
    nodeTypeId,
    parentNodeId: createNodeModal.value.parentNodeId ?? null,
    createdAt: null,
    updatedAt: null,
    parsedAttrs: parseNodeAttrs(null),
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
  showDiagramSwitchModal.value = false
}

const switchDiagramWithoutSave = async () => {
  const targetDiagramId = pendingDiagramSwitchId.value
  if (!targetDiagramId) return

  await loadModel()
  const restoredTarget = state.value.diagrams.find(
    (diagram) => diagram.id === targetDiagramId && !diagram._isDeleted
  )
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
  return saveChanges()
}

const saveAndSwitchDiagram = async () => {
  const targetDiagramId = pendingDiagramSwitchId.value
  if (!targetDiagramId) return
  const ok = await saveWithValidation()
  if (!ok) return
  applyDiagramSelection(targetDiagramId)
  cancelDiagramSwitch()
}

const selectDiagram = (diagramId: string) => {
  if (diagramId === selectedDiagramId.value) return
  if (activeDiagram.value && hasUnsavedChanges.value) {
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

  const initial = diagram.parsedAttrs.instances.edges.length
  diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
    (edge) => edge.modelLinkId !== linkId
  )
  if (diagram.parsedAttrs.instances.edges.length !== initial) {
    markDiagramDirty(diagram.id)
  }

  if (selectedModelLinkId.value === linkId) selectedModelLinkId.value = null
  if (selectedCanvasElementId.value?.startsWith("edge-")) selectedCanvasElementId.value = null
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
  if (!activeDiagram.value || !selectedModelLinkId.value) return
  if (showLinkDeleteModal.value || shouldSkipDeleteHotkey(event)) return

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
  ensureNodeBindingByNodeType(node)

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

  diagram.parsedAttrs.instances.nodes.push({
    id: createId(),
    modelNodeId,
    x,
    y,
    width,
    height,
    attrs: diagramStyle ? { diagramStyle: JSON.parse(JSON.stringify(diagramStyle)) } : undefined
  })
  markDiagramDirty(diagram.id)
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
  const parsedAttrs = parseNodeAttrs(null)
  if (notationId) {
    parsedAttrs.notationComponents[notationId] = { componentId }
    const scopedDefaults: Record<string, unknown> = {}
    applyDefaultCustomValues(scopedDefaults, component.attrs)
    parsedAttrs.componentProperties[notationId] = { [componentId]: scopedDefaults }
  }
  state.value.nodes.push({
    id: nodeId,
    name: component.name,
    modelId: state.value.modelId,
    ownerId: state.value.ownerId,
    nodeTypeId: component.nodeTypeId,
    parentNodeId: diagram.nodeId,
    createdAt: null,
    updatedAt: null,
    parsedAttrs,
    _isNew: true
  })
  const parsedComponentAttrs = parseEntityAttrs(component.attrs ?? null)
  const ds = parsedComponentAttrs.diagramStyle
  const width = typeof ds?.width === "number" ? ds.width : 160
  const height = typeof ds?.height === "number" ? ds.height : 56
  diagram.parsedAttrs.instances.nodes.push({
    id: createId(),
    modelNodeId: nodeId,
    x,
    y,
    width,
    height,
    attrs: ds ? { diagramStyle: JSON.parse(JSON.stringify(ds)) } : undefined
  })
  markDiagramDirty(diagram.id)
}

const startConnectNodes = (
  sourceModelNodeId: string,
  targetModelNodeId: string,
  sourceInstanceId: string,
  targetInstanceId: string
) => {
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
  pendingConnection.value = { sourceModelNodeId, targetModelNodeId, sourceInstanceId, targetInstanceId }
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

  let link: EditorLink | null = null
  if (linkId) {
    link = state.value.links.find((item) => item.id === linkId) ?? null
  } else {
    link = {
      id: createId(),
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
    state.value.links.push(link)
  }
  if (!link) return

  bindLinkRelation(link, relation.id)
  const relParsed = parseEntityAttrs(relation.attrs ?? null)
  const relationDs = relParsed.diagramStyle
  diagram.parsedAttrs.instances.edges.push({
    id: createId(),
    modelLinkId: link.id,
    sourceInstanceId: connection.sourceInstanceId,
    targetInstanceId: connection.targetInstanceId,
    attrs: relationDs ? { diagramStyle: JSON.parse(JSON.stringify(relationDs)) } : undefined
  })
  markDiagramDirty(diagram.id)

  pendingConnection.value = null
  pendingRelationId.value = null
  showReuseLinkModal.value = false
}

const canConnect = (sourceModelNodeId: string, targetModelNodeId: string): boolean => {
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
  treePanelRef.value?.expandToNode(modelNodeId)
  nextTick(() => {
    const el = document.querySelector(`[data-tree-node-id="${modelNodeId}"]`)
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  })
}

const handleNodeLabelChange = (modelNodeId: string, newLabel: string) => {
  const node = state.value.nodes.find((item) => item.id === modelNodeId)
  if (!node || node.name === newLabel) return
  node.name = newLabel
  markNodeDirty(node.id)
}

const handleMoveNode = (nodeId: string, newParentNodeId: string | null) => {
  const node = state.value.nodes.find((item) => item.id === nodeId)
  if (!node) return
  if (node.parentNodeId === newParentNodeId) return
  node.parentNodeId = newParentNodeId
  markNodeDirty(node.id)
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
    case "toggle-lock-anchors": {
      const next = diagramCanvasRef.value?.toggleLockAnchors()
      if (typeof next === "boolean") lockAnchorsEnabled.value = next
      break
    }
    case "close-diagram":
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
    targetEdgeInstance.attrs.diagramStyle = JSON.parse(JSON.stringify(style))
    markDiagramDirty(diagram.id)
  }
}

const hasDiagramStyleOverride = computed(() => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !selectedElementId) return false

  if (selectedElementId.startsWith("instance-")) {
    const instanceId = selectedElementId.slice("instance-".length)
    const instance = diagram.parsedAttrs.instances.nodes.find((item) => item.id === instanceId)
    return Boolean(instance?.attrs?.diagramStyle)
  }

  if (selectedElementId.startsWith("edge-")) {
    const edgeId = selectedElementId.slice("edge-".length)
    const edge = diagram.parsedAttrs.instances.edges.find((item) => item.id === edgeId)
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

onMounted(() => {
  loadModel()
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
        :has-unsaved-changes="hasUnsavedChanges"
        :can-save="!isSaving"
        :model-name="model?.name"
        :model-version="model?.version"
        :grid-visible="gridVisible"
        :mini-map-visible="miniMapVisible"
        :snap-enabled="snapEnabled"
        :lock-anchors-enabled="lockAnchorsEnabled"
        :has-active-diagram="!!activeDiagram"
        :can-undo="canUndo"
        :can-redo="canRedo"
        @action="handleToolbarAction"
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
            :selected-node-id="selectedNodeId"
            :selected-diagram-id="selectedDiagramId"
            :model-name="model?.name"
            @select-node="selectedNodeId = $event"
            @open-diagram="selectDiagram"
            @create-folder="openCreateFolder"
            @create-node="openCreateRegularNode"
            @delete-node="markNodeDeleted"
            @create-diagram="openCreateDiagram"
            @delete-diagram="markDiagramDeleted"
            @move-node="handleMoveNode"
          />
        </template>

        <ModelDiagramCanvas
          ref="diagramCanvasRef"
          :active-diagram="activeDiagram"
          :nodes="state.nodes"
          :links="state.links"
          :relations="state.relations"
          :components="state.components"
          :node-types="state.nodeTypes"
          :selected-model-node-ids="selectedModelNodeIds"
          :selected-model-link-id="selectedModelLinkId"
          :connection-validator="canConnect"
          @update-diagram="setDiagramAttrs"
          @select-nodes="selectedModelNodeIds = $event; selectedModelLinkId = null"
          @select-link="selectedModelLinkId = $event; selectedModelNodeIds = []; selectedNodeId = null"
          @create-node-from-component="createNodeFromPaletteComponent"
          @add-existing-node="addExistingNodeToDiagram"
          @connect-nodes="startConnectNodes"
          @find-in-tree="handleFindInTree"
          @node-label-change="handleNodeLabelChange"
          @select-canvas-element-id="selectedCanvasElementId = $event"
          @canvas-context-change="handleCanvasContextChange"
        />

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
              <div class="model-right-stack__bottom-header">
                <span class="model-right-stack__bottom-title">Стиль</span>
                <div class="model-right-stack__bottom-actions">
                  <button
                    type="button"
                    class="btn btn--secondary model-right-stack__btn model-right-stack__btn--icon"
                    title="Восстановить стиль из нотации"
                    :disabled="!selectedCanvasElementId || !hasDiagramStyleOverride"
                    @click="restoreStyleFromNotation"
                  >
                    <span class="material-symbols-outlined">restart_alt</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn--secondary model-right-stack__btn model-right-stack__btn--icon"
                    :title="stylePanelCollapsed ? 'Развернуть панель стилей' : 'Свернуть панель стилей'"
                    @click="stylePanelCollapsed = !stylePanelCollapsed"
                  >
                    <span class="material-symbols-outlined">
                      {{ stylePanelCollapsed ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }}
                    </span>
                  </button>
                </div>
              </div>
              <NodeStylePanel
                v-show="!stylePanelCollapsed"
                :selected-element-id="selectedCanvasElementId"
                :interaction-manager="diagramInteractionManager"
                :renderer="diagramRenderer"
                @style-change="handleDiagramElementStyleChange"
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
        <span>{{ saveProgress || "Сохранение..." }}</span>
      </div>
      <div v-else-if="saveSuccess" class="save-toast save-toast--success">
        <span class="material-symbols-outlined save-toast__icon">check_circle</span>
        <span>Сохранено</span>
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
        <span>Название</span>
        <input
          v-model="newNodeName"
          class="field-input"
          :placeholder="createNodeModal.kind === 'folder' ? 'Новая папка' : 'Новая нода'"
        >
      </label>
      <div v-if="createNodeModal.kind === 'node'" class="node-type-dropdown">
        <span class="node-type-dropdown__label">Тип ноды</span>
        <div class="node-type-dropdown__control" @click="nodeTypeDropdownOpen = !nodeTypeDropdownOpen">
          <span class="node-type-dropdown__value">{{ selectedNodeTypeName || 'Выберите тип' }}</span>
          <span class="material-symbols-outlined node-type-dropdown__arrow">
            {{ nodeTypeDropdownOpen ? 'expand_less' : 'expand_more' }}
          </span>
        </div>
        <div v-if="nodeTypeDropdownOpen" class="node-type-dropdown__panel">
          <input
            v-model="nodeTypeSearchQuery"
            class="node-type-dropdown__search"
            type="text"
            placeholder="Поиск типа..."
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
              Ничего не найдено
            </div>
          </div>
        </div>
      </div>
      <div v-else class="form-hint">Будет использован тип <b>Directory</b>.</div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="showCreateNodeModal = false">Отмена</button>
      <button type="button" class="btn btn--primary" :disabled="!canCreateNodeFromModal" @click="createNode">
        Создать
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showCreateDiagramModal" title="Создать диаграмму" max-width="460px" @close="showCreateDiagramModal = false">
    <div class="form-grid">
      <label>
        <span>Название</span>
        <input v-model="newDiagramName" class="field-input" placeholder="Новая диаграмма">
      </label>
      <label>
        <span>Версия</span>
        <input v-model="newDiagramVersion" class="field-input" placeholder="1.0.0">
      </label>
      <label>
        <span>Нотация</span>
        <select v-model="newDiagramNotationId" class="field-input">
          <option v-for="notation in state.notations" :key="notation.id" :value="notation.id">
            {{ notation.name }} ({{ notation.version }})
          </option>
        </select>
      </label>
      <div v-if="hasDiagramNameVersionConflict" class="form-error-text">
        Диаграмма с таким именем и версией уже существует в модели.
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="showCreateDiagramModal = false">Отмена</button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="hasDiagramNameVersionConflict"
        @click="createDiagram"
      >
        Создать
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showComponentChoiceModal" title="Выберите компонент" max-width="420px" @close="showComponentChoiceModal = false">
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

  <BaseModal v-if="showRelationChoiceModal" title="Выберите relation" max-width="420px" @close="showRelationChoiceModal = false">
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

  <BaseModal v-if="showReuseLinkModal" title="Найдены существующие связи" max-width="500px" @close="showReuseLinkModal = false">
    <div class="choice-list">
      <button
        v-for="link in reuseLinkOptions"
        :key="link.id"
        type="button"
        class="choice-item"
        @click="createOrReuseLink(link.id)"
      >
        Использовать существующую ({{ formatReuseLinkOption(link) }})
      </button>
      <button type="button" class="choice-item choice-item--primary" @click="createOrReuseLink(null)">
        Создать новую связь
      </button>
    </div>
  </BaseModal>

  <BaseModal
    v-if="showDiagramSwitchModal"
    title="Несохранённые изменения"
    max-width="500px"
    @close="cancelDiagramSwitch"
  >
    <p class="leave-text">
      Есть несохранённые изменения. Сохранить их перед переключением на другую диаграмму?
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelDiagramSwitch">Отмена</button>
      <button type="button" class="btn btn--secondary" :disabled="isLoading || isSaving" @click="switchDiagramWithoutSave">
        Не сохранять
      </button>
      <button type="button" class="btn btn--primary" :disabled="isSaving" @click="saveAndSwitchDiagram">
        Сохранить и переключить
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showLinkDeleteModal"
    title="Удаление связи"
    max-width="500px"
    @close="cancelLinkDelete"
  >
    <p class="leave-text">
      Что сделать с выбранной связью?
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLinkDelete">Отмена</button>
      <button type="button" class="btn btn--secondary" @click="removeLinkFromCurrentDiagram">
        Удалить с диаграммы
      </button>
      <button type="button" class="btn btn--danger" @click="removeLinkFromModel">
        Удалить из модели
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showLeaveDialog" title="Несохранённые изменения" max-width="400px" @close="cancelLeave">
    <p class="leave-text">
      У вас есть несохранённые изменения. Если вы покинете страницу, они будут потеряны.
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLeave">Остаться</button>
      <button type="button" class="btn btn--danger" @click="confirmLeave">Покинуть</button>
    </template>
  </BaseModal>

  <BaseModal v-if="showDiagramJson" title="JSON диаграммы" max-width="600px" @close="showDiagramJson = false">
    <pre class="json-viewer">{{ diagramJsonContent }}</pre>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="copyDiagramJson">Копировать</button>
      <button type="button" class="btn btn--secondary" @click="showDiagramJson = false">Закрыть</button>
    </template>
  </BaseModal>

  <div v-if="isLoading" class="overlay-loading">Загрузка...</div>
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
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--secondary {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.btn--primary {
  background: var(--primary);
  color: #fff;
}

.btn--danger {
  background: var(--danger);
  color: #fff;
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

.model-right-stack__bottom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-panel);
}

.model-right-stack__bottom-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.model-right-stack__bottom-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-right-stack__btn {
  padding: 6px 10px;
  font-size: 12px;
}

.model-right-stack__btn--icon {
  width: 32px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.model-right-stack__btn--icon .material-symbols-outlined {
  font-size: 18px;
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

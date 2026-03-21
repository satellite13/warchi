<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationNormalized } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet, uploadDiagramSvg } from '../../composables/useApi'
import MainLayout from '../../layouts/MainLayout.vue'
import AppFooter from '../../components/layout/AppFooter.vue'
import BaseModal from '../../components/modals/BaseModal.vue'
import ShareAccessModal from '../../components/modals/ShareAccessModal.vue'
import DiagramImageShareModal from './components/DiagramImageShareModal.vue'
import { SvgExporter, DiagramRenderer, InteractionManager } from '@ngroznykh/papirus'
import {
  createId,
  parseLinkAttrs,
  parseNodeAttrs,
  resolveComponentByNodeType,
  resolveRelationByLinkType,
  type DiagramAttrs,
  type DiagramNodeInstance,
} from './modelAttrs'
import type { EditorLink, EditorNode } from './types'
import { useModelEditor } from './composables/useModelEditor'
import { useModelVersionDiff } from './composables/useModelVersionDiff'
import { useModelToolbarState } from './composables/useModelToolbarState'
import { useNoteEditor } from './composables/useNoteEditor'
import { useModelDiagramExport } from './composables/useModelDiagramExport'
import { syncLinkEndpointsFromDiagram } from './utils/syncLinkEndpointsFromDiagram'
import {
  getDiagramScopedLinkValues,
  getDiagramScopedNodeValues,
  setDiagramScopedLinkValue,
  setDiagramScopedNodeValue,
} from './utils/diagramScopedProperties'
import { useAuth } from '../../composables/useAuth'
import { usePermissions } from '../../composables/usePermissions'
import { getUserDisplayName } from '../../utils/userDisplay'
import type { UserInfo } from '../../types/entities'
import { useCanShare } from '../../composables/useCanShare'
import ModelEditorHeader from './components/ModelEditorHeader.vue'
import ModelMainPanelLayout from './layout/ModelMainPanelLayout.vue'
import ModelTreePalettePanel from './components/ModelTreePalettePanel.vue'
import ModelDiagramCanvas from './components/ModelDiagramCanvas.vue'
import ModelPropertiesPanel from './components/ModelPropertiesPanel.vue'
import { parseEntityAttrs, parseTypeAttrs, type DiagramStyle } from '../notations/notationAttrs'
import NodeStylePanel from '../notations/components/NodeStylePanel.vue'
import TabPanel from '../../components/layout/TabPanel.vue'
import DocumentEditorModal from '../../components/modals/DocumentEditorModal.vue'
import ModelVersionDiffModal from './components/ModelVersionDiffModal.vue'
import { bumpMinor, compareVersions } from '../../utils/version'
import { appendDiagramCaption } from '../../utils/diagramSvgCaption'
import type { NotationMetaResponse, NotationResponse, RelationResponse } from '../../types/api'
import { useWikiDocuments } from '../../composables/useWikiDocuments'
import { useDocumentModal } from './composables/useDocumentModal'

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
  markModelDirty,
  renameModel,
  createDiagramBaseline,
  ensureNotationRelationsAndRules,
  isNotationRelationsAndRulesLoading,
} = useModelEditor()
const { currentUser } = useAuth()
const { checkPermission } = usePermissions()
const { t } = useI18n()
const { list: wikiDocumentsList, fetchList: fetchWikiDocuments } = useWikiDocuments()
const canInspectDiagramJson = computed(() => {
  const permission = model.value?.accessPermission ?? null
  return permission === 'ADMIN' || permission === 'OWNER' || permission === 'EDIT'
})

const selectedNodeId = ref<string | null>(null)
const showShareModal = ref(false)
const showCompareModal = ref(false)

const versionDiff = useModelVersionDiff(() => ({
  nodes: state.value.nodes.filter((n) => !n._isDeleted),
  links: state.value.links.filter((l) => !l._isDeleted),
  diagrams: state.value.diagrams.filter((d) => !d._isDeleted),
}))

// Document modal — initialized later after all dependencies are defined (see useDocumentModal call below)

async function handleOpenCompareModal() {
  const modelId = state.value.modelId
  if (!modelId) return
  showCompareModal.value = true
  versionDiff.clearCompare()
  await Promise.all([
    versionDiff.fetchRelatedVersions(modelId),
    versionDiff.loadBaseFromApi(modelId),
  ])
}

function handleCompareModalClose() {
  showCompareModal.value = false
  versionDiff.clearCompare()
}

const compareModalState = computed(() => ({
  relatedVersions: versionDiff.relatedVersions.value,
  relatedVersionsLoading: versionDiff.relatedVersionsLoading.value,
  compareTargetId: versionDiff.compareTargetId.value,
  compareTargetLoading: versionDiff.compareTargetLoading.value,
  compareTargetError: versionDiff.compareTargetError.value,
  diff: versionDiff.diff.value,
}))
const selectedDiagramId = ref<string | null>(null)
const selectedModelNodeIds = ref<string[]>([])
const selectedInstanceIds = ref<string[]>([])
const selectedModelLinkId = ref<string | null>(null)
const selectedEdgeInstanceId = ref<string | null>(null)
const selectedCanvasElementId = ref<string | null>(null)
const diagramRenderer = shallowRef<DiagramRenderer | null>(null)
const diagramInteractionManager = shallowRef<InteractionManager | null>(null)
const activeRightTab = ref('properties')
const rightPanelTabs = computed(() => {
  const tabs: { id: string; label: string; icon: string }[] = [
    { id: 'properties', label: t('models.propertiesTab'), icon: 'tune' },
  ]
  if (!isDiagramReadOnly.value) {
    tabs.push({ id: 'style', label: t('models.figureStyleTab'), icon: 'palette' })
  }
  return tabs
})
const { canShare: canShareModel } = useCanShare(model, currentUser)
const diagramCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const treePanelRef = ref<InstanceType<typeof ModelTreePalettePanel> | null>(null)
const NOTE_NODE_PREFIX = '__diagram-note__:'
const NOTE_EDGE_PREFIX = '__diagram-note-edge__:'
const NOTE_PASTE_STEP = 24

const canUndo = computed(() => diagramCanvasRef.value?.getCanUndo() ?? false)
const canRedo = computed(() => diagramCanvasRef.value?.getCanRedo() ?? false)
const activeDiagram = computed(() =>
  selectedDiagramId.value
    ? (state.value.diagrams.find(
        diagram => diagram.id === selectedDiagramId.value && !diagram._isDeleted
      ) ?? null)
    : null
)

const {
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
} = useModelToolbarState(
  computed(() => currentUser.value?.id ?? null),
  computed(() => !!activeDiagram.value)
)

/** Версии текущей диаграммы (тот же model + name), от новых к старым по семверу */
const diagramVersionsForCurrentName = computed(() => {
  const diagram = activeDiagram.value
  if (!diagram) return []
  const sameName = state.value.diagrams.filter(
    d =>
      !d._isDeleted &&
      d.modelId === diagram.modelId &&
      d.name.trim() === diagram.name.trim()
  )
  return [...sameName].sort((a, b) => compareVersions(b.version, a.version))
})

/** Последняя (редактируемая) версия диаграммы по имени */
const latestDiagramVersion = computed(() => diagramVersionsForCurrentName.value[0] ?? null)

/** Открыта старая версия — только просмотр, без редактирования */
const isDiagramReadOnly = computed(
  () =>
    !!activeDiagram.value &&
    !!latestDiagramVersion.value &&
    activeDiagram.value.id !== latestDiagramVersion.value.id
)

const baselineCreating = ref(false)
const baselineError = ref<string | null>(null)
async function handleCreateBaseline() {
  const diagram = activeDiagram.value
  if (!diagram || isDiagramReadOnly.value) return
  baselineError.value = null
  baselineCreating.value = true
  try {
    const created = await createDiagramBaseline(diagram.id)
    if (created) {
      if (diagramRenderer.value) {
        await nextTick()
        await new Promise<void>(r =>
          requestAnimationFrame(() => requestAnimationFrame(() => r()))
        )
        const exporter = new SvgExporter(diagramRenderer.value)
        let svg = exporter.exportSVG({
          includeBackground: true,
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() || '#ffffff',
          padding: 24,
        })
        svg = appendDiagramCaption(svg, {
          diagramName: created.name,
          diagramVersion: created.version,
          notationName: activeDiagramNotationName.value,
          notationVersion: activeDiagramNotationVersion.value,
        })
        void uploadDiagramSvg(created.id, svg)
      }
      selectedDiagramId.value = created.id
    } else {
      baselineError.value = t('models.baselineCreateError')
    }
  } finally {
    baselineCreating.value = false
  }
}

watch(selectedDiagramId, () => {
  baselineError.value = null
})

watch([isDiagramReadOnly, activeRightTab], () => {
  if (isDiagramReadOnly.value && activeRightTab.value === 'style') {
    activeRightTab.value = 'properties'
  }
})

const activeNotationId = computed(() => activeDiagram.value?.notationId ?? null)
const isActiveNotationRulesLoading = computed(() =>
  isNotationRelationsAndRulesLoading(activeNotationId.value)
)
const newerNotationVersions = ref<NotationResponse[]>([])
const fallbackNotationMeta = ref<NotationMetaResponse | null>(null)
const fallbackNotationMetaLoading = ref(false)
const fallbackNotationMetaError = ref<string | null>(null)
const fallbackNotationOwnerDisplayName = ref('')
const activeDiagramNotationName = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return ''
  const notation = state.value.notations.find(item => item.id === notationId)
  if (notation) return notation.name
  if (fallbackNotationMeta.value?.id === notationId) return fallbackNotationMeta.value.name
  if (fallbackNotationMetaLoading.value) return 'Нотация загружается...'
  if (fallbackNotationMetaError.value) return fallbackNotationMetaError.value
  return 'Нотация недоступна'
})
const activeDiagramNotationVersion = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return ''
  const notation = state.value.notations.find(item => item.id === notationId)
  if (notation) return notation.version
  if (fallbackNotationMeta.value?.id === notationId) return fallbackNotationMeta.value.version
  return ''
})
const activeDiagramNotationOwnerLabel = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return ''
  if (fallbackNotationMeta.value?.id !== notationId) return ''
  return fallbackNotationOwnerDisplayName.value || fallbackNotationMeta.value.ownerEmail
})
const canOpenActiveDiagramNotation = computed(() => {
  const notationId = activeDiagram.value?.notationId
  if (!notationId) return false
  if (state.value.notations.some(item => item.id === notationId)) return true
  return fallbackNotationMeta.value?.id === notationId
})

watch(
  activeNotationId,
  async (notationId) => {
    if (!notationId) {
      newerNotationVersions.value = []
      return
    }
    try {
      await ensureNotationRelationsAndRules(notationId)
    } catch (error) {
      setUiError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить правила связей для активной нотации.'
      )
    }
    const result = await apiGet<NotationResponse[]>(`/notations/${notationId}/newer-versions`)
    if (result.success) {
      newerNotationVersions.value = result.data
    } else {
      newerNotationVersions.value = []
    }
  },
  { immediate: true }
)

watch(
  selectedDiagramId,
  async () => {
    const notationId = activeNotationId.value
    if (!notationId) return
    try {
      await ensureNotationRelationsAndRules(notationId, { force: true })
    } catch (error) {
      setUiError(
        error instanceof Error
          ? error.message
          : 'Не удалось обновить relations и правила связей для диаграммы.'
      )
    }
  }
)


watch(
  () => activeDiagram.value?.notationId ?? null,
  async notationId => {
    fallbackNotationMeta.value = null
    fallbackNotationMetaError.value = null
    fallbackNotationMetaLoading.value = false
    if (!notationId) return
    const hasNotationInState = state.value.notations.some(item => item.id === notationId)
    if (hasNotationInState) return

    fallbackNotationMetaLoading.value = true
    const result = await apiGet<NotationMetaResponse>(`/notations/${notationId}/meta`)
    if (activeDiagram.value?.notationId !== notationId) return
    fallbackNotationMetaLoading.value = false
    if (!result.success) {
      fallbackNotationMetaError.value =
        result.error.status === 404
          ? 'Метаданные нотации недоступны (backend не обновлён или нотация удалена)'
          : result.error.status === 403
            ? 'Нет доступа к нотации'
            : 'Не удалось загрузить нотацию'
      return
    }
    fallbackNotationMeta.value = result.data
    // Resolve owner display name
    fallbackNotationOwnerDisplayName.value = ''
    const ownerResult = await apiGet<UserInfo>(`/users/${result.data.ownerId}/public`)
    if (ownerResult.success) {
      fallbackNotationOwnerDisplayName.value = getUserDisplayName(
        ownerResult.data,
        result.data.ownerEmail
      )
    }
  }
)

const selectedTreeNode = computed(() =>
  selectedNodeId.value
    ? (state.value.nodes.find(node => node.id === selectedNodeId.value && !node._isDeleted) ?? null)
    : null
)
const selectedDiagramNode = computed(() =>
  selectedModelNodeIds.value.length === 1
    ? (state.value.nodes.find(
        node => node.id === selectedModelNodeIds.value[0] && !node._isDeleted
      ) ?? null)
    : null
)
const selectedNode = computed(() => selectedDiagramNode.value ?? selectedTreeNode.value)

const selectedLink = computed(() =>
  selectedModelLinkId.value
    ? (state.value.links.find(link => link.id === selectedModelLinkId.value && !link._isDeleted) ??
      null)
    : null
)

const selectedNodeInstanceId = computed<string | null>(() => {
  const selectedElementId = selectedCanvasElementId.value
  if (selectedElementId?.startsWith('instance-')) {
    return selectedElementId.slice('instance-'.length)
  }
  if (selectedInstanceIds.value.length === 1) {
    return selectedInstanceIds.value[0] ?? null
  }
  const diagram = activeDiagram.value
  const modelNodeId = selectedNode.value?.id
  if (!diagram || !modelNodeId) return null
  return diagram.parsedAttrs.instances.nodes.find(item => item.modelNodeId === modelNodeId)?.id ?? null
})

const selectedLinkEdgeInstanceId = computed<string | null>(() => {
  if (selectedEdgeInstanceId.value) return selectedEdgeInstanceId.value
  const selectedElementId = selectedCanvasElementId.value
  if (selectedElementId?.startsWith('edge-')) {
    return selectedElementId.slice('edge-'.length)
  }
  return null
})

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
  return getDiagramScopedNodeValues({
    diagram: activeDiagram.value?.parsedAttrs,
    modelNodeId: node.id,
    notationId,
    componentId,
    nodeAttrsFallback: node.parsedAttrs,
    instanceId: selectedNodeInstanceId.value,
  })
})

const diagramsForProps = computed<{ id: string; label: string }[]>(() =>
  state.value.diagrams
    .filter((d) => !d._isDeleted)
    .map((d) => ({ id: d.id, label: `${d.name} ${d.version}` }))
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_REGEX.test(s)
}

const documentsFromApi = ref<{ fileId: string; label: string }[]>([])
async function fetchDocumentsFromApi() {
  const modelId = state.value.modelId
  if (!modelId) return
  const params = new URLSearchParams()
  params.set('modelId', modelId)
  const notationId = activeNotationId.value
  if (notationId) params.set('notationId', notationId)
  const componentId = nodeBindingComponentId.value
  if (componentId) params.set('componentId', componentId)
  const nodeId = selectedNode.value?.id ?? null
  if (nodeId) params.set('nodeId', nodeId)
  const res = await apiGet<{ fileId: string; label: string }[]>(`/documents?${params.toString()}`)
  if (res.success) documentsFromApi.value = res.data
  else documentsFromApi.value = []
}
watch(
  () => [state.value.modelId, activeNotationId.value, nodeBindingComponentId.value, selectedNode.value?.id],
  () => { fetchDocumentsFromApi() },
  { immediate: true }
)

function modelDocumentsInState(): { fileId: string; label: string }[] {
  const seen = new Set<string>()
  const list: { fileId: string; label: string }[] = []
  for (const node of state.value.nodes) {
    const fileId = node.parsedAttrs.documentFileId
    if (typeof fileId === 'string' && fileId && !seen.has(fileId)) {
      seen.add(fileId)
      list.push({ fileId, label: `${node.name} (${t('diagram.nodeLabel')})` })
    }
    const compProps = node.parsedAttrs.componentProperties
    if (compProps && typeof compProps === 'object') {
      for (const comp of Object.values(compProps) as Record<string, unknown>[]) {
        if (comp && typeof comp === 'object') {
          for (const val of Object.values(comp)) {
            if (isUuid(val) && !seen.has(val)) {
              seen.add(val)
              list.push({ fileId: val, label: t('diagram.documentLabel') })
            }
          }
        }
      }
    }
  }
  for (const diagram of state.value.diagrams) {
    if (diagram._isDeleted) continue
    const fileId = diagram.parsedAttrs.documentFileId
    if (typeof fileId === 'string' && fileId && !seen.has(fileId)) {
      seen.add(fileId)
      list.push({ fileId, label: `${diagram.name} (${t('diagram.diagramLabel')})` })
    }
  }
  return list
}

const modelDocuments = computed<{ fileId: string; label: string }[]>(() => {
  const fromState = modelDocumentsInState()
  const seen = new Set<string>()
  const list: { fileId: string; label: string }[] = []
  for (const item of fromState) {
    seen.add(item.fileId)
    list.push(item)
  }
  for (const item of documentsFromApi.value) {
    if (!seen.has(item.fileId)) {
      seen.add(item.fileId)
      list.push(item)
    }
  }
  return list
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
  return getDiagramScopedLinkValues({
    diagram: activeDiagram.value?.parsedAttrs,
    modelLinkId: link.id,
    notationId,
    relationId,
    linkAttrsFallback: link.parsedAttrs,
    edgeInstanceId: selectedLinkEdgeInstanceId.value,
  })
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

const {
  showNoteEditorModal,
  editingNoteInstanceId,
  noteEditorText,
  isNoteInstance,
  openNoteEditor,
  saveNoteEditor,
  cancelNoteEditor,
} = useNoteEditor(activeDiagram, isDiagramReadOnly, markDiagramDirty)

const {
  showDiagramImageShareModal,
  exportActiveDiagramAsPng,
  exportActiveDiagramAsSvg,
  uploadDiagramPreview,
} = useModelDiagramExport(
  model,
  activeDiagram,
  diagramRenderer,
  activeDiagramNotationName,
  activeDiagramNotationVersion,
  setUiError
)

const handleRenameModel = (nextName: string) => {
  const error = renameModel(nextName)
  if (error) setUiError(error)
}
const handleOpenNotationEditor = (notationId: string) => {
  router.push({ name: 'notation-editor', params: { id: notationId } })
}
const createNodeModal = ref<{ parentNodeId: string | null; kind: 'folder' | 'node' }>({
  parentNodeId: null,
  kind: 'node',
})
const showCreateNodeModal = ref(false)
const newNodeName = ref('')
const newNodeTypeId = ref('')

const showCreateDiagramModal = ref(false)
const createDiagramNodeId = ref<string | null>(null)
const newDiagramName = ref('')
const newDiagramVersion = ref('1.0.0')
const newDiagramNotationId = ref('')

const normalizedNewDiagramName = computed(() => newDiagramName.value.trim().toLowerCase())
const normalizedNewDiagramVersion = computed(() => (newDiagramVersion.value || '1.0.0').trim())
const hasDiagramNameVersionConflict = computed(() => {
  if (!normalizedNewDiagramName.value || !normalizedNewDiagramVersion.value) return false
  return state.value.diagrams.some(diagram => {
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
    d => !d._isDeleted && d.name.trim().toLowerCase() === name && d.notationId === notationId
  )
  if (matching.length === 0) return
  const maxVersion = matching.reduce(
    (max, d) => (compareVersions(d.version, max) > 0 ? d.version : max),
    matching[0]!.version
  )
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
const pendingDeleteEdgeInstanceId = ref<string | null>(null)
const showNodeDeleteModal = ref(false)
const pendingDeleteNodeIds = ref<string[]>([])
const pendingDeleteInstanceIds = ref<string[]>([])
const pendingDeleteNodeSource = ref<'canvas' | 'tree'>('tree')
const showDiagramDeleteModal = ref(false)
const pendingDeleteDiagramId = ref<string | null>(null)
const showDiagramSwitchModal = ref(false)
const pendingDiagramSwitchId = ref<string | null>(null)
const pendingDiagramAction = ref<'switch' | 'close' | null>(null)
const pendingDeleteNodeCount = computed(() =>
  pendingDeleteInstanceIds.value.length > 0
    ? pendingDeleteInstanceIds.value.length
    : pendingDeleteNodeIds.value.length
)
const pendingDeleteNodeSingleName = computed(() => {
  const count = pendingDeleteNodeCount.value
  if (count !== 1) return ''
  if (pendingDeleteInstanceIds.value.length > 0) {
    const instanceId = pendingDeleteInstanceIds.value[0]
    if (!instanceId) return ''
    const instance = activeDiagram.value?.parsedAttrs.instances.nodes.find(
      item => item.id === instanceId
    )
    if (!instance) return ''
    if (isNoteInstance(instance)) return 'Заметка'
    return state.value.nodes.find(item => item.id === instance.modelNodeId)?.name ?? ''
  }
  const nodeId = pendingDeleteNodeIds.value[0]
  if (!nodeId) return ''
  if (isDiagramNoteModelNodeId(nodeId)) return 'Заметка'
  return state.value.nodes.find(item => item.id === nodeId)?.name ?? ''
})
const pendingDeleteDiagramName = computed(() => {
  const diagramId = pendingDeleteDiagramId.value
  if (!diagramId) return ''
  return state.value.diagrams.find(item => item.id === diagramId)?.name ?? ''
})

const getLinkTypeName = (linkTypeId: string): string =>
  state.value.linkTypes.find(item => item.id === linkTypeId)?.name ?? 'Неизвестный тип'

const extractLinkLabelValue = (link: EditorLink): string => {
  const notationId = activeNotationId.value
  if (!notationId) return 'без метки'

  const relationId =
    link.parsedAttrs.notationRelations[notationId]?.relationId ?? pendingRelationId.value
  if (!relationId) return 'без метки'

  const scopedValues = getDiagramScopedLinkValues({
    diagram: activeDiagram.value?.parsedAttrs,
    modelLinkId: link.id,
    notationId,
    relationId,
    linkAttrsFallback: link.parsedAttrs,
    edgeInstanceId: selectedLinkEdgeInstanceId.value,
  })
  if (!scopedValues) return 'без метки'

  for (const key of ['label', 'name', 'title', 'метка']) {
    const value = scopedValues[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  for (const value of Object.values(scopedValues)) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return 'без метки'
}

const formatReuseLinkOption = (link: EditorLink): string =>
  `${getLinkTypeName(link.linkTypeId)}: ${extractLinkLabelValue(link)}`

const directoryNodeType = computed(
  () =>
    state.value.nodeTypes.find(typeItem => typeItem.name.trim().toLowerCase() === 'directory') ??
    null
)
const nonDirectoryNodeTypes = computed(() =>
  state.value.nodeTypes.filter(typeItem => typeItem.name.trim().toLowerCase() !== 'directory')
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
  createNodeModal.value.kind === 'folder'
    ? t('models.createFolderTitle')
    : t('models.createNodeTitle')
)
const nodeTypeSearchQuery = ref('')
const nodeTypeDropdownOpen = ref(false)
const filteredNodeTypes = computed(() => {
  const query = nodeTypeSearchQuery.value.trim().toLowerCase()
  if (!query) return nonDirectoryNodeTypes.value
  return nonDirectoryNodeTypes.value.filter(t => t.name.toLowerCase().includes(query))
})
const selectedNodeTypeName = computed(() => {
  if (!newNodeTypeId.value) return ''
  return nonDirectoryNodeTypes.value.find(t => t.id === newNodeTypeId.value)?.name ?? ''
})

const treeRootNodeId = computed<string | null>(() => {
  const raw = model.value?.attrs
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const rootId = parsed.treeRootNodeId
    return typeof rootId === 'string' && rootId.trim().length > 0 ? rootId : null
  } catch {
    return null
  }
})

const resolveTreeParentId = (parentNodeId: string | null): string | null =>
  parentNodeId ?? treeRootNodeId.value ?? null

const canCreateNodeFromModal = computed(() => {
  if (!newNodeName.value.trim()) return false
  if (createNodeModal.value.kind === 'folder') return !!directoryNodeType.value
  return !!newNodeTypeId.value
})

const getNextTreeOrderForParent = (parentNodeId: string | null): number => {
  const siblingOrders = state.value.nodes
    .filter(node => !node._isDeleted && node.parentNodeId === parentNodeId)
    .map(node => node.parsedAttrs.treeOrder ?? 0)
  if (siblingOrders.length === 0) return 0
  return Math.max(...siblingOrders) + 1
}

const normalizeDirectoryPathSegments = (rawPath: string): string[] =>
  rawPath
    .split(/[\\/]+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)

const ensureDirectoryPath = (
  rawPath: string
): { parentNodeId: string | null; createdDirectoryIds: string[] } => {
  const directoryTypeId = directoryNodeType.value?.id
  if (!directoryTypeId) return { parentNodeId: null, createdDirectoryIds: [] }

  const segments = normalizeDirectoryPathSegments(rawPath)
  if (segments.length === 0)
    return { parentNodeId: resolveTreeParentId(null), createdDirectoryIds: [] }

  let currentParentNodeId = resolveTreeParentId(null)
  const createdDirectoryIds: string[] = []

  for (const segment of segments) {
    const normalizedSegment = segment.toLowerCase()
    const existingDirectory = state.value.nodes.find(node => {
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
        treeOrder: getNextTreeOrderForParent(currentParentNodeId),
      },
      _isNew: true,
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
    const parentKey = node.parentNodeId ?? '__root__'
    const nextOrder = counters.get(parentKey) ?? 0
    counters.set(parentKey, nextOrder + 1)
    if (node.parsedAttrs.treeOrder !== nextOrder) {
      node.parsedAttrs.treeOrder = nextOrder
      markNodeDirty(node.id)
    }
  }
}

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const noteClipboard = ref<DiagramNodeInstance[] | null>(null)
const notePasteCount = ref(0)

const isDiagramNoteModelNodeId = (modelNodeId: string): boolean =>
  modelNodeId.startsWith(NOTE_NODE_PREFIX)

const isDiagramOnlyEdgeModelLinkId = (modelLinkId: string): boolean =>
  modelLinkId.startsWith(NOTE_EDGE_PREFIX)

const isDirectoryNoteInstanceId = (instanceId: string): boolean => {
  const diagram = activeDiagram.value
  if (!diagram) return false
  const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
  return instance?.attrs?.isDirectoryNote === true
}

const isNoteLikeConnection = (
  sourceModelNodeId: string,
  targetModelNodeId: string,
  sourceInstanceId: string,
  targetInstanceId: string
): boolean => {
  if (isDiagramNoteModelNodeId(sourceModelNodeId) || isDiagramNoteModelNodeId(targetModelNodeId)) {
    return true
  }
  if (isDirectoryNode(sourceModelNodeId) || isDirectoryNode(targetModelNodeId)) {
    return true
  }
  if (isDirectoryNoteInstanceId(sourceInstanceId) || isDirectoryNoteInstanceId(targetInstanceId)) {
    return true
  }
  return false
}

const executeDiagramHistoryCommand = (command: { execute: () => void; undo: () => void }) => {
  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === 'function') {
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
      if (!node.parsedAttrs.componentProperties[notationId])
        node.parsedAttrs.componentProperties[notationId] = {}
      if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
        node.parsedAttrs.componentProperties[notationId][componentId] = {}
      }
      const component = state.value.components.find(
        item => item.id === componentId && item.notationId === notationId
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
      if (!link.parsedAttrs.relationProperties[notationId])
        link.parsedAttrs.relationProperties[notationId] = {}
      if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
        link.parsedAttrs.relationProperties[notationId][relationId] = {}
      }
      const relation = state.value.relations.find(
        item => item.id === relationId && item.notationId === notationId
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
  if (!node.parsedAttrs.componentProperties[notationId])
    node.parsedAttrs.componentProperties[notationId] = {}
  if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
    node.parsedAttrs.componentProperties[notationId][componentId] = {}
  }
  const component = state.value.components.find(
    item => item.id === componentId && item.notationId === notationId
  )
  if (component) {
    applyDefaultCustomValues(
      node.parsedAttrs.componentProperties[notationId][componentId]!,
      component.attrs
    )
  }
  markNodeDirty(node.id)
}

const bindLinkRelation = (
  link: EditorLink,
  relationId: string,
  options?: { markDirty?: boolean }
) => {
  const notationId = activeNotationId.value
  if (!notationId) return
  link.parsedAttrs.notationRelations[notationId] = { relationId }
  if (!link.parsedAttrs.relationProperties[notationId])
    link.parsedAttrs.relationProperties[notationId] = {}
  if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
    link.parsedAttrs.relationProperties[notationId][relationId] = {}
  }
  const relation = state.value.relations.find(
    item => item.id === relationId && item.notationId === notationId
  )
  if (relation) {
    applyDefaultCustomValues(
      link.parsedAttrs.relationProperties[notationId][relationId]!,
      relation.attrs
    )
  }
  if (options?.markDirty ?? true) {
    markLinkDirty(link.id)
  }
}

const openCreateFolder = (parentNodeId: string | null) => {
  if (!directoryNodeType.value) {
    setUiError('Тип Directory не найден. Невозможно создать папку.')
    return
  }
  createNodeModal.value = { parentNodeId: resolveTreeParentId(parentNodeId), kind: 'folder' }
  newNodeName.value = ''
  newNodeTypeId.value = directoryNodeType.value.id
  uiError.value = null
  showCreateNodeModal.value = true
}

const openCreateRegularNode = (parentNodeId: string | null) => {
  if (nonDirectoryNodeTypes.value.length === 0) {
    setUiError('Нет доступных типов нод, кроме Directory.')
    return
  }
  createNodeModal.value = { parentNodeId: resolveTreeParentId(parentNodeId), kind: 'node' }
  newNodeName.value = ''
  newNodeTypeId.value = nonDirectoryNodeTypes.value[0]?.id ?? ''
  nodeTypeSearchQuery.value = ''
  nodeTypeDropdownOpen.value = false
  uiError.value = null
  showCreateNodeModal.value = true
}

const createNode = () => {
  if (!newNodeName.value.trim()) return
  const nodeTypeId =
    createNodeModal.value.kind === 'folder'
      ? (directoryNodeType.value?.id ?? '')
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
      treeOrder: getNextTreeOrderForParent(parentNodeId),
    },
    _isNew: true,
  })
  showCreateNodeModal.value = false
}

const openCreateDiagram = (nodeId: string) => {
  createDiagramNodeId.value = nodeId
  newDiagramName.value = ''
  newDiagramVersion.value = '1.0.0'
  newDiagramNotationId.value = state.value.notations[0]?.id ?? ''
  uiError.value = null
  showCreateDiagramModal.value = true
}

const createDiagram = () => {
  if (!createDiagramNodeId.value || !newDiagramName.value.trim() || !newDiagramNotationId.value)
    return
  if (hasDiagramNameVersionConflict.value) {
    setUiError('Диаграмма с таким именем и версией уже существует в модели.')
    return
  }
  uiError.value = null
  const id = createId()
  state.value.diagrams.push({
    id,
    name: newDiagramName.value.trim(),
    version: newDiagramVersion.value || '1.0.0',
    ownerId: state.value.ownerId,
    modelId: state.value.modelId,
    nodeId: createDiagramNodeId.value,
    notationId: newDiagramNotationId.value,
    createdAt: null,
    updatedAt: null,
    parsedAttrs: { instances: { nodes: [], edges: [] } },
    _isNew: true,
  })
  selectedDiagramId.value = id
  showCreateDiagramModal.value = false
}

const markNodeDeleted = (nodeId: string) => {
  const node = state.value.nodes.find(item => item.id === nodeId)
  if (!node) return

  for (const diagram of state.value.diagrams) {
    if (diagram._isDeleted) continue
    const removedInstanceIds = new Set(
      diagram.parsedAttrs.instances.nodes
        .filter(instance => instance.modelNodeId === nodeId)
        .map(instance => instance.id)
    )
    if (removedInstanceIds.size === 0) continue

    diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
      instance => !removedInstanceIds.has(instance.id)
    )
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      edge =>
        !removedInstanceIds.has(edge.sourceInstanceId) &&
        !removedInstanceIds.has(edge.targetInstanceId)
    )
    markDiagramDirty(diagram.id)
  }

  if (node._isNew) {
    state.value.nodes = state.value.nodes.filter(item => item.id !== nodeId)
  } else {
    node._isDeleted = true
    node._isDirty = true
  }
  state.value.diagrams.forEach(diagram => {
    if (diagram.nodeId !== nodeId) return
    if (diagram._isNew) {
      diagram._isDeleted = true
    } else {
      diagram._isDeleted = true
      diagram._isDirty = true
    }
  })

  selectedModelNodeIds.value = selectedModelNodeIds.value.filter(id => id !== nodeId)
  if (selectedNodeId.value === nodeId) selectedNodeId.value = null
}

const markDiagramDeleted = (diagramId: string) => {
  const row = state.value.diagrams.find(item => item.id === diagramId)
  if (!row) return
  if (row._isNew) {
    state.value.diagrams = state.value.diagrams.filter(item => item.id !== diagramId)
  } else {
    row._isDeleted = true
    row._isDirty = true
  }
  if (selectedDiagramId.value === diagramId) selectedDiagramId.value = null
}

const openNodeDeleteDialog = (
  nodeIds: string[],
  source: 'canvas' | 'tree',
  instanceIds: string[] = []
) => {
  if (source === 'canvas' && instanceIds.length > 0) {
    pendingDeleteInstanceIds.value = [...new Set(instanceIds)]
    pendingDeleteNodeIds.value = []
  } else if (nodeIds.length > 0) {
    pendingDeleteNodeIds.value = [...new Set(nodeIds)]
    pendingDeleteInstanceIds.value = []
  } else {
    return
  }
  pendingDeleteNodeSource.value = source
  showNodeDeleteModal.value = true
}

const cancelNodeDelete = () => {
  pendingDeleteNodeIds.value = []
  pendingDeleteInstanceIds.value = []
  pendingDeleteNodeSource.value = 'tree'
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
  const row = state.value.links.find(item => item.id === linkId)
  if (!row) return

  if (row._isNew) {
    state.value.links = state.value.links.filter(item => item.id !== linkId)
  } else {
    row._isDeleted = true
    row._isDirty = true
  }

  if (selectedModelLinkId.value === linkId) {
    selectedModelLinkId.value = null
    selectedEdgeInstanceId.value = null
  }
  if (selectedCanvasElementId.value?.startsWith('edge-')) selectedCanvasElementId.value = null
}

const applyDiagramSelection = (diagramId: string) => {
  selectedDiagramId.value = diagramId
  selectedModelNodeIds.value = []
  selectedInstanceIds.value = []
  selectedModelLinkId.value = null
  selectedEdgeInstanceId.value = null
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
  if (action === 'close') {
    selectedDiagramId.value = null
    selectedModelNodeIds.value = []
    selectedInstanceIds.value = []
    selectedModelLinkId.value = null
    selectedEdgeInstanceId.value = null
    cancelDiagramSwitch()
    return
  }

  const targetDiagramId = pendingDiagramSwitchId.value
  if (!targetDiagramId) {
    cancelDiagramSwitch()
    return
  }
  const restoredTarget = state.value.diagrams.find(
    diagram => diagram.id === targetDiagramId && !diagram._isDeleted
  )
  if (!restoredTarget) {
    setUiError('Не удалось открыть выбранную диаграмму после обновления данных.')
    cancelDiagramSwitch()
    return
  }

  applyDiagramSelection(restoredTarget.id)
  cancelDiagramSwitch()
}

const isRequiredPropertyFilled = (value: unknown, type: string): boolean => {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined
}

const validateRequiredCustomProperties = (): string | null => {
  const componentById = new Map(state.value.components.map(component => [component.id, component]))
  const relationById = new Map(state.value.relations.map(relation => [relation.id, relation]))

  for (const node of state.value.nodes) {
    if (node._isDeleted) continue

    for (const [notationId, binding] of Object.entries(node.parsedAttrs.notationComponents)) {
      const component = componentById.get(binding.componentId)
      if (!component || component.notationId !== notationId) continue

      const requiredProperties = parseEntityAttrs(component.attrs ?? null).customProperties.filter(
        property => property.required && !property.system
      )
      if (requiredProperties.length === 0) continue

      const scopedValues = getDiagramScopedNodeValues({
        diagram: activeDiagram.value?.parsedAttrs,
        modelNodeId: node.id,
        notationId,
        componentId: binding.componentId,
        nodeAttrsFallback: node.parsedAttrs,
      })
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
        property => property.required && !property.system
      )
      if (requiredProperties.length === 0) continue

      const scopedValues = getDiagramScopedLinkValues({
        diagram: activeDiagram.value?.parsedAttrs,
        modelLinkId: link.id,
        notationId,
        relationId: binding.relationId,
        linkAttrsFallback: link.parsedAttrs,
      })
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
  diagramCanvasRef.value?.flushCanvasState()
  await nextTick()
  const ok = await saveChanges()
  if (ok) {
    diagramInteractionManager.value?.history?.clear?.()
    if (activeDiagram.value?.id && diagramRenderer.value) {
      void uploadDiagramPreview()
    }
  }
  return ok
}

const saveAndSwitchDiagram = async () => {
  const action = pendingDiagramAction.value
  if (!action) return
  const ok = await saveWithValidation()
  if (!ok) return
  if (action === 'close') {
    selectedDiagramId.value = null
    selectedModelNodeIds.value = []
    selectedInstanceIds.value = []
    selectedModelLinkId.value = null
    selectedEdgeInstanceId.value = null
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
    pendingDiagramAction.value = 'switch'
    pendingDiagramSwitchId.value = diagramId
    showDiagramSwitchModal.value = true
    return
  }
  applyDiagramSelection(diagramId)
}

const cancelLinkDelete = () => {
  pendingDeleteLinkId.value = null
  pendingDeleteEdgeInstanceId.value = null
  showLinkDeleteModal.value = false
}

const openLinkDeleteDialog = (linkId: string, edgeInstanceId?: string) => {
  pendingDeleteLinkId.value = linkId
  pendingDeleteEdgeInstanceId.value = edgeInstanceId ?? null
  showLinkDeleteModal.value = true
}

const removeLinkFromCurrentDiagram = () => {
  const linkId = pendingDeleteLinkId.value
  const edgeInstanceId = pendingDeleteEdgeInstanceId.value
  const diagram = activeDiagram.value
  if (!linkId || !diagram) {
    cancelLinkDelete()
    return
  }

  const removedEdges = diagram.parsedAttrs.instances.edges
    .map((edge, index) => ({ index, edge: JSON.parse(JSON.stringify(edge)) }))
    .filter(
      entry =>
        entry.edge.modelLinkId === linkId &&
        (edgeInstanceId == null || entry.edge.id === edgeInstanceId)
    )
  if (removedEdges.length === 0) {
    cancelLinkDelete()
    return
  }

  const idsToRemove = new Set(removedEdges.map(e => e.edge.id))

  const applyRemoval = () => {
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      edge => !idsToRemove.has(edge.id)
    )
    if (selectedModelLinkId.value === linkId) {
      selectedModelLinkId.value = null
      selectedEdgeInstanceId.value = null
    }
    if (selectedCanvasElementId.value?.startsWith('edge-')) selectedCanvasElementId.value = null
    markDiagramDirty(diagram.id)
  }

  const restoreRemoved = () => {
    const currentEdges = [...diagram.parsedAttrs.instances.edges]
    for (const { index, edge } of removedEdges) {
      const alreadyExists = currentEdges.some(item => item.id === edge.id)
      if (alreadyExists) continue
      const safeIndex = Math.max(0, Math.min(index, currentEdges.length))
      currentEdges.splice(safeIndex, 0, JSON.parse(JSON.stringify(edge)))
    }
    diagram.parsedAttrs.instances.edges = currentEdges
    markDiagramDirty(diagram.id)
  }

  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === 'function') {
    history.execute({
      execute: applyRemoval,
      undo: restoreRemoved,
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
      edge => edge.modelLinkId !== linkId
    )
    if (diagram.parsedAttrs.instances.edges.length !== initial) {
      markDiagramDirty(diagram.id)
    }
  }

  if (isDiagramOnlyEdgeModelLinkId(linkId)) {
    if (selectedModelLinkId.value === linkId) {
      selectedModelLinkId.value = null
      selectedEdgeInstanceId.value = null
      if (selectedCanvasElementId.value?.startsWith('edge-')) selectedCanvasElementId.value = null
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
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const onDeleteKeydown = (event: KeyboardEvent) => {
  const isCtrlOrMeta = event.ctrlKey || event.metaKey
  const key = event.code.startsWith('Key')
    ? event.code.slice(3).toLowerCase()
    : event.key.toLowerCase()
  const skipHotkeys = shouldSkipDeleteHotkey(event)

  if (isCtrlOrMeta && !event.shiftKey && key === 'c') {
    if (!skipHotkeys && copySelectedNotesToClipboard()) {
      event.preventDefault()
    }
    return
  }

  if (isCtrlOrMeta && !event.shiftKey && key === 'v') {
    if (!skipHotkeys && pasteCopiedNotes()) {
      event.preventDefault()
    }
    return
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (!activeDiagram.value) return
  if (isDiagramReadOnly.value) return
  if (showLinkDeleteModal.value || showNodeDeleteModal.value || shouldSkipDeleteHotkey(event))
    return

  if (selectedModelNodeIds.value.length > 0 || selectedInstanceIds.value.length > 0) {
    event.preventDefault()
    openNodeDeleteDialog(
      selectedModelNodeIds.value,
      'canvas',
      selectedInstanceIds.value.length > 0 ? selectedInstanceIds.value : []
    )
    return
  }

  if (!selectedModelLinkId.value) return
  event.preventDefault()
  openLinkDeleteDialog(
    selectedModelLinkId.value,
    selectedEdgeInstanceId.value ?? undefined
  )
}

const getSelectedDiagramInstances = (): DiagramNodeInstance[] => {
  const diagram = activeDiagram.value
  if (!diagram) return []

  const byId = new Map<string, DiagramNodeInstance>()

  if (selectedInstanceIds.value.length > 0) {
    const selectedSet = new Set(selectedInstanceIds.value)
    for (const instance of diagram.parsedAttrs.instances.nodes) {
      if (selectedSet.has(instance.id)) {
        byId.set(instance.id, instance)
      }
    }
  } else if (selectedModelNodeIds.value.length > 0) {
    const selectedSet = new Set(selectedModelNodeIds.value)
    for (const instance of diagram.parsedAttrs.instances.nodes) {
      if (selectedSet.has(instance.modelNodeId)) {
        byId.set(instance.id, instance)
      }
    }
  }

  return Array.from(byId.values())
}

const copySelectedNotesToClipboard = (): boolean => {
  if (!activeDiagram.value) return false

  const selectedNotes = getSelectedDiagramInstances()
    .filter(instance => isNoteInstance(instance))
    .map(instance => deepClone(instance))

  if (selectedNotes.length === 0) return false

  noteClipboard.value = selectedNotes
  notePasteCount.value = 0
  return true
}

const pasteCopiedNotes = (): boolean => {
  const diagram = activeDiagram.value
  if (!diagram || isDiagramReadOnly.value) return false
  if (!noteClipboard.value || noteClipboard.value.length === 0) return false

  const pasteOffset = NOTE_PASTE_STEP * (notePasteCount.value + 1)
  const pastedNotes = noteClipboard.value.map(source => {
    const nextId = createId()
    return {
      ...deepClone(source),
      id: nextId,
      modelNodeId: `${NOTE_NODE_PREFIX}${nextId}`,
      x: source.x + pasteOffset,
      y: source.y + pasteOffset,
    } satisfies DiagramNodeInstance
  })

  const pastedInstanceIds = pastedNotes.map(note => note.id)
  const pastedModelNodeIds = pastedNotes.map(note => note.modelNodeId)

  executeDiagramHistoryCommand({
    execute: () => {
      const existingIds = new Set(diagram.parsedAttrs.instances.nodes.map(item => item.id))
      for (const note of pastedNotes) {
        if (!existingIds.has(note.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(note))
        }
      }
      selectedModelNodeIds.value = pastedModelNodeIds
      selectedInstanceIds.value = pastedInstanceIds
      selectedModelLinkId.value = null
      selectedEdgeInstanceId.value = null
      selectedCanvasElementId.value =
        pastedInstanceIds.length === 1 ? `instance-${pastedInstanceIds[0]}` : null
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      const pastedSet = new Set(pastedInstanceIds)
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        item => !pastedSet.has(item.id)
      )
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        edge => !pastedSet.has(edge.sourceInstanceId) && !pastedSet.has(edge.targetInstanceId)
      )
      selectedModelNodeIds.value = []
      selectedInstanceIds.value = []
      selectedModelLinkId.value = null
      selectedEdgeInstanceId.value = null
      selectedCanvasElementId.value = null
      markDiagramDirty(diagram.id)
    },
  })

  notePasteCount.value += 1
  return true
}

watch(
  () => activeDiagram.value?.id ?? null,
  diagramId => {
    if (!diagramId) {
      selectedCanvasElementId.value = null
    }
  }
)

const setDiagramAttrs = (next: DiagramAttrs) => {
  const diagram = activeDiagram.value
  if (!diagram) return
  if (isDiagramReadOnly.value) return
  syncLinkEndpointsFromDiagram({
    prevDiagramAttrs: diagram.parsedAttrs,
    nextDiagramAttrs: next,
    links: state.value.links,
    markLinkDirty,
    isDiagramOnlyEdgeModelLinkId,
  })

  const idx = state.value.diagrams.findIndex(
    d => d.id === diagram.id && !d._isDeleted
  )
  if (idx >= 0) {
    const diagrams = [...state.value.diagrams]
    const current = diagrams[idx]
    if (!current) return
    diagrams[idx] = { ...current, parsedAttrs: next }
    state.value.diagrams = diagrams
  }
  markDiagramDirty(diagram.id)
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
    componentChoiceOptions.value = options.map(item => ({ id: item.id, name: item.name }))
    showComponentChoiceModal.value = true
    return false
  }
  setUiError('В выбранной нотации нет подходящего компонента для типа узла.')
  return false
}

const addExistingNodeToDiagram = (modelNodeId: string, x: number, y: number) => {
  const diagram = activeDiagram.value
  if (!diagram) return
  const node = state.value.nodes.find(item => item.id === modelNodeId && !item._isDeleted)
  if (!node) return
  if (isDirectoryNode(modelNodeId)) {
    const directoryNoteInstance = {
      id: createId(),
      modelNodeId,
      x,
      y,
      width: 230,
      height: 126,
      attrs: {
        isNote: true,
        isDirectoryNote: true,
        noteText: node.name,
        diagramStyle: {
          nodeShape: 'rectangle',
          fillColor: '#eaf2ff',
          strokeColor: '#6f94ff',
          strokeWidth: 1.5,
          labelColor: '#233a80',
          labelFontSize: 13,
          labelAlign: 'left',
          labelInset: 12,
          labelPlacement: 'center',
          iconName: 'folder',
          iconPlacement: 'top-left',
          iconWidth: 16,
          iconHeight: 16,
          iconInset: 8,
        },
      } as Record<string, unknown>,
    }

    executeDiagramHistoryCommand({
      execute: () => {
        const alreadyExists = diagram.parsedAttrs.instances.nodes.some(
          item => item.id === directoryNoteInstance.id
        )
        if (!alreadyExists) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(directoryNoteInstance))
        }
        markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== directoryNoteInstance.id
        )
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          edge =>
            edge.sourceInstanceId !== directoryNoteInstance.id &&
            edge.targetInstanceId !== directoryNoteInstance.id
        )
        markDiagramDirty(diagram.id)
      },
    })
    return
  }
  const hasBinding = ensureNodeBindingByNodeType(node)
  if (!hasBinding) {
    return
  }

  const notationId = activeNotationId.value
  const componentId = notationId
    ? (node.parsedAttrs.notationComponents[notationId]?.componentId ?? null)
    : null
  const component = componentId
    ? state.value.components.find(item => item.id === componentId && item.notationId === notationId)
    : null
  const diagramStyle = component
    ? parseEntityAttrs(component.attrs ?? null).diagramStyle
    : undefined
  const width = typeof diagramStyle?.width === 'number' ? diagramStyle.width : 160
  const height = typeof diagramStyle?.height === 'number' ? diagramStyle.height : 56

  const nodeInstance = {
    id: createId(),
    modelNodeId,
    x,
    y,
    width,
    height,
    attrs: diagramStyle ? { diagramStyle: JSON.parse(JSON.stringify(diagramStyle)) } : undefined,
  }

  executeDiagramHistoryCommand({
    execute: () => {
      const alreadyExists = diagram.parsedAttrs.instances.nodes.some(
        item => item.id === nodeInstance.id
      )
      if (!alreadyExists) {
        diagram.parsedAttrs.instances.nodes.push(deepClone(nodeInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        item => item.id !== nodeInstance.id
      )
      markDiagramDirty(diagram.id)
    },
  })
}

const createNodeFromPaletteComponent = (componentId: string, x: number, y: number) => {
  if (isDiagramReadOnly.value) return
  const diagram = activeDiagram.value
  if (!diagram || !diagram.nodeId) {
    setUiError('Нельзя создать ноду без активной директории диаграммы.')
    return
  }
  const component = state.value.components.find(item => item.id === componentId)
  if (!component) return
  const nodeId = createId()
  const notationId = activeNotationId.value
  const defaultDirectoryPath = nodeTypeDefaultDirectoryById.value.get(component.nodeTypeId) ?? ''
  if (defaultDirectoryPath && !directoryNodeType.value) {
    setUiError('Для автосоздания пути нужен тип узла Directory.')
    return
  }
  const parsedComponentAttrs = parseEntityAttrs(component.attrs ?? null)
  const ds = parsedComponentAttrs.diagramStyle
  const width = typeof ds?.width === 'number' ? ds.width : 160
  const height = typeof ds?.height === 'number' ? ds.height : 56
  const instanceId = createId()
  const newInstance = {
    id: instanceId,
    modelNodeId: nodeId,
    x,
    y,
    width,
    height,
    attrs: ds ? { diagramStyle: JSON.parse(JSON.stringify(ds)) } : undefined,
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
        _isNew: true,
      }

      const hasNode = state.value.nodes.some(item => item.id === nodeId)
      if (!hasNode) {
        state.value.nodes.push(deepClone(newNode))
      }
      const hasInstance = diagram.parsedAttrs.instances.nodes.some(
        item => item.id === newInstance.id
      )
      if (!hasInstance) {
        diagram.parsedAttrs.instances.nodes.push(deepClone(newInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      state.value.nodes = state.value.nodes.filter(
        item => item.id !== nodeId && !createdDirectoryIds.includes(item.id)
      )
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        item => item.id !== newInstance.id
      )
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        edge => edge.sourceInstanceId !== newInstance.id && edge.targetInstanceId !== newInstance.id
      )
      if (selectedModelNodeIds.value.includes(nodeId)) {
        selectedModelNodeIds.value = selectedModelNodeIds.value.filter(id => id !== nodeId)
      }
      if (
        selectedNodeId.value === nodeId ||
        createdDirectoryIds.includes(selectedNodeId.value ?? '')
      ) {
        selectedNodeId.value = null
      }
      markDiagramDirty(diagram.id)
    },
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
      noteText: 'Новая заметка',
      diagramStyle: {
        nodeShape: 'rectangle',
        fillColor: '#fff9c4',
        strokeColor: '#e6c85b',
        strokeWidth: 1.5,
        labelColor: '#5a4600',
        labelFontSize: 13,
        labelAlign: 'left',
        labelInset: 10,
        labelPlacement: 'center',
      },
    } as Record<string, unknown>,
  }

  executeDiagramHistoryCommand({
    execute: () => {
      const exists = diagram.parsedAttrs.instances.nodes.some(item => item.id === noteInstance.id)
      if (!exists) {
        diagram.parsedAttrs.instances.nodes.push(deepClone(noteInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
        item => item.id !== noteInstance.id
      )
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        edge =>
          edge.sourceInstanceId !== noteInstance.id && edge.targetInstanceId !== noteInstance.id
      )
      selectedModelNodeIds.value = selectedModelNodeIds.value.filter(id => id !== modelNodeId)
      if (selectedCanvasElementId.value === `instance-${noteInstance.id}`) {
        selectedCanvasElementId.value = null
      }
      if (editingNoteInstanceId.value === noteInstance.id) {
        showNoteEditorModal.value = false
        editingNoteInstanceId.value = null
      }
      markDiagramDirty(diagram.id)
    },
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
  if (isActiveNotationRulesLoading.value) {
    setUiError(t('models.relationRulesLoadingConnectBlocked'))
    return
  }

  const diagram = activeDiagram.value
  if (!diagram) return
  if (
    isNoteLikeConnection(sourceModelNodeId, targetModelNodeId, sourceInstanceId, targetInstanceId)
  ) {
    const modelLinkId = `${NOTE_EDGE_PREFIX}${createId()}`
    const edgeAttrs: Record<string, unknown> = {
      isDiagramOnly: true,
      diagramStyle: {
        edgeType: defaultEdgeType.value,
        startMarkerType: 'none',
        endMarkerType: 'none',
        lineDash: [4, 4],
      },
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
      attrs: edgeAttrs,
    }
    executeDiagramHistoryCommand({
      execute: () => {
        const hasEdge = diagram.parsedAttrs.instances.edges.some(
          edge => edge.id === noteEdgeInstance.id
        )
        if (!hasEdge) {
          diagram.parsedAttrs.instances.edges.push(deepClone(noteEdgeInstance))
        }
        markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          edge => edge.id !== noteEdgeInstance.id
        )
        if (selectedModelLinkId.value === modelLinkId) {
          selectedModelLinkId.value = null
          selectedEdgeInstanceId.value = null
          selectedCanvasElementId.value = null
        }
        markDiagramDirty(diagram.id)
      },
    })
    return
  }

  const notationId = activeNotationId.value
  if (!notationId) return
  const sourceNode = state.value.nodes.find(item => item.id === sourceModelNodeId)
  const targetNode = state.value.nodes.find(item => item.id === targetModelNodeId)
  if (!sourceNode || !targetNode) return

  const sourceComponentId = sourceNode.parsedAttrs.notationComponents[notationId]?.componentId
  const targetComponentId = targetNode.parsedAttrs.notationComponents[notationId]?.componentId
  if (!sourceComponentId || !targetComponentId) {
    setUiError('Перед созданием связи нужно выбрать компоненты для обеих нод в текущей нотации.')
    return
  }

  const ruleRelationIds = state.value.relationRules
    .filter(
      rule => rule.fromComponentId === sourceComponentId && rule.toComponentId === targetComponentId
    )
    .map(rule => rule.relationId)
  if (ruleRelationIds.length === 0) {
    setUiError('Для этой пары компонентов нет разрешённых связей по правилам нотации.')
    return
  }
  const allowedRelations = state.value.relations.filter(
    relation => relation.notationId === notationId && ruleRelationIds.includes(relation.id)
  )
  if (allowedRelations.length === 0) {
    setUiError('Для этой пары компонентов нет доступных relation по правилам нотации.')
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
    targetOutlineParam,
  }

  // Сохраняем доступные relations для возможного выбора позже
  relationChoiceOptions.value = allowedRelations.map(relation => ({
    id: relation.id,
    name: relation.name,
    linkTypeId: relation.linkTypeId,
  }))

  // Собираем все существующие связи для всех allowedRelations
  const existingLinks: EditorLink[] = []
  for (const relation of allowedRelations) {
    const links = state.value.links.filter(
      link =>
        !link._isDeleted &&
        link.sourceId === sourceModelNodeId &&
        link.targetId === targetModelNodeId &&
        link.linkTypeId === relation.linkTypeId
    )
    existingLinks.push(...links)
  }

  // Если есть существующие связи, показываем их первым делом
  if (existingLinks.length > 0) {
    reuseLinkOptions.value = existingLinks
    showReuseLinkModal.value = true
    return
  }

  // Если нет существующих связей, показываем выбор relation (если > 1)
  if (allowedRelations.length === 1) {
    finalizeConnection(allowedRelations[0]!.id)
    return
  }
  showRelationChoiceModal.value = true
}

const finalizeConnection = (relationId: string) => {
  const notationId = activeNotationId.value
  const diagram = activeDiagram.value
  const connection = pendingConnection.value
  if (!notationId || !diagram || !connection) return
  showRelationChoiceModal.value = false
  const relation = state.value.relations.find(item => item.id === relationId)
  if (!relation) return

  pendingRelationId.value = relationId
  createOrReuseLink(null)
}

const handleCreateNewLinkFromReuseModal = () => {
  showReuseLinkModal.value = false

  // Если есть только один relation, используем его сразу
  if (relationChoiceOptions.value.length === 1) {
    finalizeConnection(relationChoiceOptions.value[0]!.id)
    return
  }

  // Иначе показываем выбор relation
  showRelationChoiceModal.value = true
}

const handleRequestAutoLink = (
  sourceModelNodeId: string,
  targetModelNodeId: string,
  sourceInstanceId: string,
  targetInstanceId: string,
  availableRelations: RelationResponse[],
  existingLinksNotOnDiagram: EditorLink[]
) => {
  const diagram = activeDiagram.value
  if (!diagram) return

  // Store connection data
  pendingConnection.value = {
    sourceModelNodeId,
    targetModelNodeId,
    sourceInstanceId,
    targetInstanceId,
    sourcePortId: undefined,
    targetPortId: undefined,
    sourceOutlineParam: undefined,
    targetOutlineParam: undefined,
  }

  // Если есть существующие связи не на диаграмме - показываем диалог использования
  if (existingLinksNotOnDiagram.length > 0) {
    reuseLinkOptions.value = existingLinksNotOnDiagram
    showReuseLinkModal.value = true
    return
  }

  // Prepare relation options
  relationChoiceOptions.value = availableRelations.map(relation => ({
    id: relation.id,
    name: relation.name,
    linkTypeId: relation.linkTypeId,
  }))

  // Связей нет - нужно создать новую
  // Если только один relation - спрашиваем создать ли связь
  if (availableRelations.length === 1) {
    // Показываем диалог с одним вариантом (как при перетаскивании с Shift)
    showRelationChoiceModal.value = true
    return
  }

  // Несколько вариантов - показываем выбор
  showRelationChoiceModal.value = true
}

const handleSelectExistingLink = (linkId: string) => {
  const notationId = activeNotationId.value
  const link = state.value.links.find(item => item.id === linkId)
  if (!notationId || !link) return

  // Находим relationId по linkTypeId и notationId
  const relation = state.value.relations.find(
    item => item.notationId === notationId && item.linkTypeId === link.linkTypeId
  )
  if (!relation) return

  pendingRelationId.value = relation.id
  createOrReuseLink(linkId)
}

const createOrReuseLink = (linkId: string | null) => {
  const notationId = activeNotationId.value
  const diagram = activeDiagram.value
  const connection = pendingConnection.value
  const relationId = pendingRelationId.value
  if (!notationId || !diagram || !connection || !relationId) return
  const relation = state.value.relations.find(item => item.id === relationId)
  if (!relation) return

  const isNewLink = !linkId
  const resolvedLinkId = linkId ?? createId()
  const existingLink = state.value.links.find(item => item.id === resolvedLinkId) ?? null
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
        _isNew: true,
      }
    : null

  const relParsed = parseEntityAttrs(relation.attrs ?? null)
  const relationDs = relParsed.diagramStyle
  const edgeAttrs: Record<string, unknown> = {}
  const diagramStyle: Record<string, unknown> = relationDs
    ? JSON.parse(JSON.stringify(relationDs))
    : {}
  diagramStyle.edgeType = defaultEdgeType.value
  if (Object.keys(diagramStyle).length > 0) {
    edgeAttrs.diagramStyle = diagramStyle
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
    attrs: Object.keys(edgeAttrs).length ? edgeAttrs : undefined,
  }

  executeDiagramHistoryCommand({
    execute: () => {
      let link = state.value.links.find(item => item.id === resolvedLinkId) ?? null
      if (!link && newLink) {
        state.value.links.push(deepClone(newLink))
        link = state.value.links.find(item => item.id === resolvedLinkId) ?? null
      }
      if (!link) return

      bindLinkRelation(link, relation.id)
      const hasEdge = diagram.parsedAttrs.instances.edges.some(
        edge => edge.id === newEdgeInstance.id
      )
      if (!hasEdge) {
        diagram.parsedAttrs.instances.edges.push(deepClone(newEdgeInstance))
      }
      markDiagramDirty(diagram.id)
    },
    undo: () => {
      diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
        edge => edge.id !== newEdgeInstance.id
      )

      if (isNewLink) {
        state.value.links = state.value.links.filter(item => item.id !== resolvedLinkId)
      } else if (previousParsedAttrs) {
        const link = state.value.links.find(item => item.id === resolvedLinkId)
        if (link) {
          link.parsedAttrs = deepClone(previousParsedAttrs)
          markLinkDirty(link.id)
        }
      }
      markDiagramDirty(diagram.id)
    },
  })

  pendingConnection.value = null
  pendingRelationId.value = null
  showReuseLinkModal.value = false
}

const canConnect = (sourceModelNodeId: string, targetModelNodeId: string): boolean => {
  if (isActiveNotationRulesLoading.value) return false
  if (isDiagramNoteModelNodeId(sourceModelNodeId) || isDiagramNoteModelNodeId(targetModelNodeId)) {
    return true
  }
  if (isDirectoryNode(sourceModelNodeId) || isDirectoryNode(targetModelNodeId)) {
    return true
  }
  const notationId = activeNotationId.value
  if (!notationId) return false
  const sourceNode = state.value.nodes.find(item => item.id === sourceModelNodeId)
  const targetNode = state.value.nodes.find(item => item.id === targetModelNodeId)
  if (!sourceNode || !targetNode) return false
  const sourceComponentId = sourceNode.parsedAttrs.notationComponents[notationId]?.componentId
  const targetComponentId = targetNode.parsedAttrs.notationComponents[notationId]?.componentId
  if (!sourceComponentId || !targetComponentId) return false
  return state.value.relationRules.some(
    rule => rule.fromComponentId === sourceComponentId && rule.toComponentId === targetComponentId
  )
}

const handleReconnectEdge = (
  edgeInstanceId: string,
  endpoint: 'start' | 'end',
  newInstanceId: string,
  portId?: string,
  outlineParam?: number
) => {
  const diagram = activeDiagram.value
  if (!diagram) return

  const edgeInst = diagram.parsedAttrs.instances.edges.find(edge => edge.id === edgeInstanceId)
  if (!edgeInst) return

  const newNodeInstance = diagram.parsedAttrs.instances.nodes.find(n => n.id === newInstanceId)
  if (!newNodeInstance) return

  const prevSourceId = edgeInst.sourceInstanceId
  const prevTargetId = edgeInst.targetInstanceId
  const prevAttrs = edgeInst.attrs ? deepClone(edgeInst.attrs) : undefined

  const link = !isDiagramOnlyEdgeModelLinkId(edgeInst.modelLinkId)
    ? state.value.links.find(l => l.id === edgeInst.modelLinkId && !l._isDeleted)
    : null

  const prevInstanceId = endpoint === 'start' ? prevSourceId : prevTargetId
  const prevInstance = diagram.parsedAttrs.instances.nodes.find(n => n.id === prevInstanceId)
  const prevModelNodeId = prevInstance?.modelNodeId
  const newModelNodeId = newNodeInstance.modelNodeId

  const prevLinkSourceId = link?.sourceId
  const prevLinkTargetId = link?.targetId

  executeDiagramHistoryCommand({
    execute: () => {
      if (endpoint === 'start') {
        edgeInst.sourceInstanceId = newInstanceId
        if (!edgeInst.attrs) edgeInst.attrs = {}
        if (portId !== undefined) edgeInst.attrs.fromPortId = portId
        else delete edgeInst.attrs.fromPortId
        if (outlineParam !== undefined) edgeInst.attrs.fromOutlineParam = outlineParam
        else delete edgeInst.attrs.fromOutlineParam
      } else {
        edgeInst.targetInstanceId = newInstanceId
        if (!edgeInst.attrs) edgeInst.attrs = {}
        if (portId !== undefined) edgeInst.attrs.toPortId = portId
        else delete edgeInst.attrs.toPortId
        if (outlineParam !== undefined) edgeInst.attrs.toOutlineParam = outlineParam
        else delete edgeInst.attrs.toOutlineParam
      }
      if (Object.keys(edgeInst.attrs).length === 0) delete edgeInst.attrs

      if (link && prevModelNodeId !== newModelNodeId) {
        if (endpoint === 'start') {
          link.sourceId = newModelNodeId
        } else {
          link.targetId = newModelNodeId
        }
        markLinkDirty(link.id)
      }

      markDiagramDirty(diagram.id)
    },
    undo: () => {
      edgeInst.sourceInstanceId = prevSourceId
      edgeInst.targetInstanceId = prevTargetId
      edgeInst.attrs = prevAttrs ? deepClone(prevAttrs) : undefined

      if (link && prevLinkSourceId !== undefined && prevLinkTargetId !== undefined) {
        link.sourceId = prevLinkSourceId
        link.targetId = prevLinkTargetId
        markLinkDirty(link.id)
      }

      markDiagramDirty(diagram.id)
    },
  })
}

const handleFindInTree = (modelNodeId: string) => {
  selectedNodeId.value = modelNodeId
  treePanelRef.value?.focusNode?.(modelNodeId)
}

const handleTreeSelectNode = (nodeId: string) => {
  selectedNodeId.value = nodeId
  if (!selectionSyncEnabled.value) return
  selectedModelLinkId.value = null
  selectedEdgeInstanceId.value = null
  selectedInstanceIds.value = []
  selectedModelNodeIds.value = [nodeId]
  nextTick(() => {
    diagramCanvasRef.value?.zoomToSelection()
  })
}

const handleCanvasSelectNodes = (modelNodeIds: string[]) => {
  selectedModelNodeIds.value = modelNodeIds
  selectedModelLinkId.value = null
  selectedEdgeInstanceId.value = null
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
    selectedEdgeInstanceId.value = null
    selectedModelNodeIds.value = [selectedNodeId.value]
    nextTick(() => {
      diagramCanvasRef.value?.zoomToSelection()
    })
  }
}

const handleNodeLabelChange = (modelNodeId: string, newLabel: string) => {
  const node = state.value.nodes.find(item => item.id === modelNodeId)
  if (!node || node.name === newLabel) return
  node.name = newLabel
  markNodeDirty(node.id)
}

const isDirectoryNode = (nodeId: string): boolean => {
  const node = state.value.nodes.find(item => item.id === nodeId)
  if (!node) return false
  const nodeType = state.value.nodeTypes.find(type => type.id === node.nodeTypeId)
  return (nodeType?.name ?? '').trim().toLowerCase() === 'directory'
}

const isDescendantNode = (nodeId: string, potentialParentId: string): boolean => {
  const children = state.value.nodes.filter(
    item => item.parentNodeId === potentialParentId && !item._isDeleted
  )
  for (const child of children) {
    if (child.id === nodeId) return true
    if (isDescendantNode(nodeId, child.id)) return true
  }
  return false
}

const handleMoveNode = (
  nodeId: string,
  targetNodeId: string | null,
  position: 'above' | 'below' | 'inside'
) => {
  const nodes = state.value.nodes
  const fromIndex = nodes.findIndex(item => item.id === nodeId)
  if (fromIndex < 0) return
  const movingNode = nodes[fromIndex]!

  if (targetNodeId && (targetNodeId === nodeId || isDescendantNode(targetNodeId, nodeId))) return

  const targetNode = targetNodeId ? nodes.find(item => item.id === targetNodeId) : null
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
  } else if (position === 'inside' && isDirectoryNode(targetNode.id)) {
    newParentNodeId = targetNode.id
    const childIndices = nodes
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) => item.id !== nodeId && !item._isDeleted && item.parentNodeId === targetNode.id
      )
      .map(({ index }) => index)
    insertIndex =
      childIndices.length > 0
        ? childIndices[childIndices.length - 1]! + 1
        : nodes.indexOf(targetNode) + 1
  } else {
    newParentNodeId = targetNode.parentNodeId ?? null
    const targetIndex = nodes.indexOf(targetNode)
    insertIndex = position === 'above' ? targetIndex : targetIndex + 1
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
  const diagram = state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
  if (!diagram) return
  if (diagram.nodeId === newNodeId) return
  diagram.nodeId = newNodeId
  markDiagramDirty(diagram.id)
}

const handleRenameNode = (nodeId: string, newName: string) => {
  const node = state.value.nodes.find(item => item.id === nodeId)
  if (!node || node.name === newName) return
  node.name = newName
  markNodeDirty(node.id)
}

const handleRenameDiagram = (diagramId: string, newName: string) => {
  const diagram = state.value.diagrams.find(item => item.id === diagramId)
  const trimmedName = newName.trim()
  if (!diagram || !trimmedName) return
  if (diagram.name === trimmedName) return

  const oldNameNormalized = diagram.name.trim().toLowerCase()
  for (const row of state.value.diagrams) {
    if (row._isDeleted) continue
    if (row.modelId !== diagram.modelId) continue
    if (row.name.trim().toLowerCase() !== oldNameNormalized) continue
    if (row.name === trimmedName) continue
    row.name = trimmedName
    markDiagramDirty(row.id)
  }
}

const removeNodesFromCurrentDiagramByInstances = (instanceIds: string[]) => {
  const diagram = activeDiagram.value
  if (!diagram || instanceIds.length === 0) return

  const instanceIdSet = new Set(instanceIds)
  const removedNodes = diagram.parsedAttrs.instances.nodes
    .filter(nodeInst => instanceIdSet.has(nodeInst.id))
    .map(nodeInst => JSON.parse(JSON.stringify(nodeInst)))
  const removedInstanceIds = new Set(removedNodes.map(nodeInst => nodeInst.id))
  if (removedInstanceIds.size === 0) return

  const removedEdges = diagram.parsedAttrs.instances.edges
    .filter(
      edgeInst =>
        removedInstanceIds.has(edgeInst.sourceInstanceId) ||
        removedInstanceIds.has(edgeInst.targetInstanceId)
    )
    .map(edgeInst => JSON.parse(JSON.stringify(edgeInst)))

  const applyRemoval = () => {
    diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
      nodeInst => !removedInstanceIds.has(nodeInst.id)
    )
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      edgeInst => !removedEdges.some(removed => removed.id === edgeInst.id)
    )
    selectedModelNodeIds.value = []
    selectedInstanceIds.value = []
    selectedCanvasElementId.value = null
    markDiagramDirty(diagram.id)
  }

  const restoreRemoved = () => {
    const existingNodeIds = new Set(
      diagram.parsedAttrs.instances.nodes.map(nodeInst => nodeInst.id)
    )
    for (const nodeInst of removedNodes) {
      if (!existingNodeIds.has(nodeInst.id)) {
        diagram.parsedAttrs.instances.nodes.push(JSON.parse(JSON.stringify(nodeInst)))
      }
    }

    const existingEdgeIds = new Set(
      diagram.parsedAttrs.instances.edges.map(edgeInst => edgeInst.id)
    )
    for (const edgeInst of removedEdges) {
      if (!existingEdgeIds.has(edgeInst.id)) {
        diagram.parsedAttrs.instances.edges.push(JSON.parse(JSON.stringify(edgeInst)))
      }
    }

    markDiagramDirty(diagram.id)
  }

  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === 'function') {
    history.execute({
      execute: applyRemoval,
      undo: restoreRemoved,
    })
    return
  }

  applyRemoval()
}

const removeNodesFromCurrentDiagram = (modelNodeIds: string[]) => {
  const diagram = activeDiagram.value
  if (!diagram || modelNodeIds.length === 0) return

  const selectedSet = new Set(modelNodeIds)
  const removedNodes = diagram.parsedAttrs.instances.nodes
    .filter(nodeInst => selectedSet.has(nodeInst.modelNodeId))
    .map(nodeInst => JSON.parse(JSON.stringify(nodeInst)))
  const removedInstanceIds = new Set(removedNodes.map(nodeInst => nodeInst.id))
  if (removedInstanceIds.size === 0) return

  const removedEdges = diagram.parsedAttrs.instances.edges
    .filter(
      edgeInst =>
        removedInstanceIds.has(edgeInst.sourceInstanceId) ||
        removedInstanceIds.has(edgeInst.targetInstanceId)
    )
    .map(edgeInst => JSON.parse(JSON.stringify(edgeInst)))

  const applyRemoval = () => {
    diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
      nodeInst => !removedInstanceIds.has(nodeInst.id)
    )
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      edgeInst => !removedEdges.some(removed => removed.id === edgeInst.id)
    )
    selectedModelNodeIds.value = []
    selectedInstanceIds.value = []
    selectedCanvasElementId.value = null
    markDiagramDirty(diagram.id)
  }

  const restoreRemoved = () => {
    const existingNodeIds = new Set(
      diagram.parsedAttrs.instances.nodes.map(nodeInst => nodeInst.id)
    )
    for (const nodeInst of removedNodes) {
      if (!existingNodeIds.has(nodeInst.id)) {
        diagram.parsedAttrs.instances.nodes.push(JSON.parse(JSON.stringify(nodeInst)))
      }
    }

    const existingEdgeIds = new Set(
      diagram.parsedAttrs.instances.edges.map(edgeInst => edgeInst.id)
    )
    for (const edgeInst of removedEdges) {
      if (!existingEdgeIds.has(edgeInst.id)) {
        diagram.parsedAttrs.instances.edges.push(JSON.parse(JSON.stringify(edgeInst)))
      }
    }

    markDiagramDirty(diagram.id)
  }

  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === 'function') {
    history.execute({
      execute: applyRemoval,
      undo: restoreRemoved,
    })
    return
  }

  applyRemoval()
}

const handleRequestDeleteNodeFromDiagram = (instanceId: string) => {
  if (isDiagramReadOnly.value) return
  selectedModelLinkId.value = null
  selectedEdgeInstanceId.value = null
  openNodeDeleteDialog([], 'canvas', [instanceId])
}


const handleRequestDeleteLink = (linkId: string, edgeInstanceId?: string) => {
  if (isDiagramReadOnly.value) return
  selectedModelNodeIds.value = []
  selectedInstanceIds.value = []
  selectedModelLinkId.value = linkId
  selectedEdgeInstanceId.value = edgeInstanceId ?? null
  openLinkDeleteDialog(linkId, edgeInstanceId)
}

const confirmNodeDelete = () => {
  const nodeIds = pendingDeleteNodeIds.value
  const instanceIds = pendingDeleteInstanceIds.value
  const source = pendingDeleteNodeSource.value
  if (nodeIds.length === 0 && instanceIds.length === 0) {
    cancelNodeDelete()
    return
  }

  if (source === 'canvas') {
    if (instanceIds.length > 0) {
      removeNodesFromCurrentDiagramByInstances(instanceIds)
    } else {
      removeNodesFromCurrentDiagram(nodeIds)
    }
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


const handleToolbarAction = async (event: string) => {
  switch (event) {
    case 'save': {
      const openedBeforeSave = activeDiagram.value
        ? {
            name: activeDiagram.value.name,
            version: activeDiagram.value.version,
            nodeId: activeDiagram.value.nodeId ?? null,
            notationId: activeDiagram.value.notationId,
          }
        : null
      const ok = await saveWithValidation()
      if (!ok || !openedBeforeSave) break
      const stillOpened = state.value.diagrams.some(
        diagram => diagram.id === selectedDiagramId.value && !diagram._isDeleted
      )
      if (stillOpened) break
      const restored = state.value.diagrams.find(
        diagram =>
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
    case 'undo':
      diagramCanvasRef.value?.undo()
      break
    case 'redo':
      diagramCanvasRef.value?.redo()
      break
    case 'zoom-in':
      diagramCanvasRef.value?.zoomIn()
      break
    case 'zoom-out':
      diagramCanvasRef.value?.zoomOut()
      break
    case 'fit-screen':
      diagramCanvasRef.value?.fitToView()
      break
    case 'zoom-selection':
      diagramCanvasRef.value?.zoomToSelection()
      break
    case 'auto-layout-nodes':
      diagramCanvasRef.value?.autoLayoutNodes()
      break
    case 'reset-view':
      diagramCanvasRef.value?.resetView()
      break
    case 'toggle-grid': {
      const next = diagramCanvasRef.value?.toggleGrid()
      if (typeof next === 'boolean') {
        gridVisible.value = next
      }
      break
    }
    case 'toggle-minimap': {
      const next = diagramCanvasRef.value?.toggleMiniMap()
      if (typeof next === 'boolean') {
        miniMapVisible.value = next
      }
      break
    }
    case 'toggle-snap': {
      const next = diagramCanvasRef.value?.toggleSnap()
      if (typeof next === 'boolean') {
        snapEnabled.value = next
      }
      break
    }
    case 'toggle-align': {
      const next = diagramCanvasRef.value?.toggleAlign()
      if (typeof next === 'boolean') {
        alignEnabled.value = next
      }
      break
    }
    case 'toggle-rulers': {
      const next = diagramCanvasRef.value?.toggleRulers()
      if (typeof next === 'boolean') {
        rulersEnabled.value = next
      }
      break
    }
    case 'toggle-outline': {
      attachToOutlineEnabled.value = !attachToOutlineEnabled.value
      break
    }
    case 'toggle-auto-link-in-groups': {
      autoLinkInGroups.value = !autoLinkInGroups.value
      break
    }
    case 'toggle-lock-anchors': {
      const next = diagramCanvasRef.value?.toggleLockAnchors()
      if (typeof next === 'boolean') lockAnchorsEnabled.value = next
      break
    }
    case 'toggle-navigation-mode':
      diagramNavigationOnlyMode.value = !diagramNavigationOnlyMode.value
      break
    case 'export-diagram-png':
      await exportActiveDiagramAsPng()
      break
    case 'export-diagram-svg':
      exportActiveDiagramAsSvg()
      break
    case 'share-diagram-image':
      showDiagramImageShareModal.value = true
      break
    case 'close-diagram':
      if (activeDiagram.value && hasUnsavedChanges.value) {
        pendingDiagramAction.value = 'close'
        pendingDiagramSwitchId.value = null
        showDiagramSwitchModal.value = true
        break
      }
      selectedDiagramId.value = null
      selectedModelNodeIds.value = []
      selectedInstanceIds.value = []
      selectedModelLinkId.value = null
      selectedEdgeInstanceId.value = null
      break
    case 'show-diagram-json':
      if (
        model.value?.id &&
        (await checkPermission({
          resourceType: 'MODEL',
          resourceId: model.value.id,
          action: 'EDIT',
        }))
      ) {
        openDiagramJson()
      }
      break
    case 'open-model-doc':
      handleOpenModelDoc()
      break
    case 'open-diagram-doc':
      handleOpenDiagramDoc()
      break
  }
}

const setNodeScopedValue = (key: string, value: unknown) => {
  const notationId = activeNotationId.value
  const componentId = nodeBindingComponentId.value
  const node = selectedNode.value
  const diagram = activeDiagram.value
  if (!notationId || !componentId || !node || !diagram) return
  const changed = setDiagramScopedNodeValue({
    diagram: diagram.parsedAttrs,
    modelNodeId: node.id,
    notationId,
    componentId,
    key,
    value,
    nodeAttrsFallback: node.parsedAttrs,
    instanceId: selectedNodeInstanceId.value,
  })
  if (changed) {
    markDiagramDirty(diagram.id)
  }
}

const setLinkScopedValue = (key: string, value: unknown) => {
  const notationId = activeNotationId.value
  const relationId = linkBindingRelationId.value
  const link = selectedLink.value
  const diagram = activeDiagram.value
  if (!notationId || !relationId || !link || !diagram) return
  const changed = setDiagramScopedLinkValue({
    diagram: diagram.parsedAttrs,
    modelLinkId: link.id,
    notationId,
    relationId,
    key,
    value,
    linkAttrsFallback: link.parsedAttrs,
    edgeInstanceId: selectedLinkEdgeInstanceId.value,
  })
  if (changed) {
    markDiagramDirty(diagram.id)
  }
}

// Document modal composable — initialized after all dependencies
const {
  showDocModal,
  docModalTitle,
  docModalFileId,
  handleOpenModelDoc,
  handleOpenNodeDoc,
  handleOpenDiagramDoc,
  handleOpenDocumentFromBadge,
  handleCreateDocumentForProperty,
  handleDocSaved,
  handleDocModalClose,
} = useDocumentModal({
  model,
  state,
  selectedDiagramId,
  selectedNode,
  activeNotationId,
  nodeBindingComponentId,
  documentsFromApi,
  markModelDirty,
  markNodeDirty,
  markDiagramDirty,
  setNodeScopedValue,
  t,
})

const handleCanvasContextChange = (ctx: { renderer: DiagramRenderer | null; interactionManager: InteractionManager | null }) => {
  diagramRenderer.value = ctx.renderer
  diagramInteractionManager.value = ctx.interactionManager
}

const handleDiagramElementStyleChange = (style: DiagramStyle) => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram) return

  let targetNodeInstance = null as (typeof diagram.parsedAttrs.instances.nodes)[number] | null
  let targetEdgeInstance = null as (typeof diagram.parsedAttrs.instances.edges)[number] | null

  if (selectedElementId?.startsWith('instance-')) {
    const instanceId = selectedElementId.slice('instance-'.length)
    targetNodeInstance =
      diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId) ?? null
  } else if (selectedElementId?.startsWith('edge-')) {
    const edgeId = selectedElementId.slice('edge-'.length)
    targetEdgeInstance =
      diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId) ?? null
  }

  if (!targetNodeInstance && !targetEdgeInstance && selectedModelNodeIds.value.length === 1) {
    const modelNodeId = selectedModelNodeIds.value[0]
    targetNodeInstance =
      diagram.parsedAttrs.instances.nodes.find(item => item.modelNodeId === modelNodeId) ?? null
  }

  if (!targetNodeInstance && !targetEdgeInstance && selectedModelLinkId.value) {
    targetEdgeInstance =
      diagram.parsedAttrs.instances.edges.find(
        item => item.modelLinkId === selectedModelLinkId.value
      ) ?? null
  }

  if (targetNodeInstance) {
    if (!targetNodeInstance.attrs) targetNodeInstance.attrs = {}
    targetNodeInstance.attrs.diagramStyle = JSON.parse(JSON.stringify(style))
    if (typeof style.width === 'number') targetNodeInstance.width = style.width
    if (typeof style.height === 'number') targetNodeInstance.height = style.height
    markDiagramDirty(diagram.id)
    return
  }

  if (targetEdgeInstance) {
    if (!targetEdgeInstance.attrs) targetEdgeInstance.attrs = {}
    const baseStyle =
      targetEdgeInstance.attrs.diagramStyle &&
      typeof targetEdgeInstance.attrs.diagramStyle === 'object'
        ? (targetEdgeInstance.attrs.diagramStyle as Record<string, unknown>)
        : {}
    const currentType = (baseStyle.edgeType as string | undefined) ?? 'bezier'
    const newType = (style as Record<string, unknown>).edgeType as string | undefined
    const fromPolyline = currentType === 'polyline' || currentType === 'editable-polyline'
    const toNonPolyline = newType === 'bezier' || newType === 'straight'
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

  if (selectedElementId.startsWith('instance-')) {
    const instanceId = selectedElementId.slice('instance-'.length)
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (instance?.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === 'object') {
      return instance.attrs.diagramStyle as DiagramStyle
    }
    const notationId = activeNotationId.value
    if (!notationId) return undefined
    const modelNode = state.value.nodes.find(item => item.id === instance?.modelNodeId)
    const componentId = modelNode?.parsedAttrs.notationComponents[notationId]?.componentId
    if (!componentId) return undefined
    const component = state.value.components.find(item => item.id === componentId)
    if (!component) return undefined
    return parseEntityAttrs(component.attrs ?? null).diagramStyle
  }

  if (selectedElementId.startsWith('edge-')) {
    const edgeId = selectedElementId.slice('edge-'.length)
    const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
    if (edge?.attrs?.diagramStyle && typeof edge.attrs.diagramStyle === 'object') {
      return edge.attrs.diagramStyle as DiagramStyle
    }
  }

  return undefined
})

const hasDiagramStyleOverride = computed(() => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !selectedElementId) return false

  if (selectedElementId.startsWith('instance-')) {
    const instanceId = selectedElementId.slice('instance-'.length)
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (instance && isNoteInstance(instance)) return false
    return Boolean(instance?.attrs?.diagramStyle)
  }

  if (selectedElementId.startsWith('edge-')) {
    const edgeId = selectedElementId.slice('edge-'.length)
    const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
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

  if (selectedElementId.startsWith('instance-')) {
    const instanceId = selectedElementId.slice('instance-'.length)
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (!instance) return
    if (isNoteInstance(instance)) return

    const modelNode = state.value.nodes.find(
      item => item.id === instance.modelNodeId && !item._isDeleted
    )
    const componentId = modelNode?.parsedAttrs.notationComponents[notationId]?.componentId
    const component = componentId
      ? state.value.components.find(
          item => item.id === componentId && item.notationId === notationId
        )
      : null

    if (!component) {
      setUiError('Для выбранной фигуры не найден компонент нотации.')
      return
    }

    if (instance.attrs && typeof instance.attrs === 'object') {
      delete instance.attrs.diagramStyle
      if (Object.keys(instance.attrs).length === 0) delete instance.attrs
    }
    markDiagramDirty(diagram.id)
    return
  }

  if (selectedElementId.startsWith('edge-')) {
    const edgeId = selectedElementId.slice('edge-'.length)
    const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
    if (!edge) return
    if (edge.attrs?.isDiagramOnly === true) return

    const modelLink = state.value.links.find(
      item => item.id === edge.modelLinkId && !item._isDeleted
    )
    const relationId = modelLink?.parsedAttrs.notationRelations[notationId]?.relationId
    const relation = relationId
      ? state.value.relations.find(item => item.id === relationId && item.notationId === notationId)
      : null

    if (!relation) {
      setUiError('Для выбранной связи не найден relation нотации.')
      return
    }

    if (edge.attrs && typeof edge.attrs === 'object') {
      delete edge.attrs.diagramStyle
      if (Object.keys(edge.attrs).length === 0) delete edge.attrs
    }
    markDiagramDirty(diagram.id)
  }
}

const showDiagramJson = ref(false)
const diagramJsonContent = ref('')

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

onBeforeRouteLeave((to) => {
  if (allowLeave.value) {
    allowLeave.value = false
    return true
  }
  if (hasUnsavedChanges.value) {
    showLeaveDialog.value = true
    pendingRoute = to
    return false
  }
  return true
})

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    event.preventDefault()
  }
}

onMounted(async () => {
  await loadModel()
  syncDefaultsOnLoad()
  void fetchWikiDocuments()
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onDeleteKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onDeleteKeydown)
})
</script>

<template>
  <MainLayout>
    <template #header>
      <ModelEditorHeader
        hide-toolbar
        :has-unsaved-changes="hasUnsavedChanges"
        :can-save="!isSaving && !isDiagramReadOnly"
        :model-name="model?.name"
        :model-version="model?.version"
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
        :diagram-versions="diagramVersionsForCurrentName"
        :selected-diagram-id="selectedDiagramId"
        :is-diagram-read-only="isDiagramReadOnly"
        :baseline-creating="baselineCreating"
        :baseline-error="baselineError"
        :is-admin="canInspectDiagramJson"
        :show-compare-button="!!model?.id"
        :model-id="model?.id ?? null"
        @action="handleToolbarAction"
        @rename-model="handleRenameModel"
        @share="showShareModal = true"
        @compare="handleOpenCompareModal"
        @open-notation="handleOpenNotationEditor"
        @select-diagram-version="selectedDiagramId = $event"
        @create-baseline="handleCreateBaseline"
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
            :navigation-only-mode="diagramNavigationOnlyMode"
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
            @rename-diagram="handleRenameDiagram"
          />
        </template>

        <div
          class="model-canvas-area"
          :class="{ 'model-canvas-area--has-newer-banner': newerNotationVersions.length > 0 && activeDiagram }"
        >
          <template v-if="activeDiagram && !isDiagramReadOnly">
            <button
              v-if="!canvasSettingsVisible"
              type="button"
              class="canvas-settings-toggle"
              :title="t('models.showDiagramSettings')"
              @click="canvasSettingsVisible = true"
            >
              <UiIcon name="settings" />
            </button>
            <div v-else class="canvas-settings">
              <div class="canvas-settings__header">
                <UiIcon name="tune" />
                <span>{{ t('common.settings') }}</span>
                <button
                  type="button"
                  class="canvas-settings__hide"
                  :title="t('models.hideDiagramSettings')"
                  @click="canvasSettingsVisible = false"
                >
                  <UiIcon name="chevron_left" />
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
                  <UiIcon :name="button.icon" />
                  <span>{{ button.title }}</span>
                </button>
                <div class="canvas-settings__row">
                  <label class="canvas-settings__label">{{ t('models.defaultLinkType') }}</label>
                  <div class="canvas-settings__link-type-group">
                    <button
                      v-for="opt in defaultLinkTypeOptions"
                      :key="opt.value"
                      type="button"
                      class="canvas-settings__item canvas-settings__item--link-type"
                      :class="{ 'canvas-settings__item--active': defaultEdgeType === opt.value }"
                      :title="opt.label"
                      :disabled="!activeDiagram"
                      @click="defaultEdgeType = opt.value"
                    >
                      <UiIcon :name="opt.icon" />
                      <span>{{ opt.label }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div
            v-if="newerNotationVersions.length > 0 && activeDiagram"
            class="model-canvas-area__newer-notation-banner"
          >
            <span class="material-symbols-outlined model-canvas-area__newer-notation-icon">info</span>
            {{
              t('diagram.newerNotationVersionsBanner', {
                name: newerNotationVersions[0]?.name ?? '',
                version: newerNotationVersions[0]?.version ?? '',
              })
            }}
          </div>
          <div class="model-canvas-area__toolbar">
            <ModelEditorHeader
              canvas-mode
              :has-unsaved-changes="hasUnsavedChanges"
              :can-save="!isSaving && !isDiagramReadOnly"
              :model-name="model?.name"
              :model-version="model?.version"
              :has-active-diagram="!!activeDiagram"
              :can-undo="canUndo"
              :can-redo="canRedo"
              :can-share="canShareModel"
              :navigation-only-mode="diagramNavigationOnlyMode"
              :is-diagram-read-only="isDiagramReadOnly"
              :is-admin="canInspectDiagramJson"
              :can-open-notation="canOpenActiveDiagramNotation"
              @action="handleToolbarAction"
              @rename-model="handleRenameModel"
              @share="showShareModal = true"
              @open-notation="handleOpenNotationEditor"
            />
          </div>
          <ModelDiagramCanvas
            :key="`${activeDiagram?.id ?? 'none'}-${isDiagramReadOnly}`"
            ref="diagramCanvasRef"
            :active-diagram="activeDiagram"
            :read-only="isDiagramReadOnly"
            :navigation-only-mode="diagramNavigationOnlyMode"
            :nodes="state.nodes"
            :links="state.links"
            :relations="state.relations"
            :components="state.components"
            :node-types="state.nodeTypes"
            :relation-rules="state.relationRules"
            :grid-visible="gridVisible"
            :mini-map-visible="miniMapVisible"
            :snap-enabled="snapEnabled"
            :align-enabled="alignEnabled"
            :rulers-enabled="rulersEnabled"
            :palette-visible="!isDiagramReadOnly && paletteVisible"
            :auto-link-in-groups="autoLinkInGroups"
            :lock-anchors-enabled="lockAnchorsEnabled"
            :attach-to-outline-enabled="attachToOutlineEnabled"
            :selected-model-node-ids="selectedModelNodeIds"
            :selected-model-link-id="selectedModelLinkId"
            :selected-edge-instance-id="selectedEdgeInstanceId"
            :selected-instance-ids="selectedInstanceIds"
            :connection-validator="canConnect"
            @update-diagram="setDiagramAttrs"
            @select-nodes="handleCanvasSelectNodes"
            @select-instance-ids="(ids) => (selectedInstanceIds = ids)"
            @select-edge-instance-id="(id) => (selectedEdgeInstanceId = id)"
            @select-link="
              ($event: string | null) => {
                selectedModelLinkId = $event
                selectedModelNodeIds = []
                selectedInstanceIds = []
                selectedEdgeInstanceId = null
                selectedNodeId = null
              }
            "
            @create-node-from-component="createNodeFromPaletteComponent"
            @create-note="createDiagramNote"
            @add-existing-node="addExistingNodeToDiagram"
            @connect-nodes="startConnectNodes"
            @request-auto-link="handleRequestAutoLink"
            @reconnect-edge="handleReconnectEdge"
            @find-in-tree="handleFindInTree"
            @node-label-change="handleNodeLabelChange"
            @request-delete-node-from-diagram="handleRequestDeleteNodeFromDiagram"
            @request-edit-note="openNoteEditor"
            @request-delete-link="handleRequestDeleteLink"
            @select-canvas-element-id="selectedCanvasElementId = $event"
            @canvas-context-change="handleCanvasContextChange"
            @palette-visible-change="paletteVisible = $event"
            @open-diagram="selectDiagram"
            @open-document="handleOpenDocumentFromBadge"
          />
          <div
            v-if="activeDiagram && isActiveNotationRulesLoading"
            class="relation-rules-loading-badge"
            role="status"
            aria-live="polite"
          >
            <UiIcon name="sync" class="relation-rules-loading-badge__icon spin" />
            <span>{{ t('models.relationRulesLoading') }}</span>
          </div>
        </div>

        <template #right>
          <TabPanel v-model="activeRightTab" :tabs="rightPanelTabs">
            <ModelPropertiesPanel
              v-if="activeRightTab === 'properties'"
              :active-notation-id="activeNotationId"
              :selected-node="selectedNode"
              :selected-link="selectedLink"
              :node-binding-component-id="nodeBindingComponentId"
              :link-binding-relation-id="linkBindingRelationId"
              :available-components="availableNodeComponents"
              :available-relations="availableLinkRelations"
              :node-scoped-values="nodeScopedValues"
              :link-scoped-values="linkScopedValues"
              :diagrams="diagramsForProps"
              :model-documents="modelDocuments"
              :wiki-documents="wikiDocumentsList"
              :read-only="isDiagramReadOnly"
              @bind-node-component="(id) => selectedNode && !isDiagramReadOnly && bindNodeComponent(selectedNode, id)"
              @bind-link-relation="(id) => selectedLink && !isDiagramReadOnly && bindLinkRelation(selectedLink, id)"
              @set-node-scoped-value="(k, v) => !isDiagramReadOnly && setNodeScopedValue(k, v)"
              @set-link-scoped-value="(k, v) => !isDiagramReadOnly && setLinkScopedValue(k, v)"
              @create-document-for-property="(name) => !isDiagramReadOnly && handleCreateDocumentForProperty(name)"
              :on-open-node-document="handleOpenNodeDoc"
            />
            <NodeStylePanel
              v-if="activeRightTab === 'style' && !isDiagramReadOnly"
              :selected-element-id="selectedCanvasElementId"
              :interaction-manager="diagramInteractionManager"
              :renderer="diagramRenderer"
              :current-diagram-style="selectedElementDiagramStyle"
              :can-restore-style="hasDiagramStyleOverride"
              @style-change="handleDiagramElementStyleChange"
              @restore-style="restoreStyleFromNotation"
            />
          </TabPanel>
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
        <UiIcon name="sync" class="save-toast__icon spin" />
        <span>{{ saveProgress || t('common.saving') }}</span>
      </div>
      <div v-else-if="saveSuccess" class="save-toast save-toast--success">
        <UiIcon name="check_circle" class="save-toast__icon" />
        <span>{{ t('common.saved') }}</span>
      </div>
      <div v-else-if="saveError || uiError" class="save-toast save-toast--error">
        <UiIcon name="error" class="save-toast__icon" />
        <span>{{ saveError || uiError }}</span>
      </div>
    </Transition>
  </Teleport>

  <BaseModal
    v-if="showCreateNodeModal"
    :title="createNodeModalTitle"
    max-width="440px"
    @close="showCreateNodeModal = false"
  >
    <div class="form-grid">
      <label>
        <span>{{ t('common.name') }}</span>
        <input
          v-model="newNodeName"
          class="field-input"
          :placeholder="
            createNodeModal.kind === 'folder'
              ? t('models.newFolderPlaceholder')
              : t('models.newNodePlaceholder')
          "
          @keydown.enter.prevent="canCreateNodeFromModal && createNode()"
        />
      </label>
      <div v-if="createNodeModal.kind === 'node'" class="node-type-dropdown">
        <span class="node-type-dropdown__label">{{ t('models.nodeTypeLabel') }}</span>
        <div
          class="node-type-dropdown__control"
          @click="nodeTypeDropdownOpen = !nodeTypeDropdownOpen"
        >
          <span class="node-type-dropdown__value">{{
            selectedNodeTypeName || t('models.selectType')
          }}</span>
          <UiIcon :name="nodeTypeDropdownOpen ? 'expand_less' : 'expand_more'" class="node-type-dropdown__arrow" />
        </div>
        <div v-if="nodeTypeDropdownOpen" class="node-type-dropdown__panel">
          <input
            v-model="nodeTypeSearchQuery"
            class="node-type-dropdown__search"
            type="text"
            :placeholder="t('models.typeSearchPlaceholder')"
            @click.stop
          />
          <div class="node-type-dropdown__list">
            <button
              v-for="typeItem in filteredNodeTypes"
              :key="typeItem.id"
              type="button"
              class="node-type-dropdown__item"
              :class="{ 'node-type-dropdown__item--active': newNodeTypeId === typeItem.id }"
              @click="
                () => {
                  newNodeTypeId = typeItem.id
                  nodeTypeDropdownOpen = false
                }
              "
            >
              {{ typeItem.name }}
            </button>
            <div v-if="filteredNodeTypes.length === 0" class="node-type-dropdown__empty">
              {{ t('common.nothingFound') }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="form-hint">{{ t('models.directoryTypeHint') }}</div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="showCreateNodeModal = false">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!canCreateNodeFromModal"
        @click="createNode"
      >
        {{ t('common.create') }}
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
        <span>{{ t('models.noteTextLabel') }}</span>
        <textarea
          v-model="noteEditorText"
          class="field-textarea"
          rows="8"
          :placeholder="t('models.noteTextPlaceholder')"
        />
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelNoteEditor">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--primary" @click="saveNoteEditor">
        {{ t('common.save') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showCreateDiagramModal"
    :title="t('models.createDiagramTitle')"
    max-width="460px"
    @close="showCreateDiagramModal = false"
  >
    <div class="form-grid">
      <label>
        <span>{{ t('common.name') }}</span>
        <input
          v-model="newDiagramName"
          class="field-input"
          :placeholder="t('models.newDiagramPlaceholder')"
        />
      </label>
      <label>
        <span>{{ t('common.version') }}</span>
        <input v-model="newDiagramVersion" class="field-input" placeholder="1.0.0" />
      </label>
      <label>
        <span>{{ t('models.notationLabel') }}</span>
        <select v-model="newDiagramNotationId" class="field-input">
          <option v-for="notation in state.notations" :key="notation.id" :value="notation.id">
            {{ notation.name }} ({{ notation.version }})
          </option>
        </select>
      </label>
      <div v-if="hasDiagramNameVersionConflict" class="form-error-text">
        {{ t('models.diagramConflictMessage') }}
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="showCreateDiagramModal = false">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="hasDiagramNameVersionConflict"
        @click="createDiagram"
      >
        {{ t('common.create') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showComponentChoiceModal"
    :title="t('diagram.selectComponent')"
    max-width="420px"
    @close="showComponentChoiceModal = false"
  >
    <div class="choice-list">
      <button
        v-for="option in componentChoiceOptions"
        :key="option.id"
        type="button"
        class="choice-item"
        @click="
          () => {
            if (componentChoiceNodeId) {
              const node = state.nodes.find(n => n.id === componentChoiceNodeId)
              if (node) bindNodeComponent(node, option.id)
            }
            showComponentChoiceModal = false
          }
        "
      >
        {{ option.name }}
      </button>
    </div>
  </BaseModal>

  <BaseModal
    v-if="showRelationChoiceModal"
    :title="t('diagram.selectRelation')"
    max-width="420px"
    @close="showRelationChoiceModal = false"
  >
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

  <BaseModal
    v-if="showReuseLinkModal"
    :title="t('models.existingLinksFoundTitle')"
    max-width="500px"
    @close="showReuseLinkModal = false"
  >
    <div class="choice-list">
      <button
        v-for="link in reuseLinkOptions"
        :key="link.id"
        type="button"
        class="choice-item"
        @click="handleSelectExistingLink(link.id)"
      >
        {{ t('models.useExistingLink', { link: formatReuseLinkOption(link) }) }}
      </button>
      <button
        type="button"
        class="choice-item choice-item--primary"
        @click="handleCreateNewLinkFromReuseModal"
      >
        {{ t('models.createNewLink') }}
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
        pendingDiagramAction === 'close'
          ? t('models.saveBeforeCloseDiagram')
          : t('models.saveBeforeSwitchDiagram')
      }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelDiagramSwitch">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--secondary"
        :disabled="isLoading || isSaving"
        @click="switchDiagramWithoutSave"
      >
        {{ t('models.dontSave') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="isSaving"
        @click="saveAndSwitchDiagram"
      >
        {{
          pendingDiagramAction === 'close' ? t('models.saveAndClose') : t('models.saveAndSwitch')
        }}
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
          {{
            t('models.deleteNodeFromDiagramSingle', {
              name: pendingDeleteNodeSingleName || t('common.unnamed'),
            })
          }}
        </template>
        <template v-else>
          {{ t('models.deleteNodeFromDiagramMultiple', { count: pendingDeleteNodeCount }) }}
        </template>
      </template>
      <template v-else>
        <template v-if="pendingDeleteNodeCount === 1">
          {{
            t('models.deleteNodeFromModelSingle', {
              name: pendingDeleteNodeSingleName || t('common.unnamed'),
            })
          }}
        </template>
        <template v-else>
          {{ t('models.deleteNodeFromModelMultiple', { count: pendingDeleteNodeCount }) }}
        </template>
      </template>
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelNodeDelete">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--danger" @click="confirmNodeDelete">
        {{ t('common.delete') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showDiagramDeleteModal"
    :title="t('models.deleteDiagramTitle')"
    max-width="500px"
    @close="cancelDiagramDelete"
  >
    <p class="leave-text">
      {{
        t('models.deleteDiagramConfirm', { name: pendingDeleteDiagramName || t('common.unnamed') })
      }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelDiagramDelete">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--danger" @click="confirmDiagramDelete">
        {{ t('common.delete') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showLinkDeleteModal"
    :title="t('models.deleteLinkTitle')"
    max-width="500px"
    @close="cancelLinkDelete"
  >
    <p class="leave-text">
      {{ t('models.deleteLinkQuestion') }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLinkDelete">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="removeLinkFromCurrentDiagram">
        {{ t('models.removeLinkFromDiagram') }}
      </button>
      <button
        v-if="pendingDeleteLinkId && !isDiagramOnlyEdgeModelLinkId(pendingDeleteLinkId)"
        type="button"
        class="btn btn--danger"
        @click="removeLinkFromModel"
      >
        {{ t('models.removeLinkFromModel') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showLeaveDialog"
    :title="t('models.unsavedChangesTitle')"
    max-width="400px"
    @close="cancelLeave"
  >
    <p class="leave-text">
      {{ t('models.leaveUnsavedText') }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLeave">
        {{ t('models.stay') }}
      </button>
      <button type="button" class="btn btn--danger" @click="confirmLeave">
        {{ t('models.leave') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showDiagramJson"
    :title="t('models.diagramJsonTitle')"
    max-width="600px"
    @close="showDiagramJson = false"
  >
    <pre class="json-viewer">{{ diagramJsonContent }}</pre>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="copyDiagramJson">
        {{ t('models.copy') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="showDiagramJson = false">
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>

  <ShareAccessModal
    v-if="showShareModal && model"
    :title="t('models.accessTitle')"
    resource-type="MODEL"
    :resource-id="model.id"
    @close="showShareModal = false"
  />

  <DiagramImageShareModal
    v-if="showDiagramImageShareModal"
    :visible="true"
    :diagram-id="activeDiagram?.id ?? null"
    :diagram-name="activeDiagram?.name ?? ''"
    :model-id="model?.id ?? null"
    :on-before-get-link="uploadDiagramPreview"
    @close="showDiagramImageShareModal = false"
  />

  <DocumentEditorModal
    v-if="showDocModal"
    :title="docModalTitle"
    :file-id="docModalFileId"
    @saved="handleDocSaved"
    @close="handleDocModalClose"
  />

  <ModelVersionDiffModal
    v-if="showCompareModal && model"
    :model-id="model.id"
    :model-version="model.version"
    :related-versions="compareModalState.relatedVersions"
    :related-versions-loading="compareModalState.relatedVersionsLoading"
    :compare-target-id="compareModalState.compareTargetId"
    :compare-target-loading="compareModalState.compareTargetLoading"
    :compare-target-error="compareModalState.compareTargetError"
    :diff="compareModalState.diff"
    @close="handleCompareModalClose"
    @select-version="versionDiff.loadCompareTarget"
  />

  <div v-if="isLoading" class="overlay-loading">
    <UiIcon name="sync" class="overlay-loading__icon spin" />
    <span>{{ t('common.loading') }}</span>
  </div>
  <div v-else-if="errorMessage" class="overlay-loading overlay-loading--error">
    <UiIcon name="error" class="overlay-loading__icon" />
    <span>{{ errorMessage }}</span>
  </div>
</template>

<style scoped>
.overlay-loading {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--base-bg) 84%, transparent);
  color: var(--text-muted);
  z-index: 2000;
  font-size: 14px;
  font-weight: 500;
}

.overlay-loading--error {
  color: var(--danger);
}

.overlay-loading__icon {
  width: 24px;
  height: 24px;
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

.model-canvas-area {
  position: relative;
  height: 100%;
  min-height: 0;
}

.relation-rules-loading-badge {
  position: absolute;
  right: 12px;
  top: 56px;
  z-index: 14;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 90%, var(--primary-soft));
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(3px);
}

.relation-rules-loading-badge__icon {
  width: 16px;
  height: 16px;
  color: var(--primary);
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

.canvas-settings__header .ui-icon {
  width: 14px;
  height: 14px;
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

.canvas-settings__hide .ui-icon {
  width: 16px;
  height: 16px;
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

.canvas-settings__item .ui-icon {
  width: 14px;
  height: 14px;
}

.canvas-settings__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.canvas-settings__label {
  font-size: 12px;
  color: var(--text-muted);
}

.canvas-settings__link-type-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.canvas-settings__item--link-type {
  width: 100%;
}

.model-canvas-area__newer-notation-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--primary);
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
}

.model-canvas-area__newer-notation-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.model-canvas-area--has-newer-banner .model-canvas-area__toolbar {
  top: 42px;
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
  width: 20px;
  height: 20px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
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
  width: 18px;
  height: 18px;
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

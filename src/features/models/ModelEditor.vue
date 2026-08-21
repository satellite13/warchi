<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet, uploadDiagramSvg } from '@/composables/useApi'
import MainLayout from '@/layouts/MainLayout.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import BaseModal from '@/components/modals/BaseModal.vue'
import ConfirmModal from '@/components/modals/ConfirmModal.vue'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import ShareAccessModal from '@/components/modals/ShareAccessModal.vue'
import DiagramImageShareModal from './components/DiagramImageShareModal.vue'
import { SvgExporter, DiagramRenderer, InteractionManager } from '@ngroznykh/papirus'
import {
  resolveComponentByNodeType,
  resolveInstanceComponentId,
  resolveRelationByLinkType,
  type DiagramAttrs,
} from './modelAttrs'
import type { EditorLink } from './types'
import {
  useModelBatchConflictUi,
  useDiagramScope,
  mergeDetachedModelLinks,
  isDiagramOnlyEdgeModelLinkId,
  useModelDiagramConnections,
  useModelDiagramInstances,
  useModelDiagramExport,
  useModelEditor,
  useDetachedModelLinks,
  useModelEditorSync,
  useLazyTreeSearch,
  useModelSelection,
  useModelToolbarState,
  useModelTreeOperations,
  useModelVersionDiff,
  useDiagramNotationMigration,
  useNotationVersionBanner,
  useNoteEditor,
  useOefImport,
  ensureNotationImportCatalog,
} from './composables'
import { syncLinkEndpointsFromDiagram } from './utils/syncLinkEndpointsFromDiagram'
import { mergeEffectiveDiagramStyle } from './utils/diagramCanvasBuilders'
import {
  isContainerInstance,
  isDiagramContainerModelNodeId,
  isDiagramNoteModelNodeId as isDiagramNoteModelNodeIdHelper,
  isEdgeAnchorInstance,
  isEdgeAnchorModelNodeId,
} from './utils/diagramOnlyInstances'
import { canvasModelNodeIds, orphanedUntypedNodeIds } from './utils/orphanedDiagramOnlyNodes'
import { removeOrphanEdgeAnchors } from './utils/edgeAnchorSync'
import {
  getDiagramScopedLinkValues,
  getDiagramScopedNodeValues,
  setDiagramScopedLinkValue,
  setDiagramScopedNodeValue,
} from './utils/diagramScopedProperties'
import { useAuth } from '@/composables/useAuth'
import { usePermissions } from '@/composables/usePermissions'
import { useCanShare } from '@/composables/useCanShare'
import ModelEditorHeader from './components/ModelEditorHeader.vue'
import ModelMainPanelLayout from './layout/ModelMainPanelLayout.vue'
import ModelTreePalettePanel from './components/ModelTreePalettePanel.vue'
import ModelDiagramCanvas from './components/ModelDiagramCanvas.vue'
import ModelDiagramScopeStatus from './components/ModelDiagramScopeStatus.vue'
import LayoutPreviewModal from './components/LayoutPreviewModal.vue'
import LinkReuseModal from './components/LinkReuseModal.vue'
import ModelPropertiesPanel from './components/ModelPropertiesPanel.vue'
import ModelTraceabilityPanel from './components/ModelTraceabilityPanel.vue'
import ModelImportWizard from './components/ModelImportWizard.vue'
import ModelEditorLoadProgress from './components/ModelEditorLoadProgress.vue'
import RemoteCascadeConflictNotice from './components/RemoteCascadeConflictNotice.vue'
import GranularSyncErrorNotice from './components/GranularSyncErrorNotice.vue'
import DiagramCopyWizard from './components/DiagramCopyWizard.vue'
import {
  parseEntityAttrs,
  type CustomProperty,
  type DiagramStyle,
} from '@/domain/attrs/notationAttrs'
import { hasSystemBooleanDefault } from '@/domain/attrs/systemBooleanProperty'
import { listBoundaryLinksToGuest } from './utils/boundaryAttach'
import {
  applyDiagramStyleToNodeInstance,
  withInstanceDimensions,
} from './utils/applyDiagramStyleToNodeInstance'
import NodeStylePanel from '@/features/diagram-style/components/NodeStylePanel.vue'
import CompositeStylePanel from '@/features/diagram-style/components/composite/CompositeStylePanel.vue'
import TabPanel from '@/components/layout/TabPanel.vue'
import DocumentEditorModal from '@/components/modals/DocumentEditorModal.vue'
import ModelVersionDiffModal from './components/ModelVersionDiffModal.vue'
import BatchSaveConflictModal from './components/BatchSaveConflictModal.vue'
import SaveToast from '@/components/ui/SaveToast.vue'
import { compareVersions } from '@/utils/version'
import { clonePlainDeep } from '@/utils/clonePlainDeep'
import { createDiagramHistoryBatcher } from './composables/useDiagramHistoryBatcher'
import { appendDiagramCaption } from '@/utils/diagramSvgCaption'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { downloadModelPackage } from './composables/useModelPackage'
import ValidationScriptsRunModal from '@/features/validation-scripts/components/ValidationScriptsRunModal.vue'
import { buildValidationSnapshot } from '@/features/validation-scripts/sandbox/buildValidationSnapshot'
import type { ValidationIssue } from '@/features/validation-scripts/sandbox/types'
import type { RelationResponse } from '@/types/api'
import { useWikiDocuments } from '@/composables/useWikiDocuments'
import { useDocumentModal } from './composables'
import {
  ensureAllDiagramAttrsLoaded,
  ensureDiagramAttrsLoaded,
} from './composables/ensureDiagramAttrs'
import {
  focusRouteDiagramTree,
  useModelEditorRouteNavigation,
} from './composables/useModelEditorRouteNavigation'
import { validateRequiredCustomProperties as validateRequiredCustomPropertiesState } from './utils/requiredCustomPropertiesValidation'
import { syncDefaultsOnLoadChunked } from './utils/syncDefaultsOnLoad'
import { applyDefaultCustomPropertyValuesFromAttrs } from '@/domain/attrs/customPropertyValues'

const {
  model,
  state,
  isLoading,
  loadProgress,
  initialSnapshotReady,
  errorMessage,
  catalogLoadWarning,
  retryCatalogLoad,
  modelDirty,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadModel,
  discardUnsavedChanges,
  saveChanges,
  startSave,
  finishSave,
  markNodeDirty,
  markLinkDirty,
  markDiagramDirty,
  markModelDirty,
  renameModel,
  createDiagramBaseline,
  ensureNotationRelationsAndRules,
  isNotationRelationsAndRulesLoading,
  whenCatalogReady,
  whenBackgroundReady,
  batchSaveConflict,
  resolveBatchSaveReload,
  resolveBatchSaveOverwrite,
  dismissBatchSaveConflict,
  partialStore,
} = useModelEditor()

const loadedChildrenFor = computed(() => partialStore.store.loadedChildrenFor)
const childrenPages = computed(() => partialStore.store.childrenPages)
const detachedModelLinks = useDetachedModelLinks(computed(() => state.value.modelId || null))
const detachedConsumerLinks = computed(() =>
  detachedModelLinks.loadedModelId.value === state.value.modelId &&
  !detachedModelLinks.stale.value
    ? mergeDetachedModelLinks(detachedModelLinks.links.value, state.value.links)
    : []
)
const remoteCascadeConflictCount = computed(
  () =>
    state.value.links.filter(link =>
      partialStore.store.remoteCascadeConflictLinkIds.has(link.id)
    ).length
)
const granularSyncFailures = ref(
  new Map<string, { entity: string; message: string; retry: () => void }>()
)
const firstGranularSyncFailure = computed(
  () => granularSyncFailures.value.values().next().value ?? null
)

function discardRemoteCascadeConflictLinks(): void {
  partialStore.discardRemoteCascadeConflictLinks()
  saveError.value = null
}

async function reloadAfterRemoteCascadeConflict(): Promise<void> {
  saveError.value = null
  await loadModel()
}

const modelLiveSyncEnabled = computed(
  () => !!model.value && !isLoading.value && !errorMessage.value
)

const { currentUser } = useAuth()
const { checkPermission } = usePermissions()
const { t, locale } = useI18n()

const { list: wikiDocumentsList, fetchList: fetchWikiDocuments } = useWikiDocuments()
/** Правка содержимого модели (диаграмма, узлы, документы), не только просмотр по шаре VIEW */
const canInspectDiagramJson = computed(() => {
  const permission = model.value?.accessPermission ?? null
  return permission === 'ADMIN' || permission === 'OWNER' || permission === 'EDIT'
})

/** Документация на уровне модели (attrs.documentFileId), для кнопки wiki в шапке при доступе VIEW */
const modelRootDocumentFileId = computed((): string | null => {
  const raw = model.value?.attrs
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as { documentFileId?: unknown }
    return typeof p.documentFileId === 'string' && p.documentFileId.trim().length > 0
      ? p.documentFileId.trim()
      : null
  } catch {
    return null
  }
})

const showModelWikiHeaderButton = computed(
  () => canInspectDiagramJson.value || !!modelRootDocumentFileId.value
)

const {
  selectedNodeId,
  selectedDiagramId,
  selectedModelNodeIds,
  selectedInstanceIds,
  selectedModelLinkId,
  selectedEdgeInstanceId,
  selectedCanvasElementId,
  selectedNode,
  selectedLink,
  selectedNodeInstanceId,
  selectedLinkEdgeInstanceId,
  selectedNodeLoading,
  selectedNodeError,
  retrySelectedNode,
  applyDiagramSelection,
} = useModelSelection({
  state,
  mergeNodes: (nodes, guard) => partialStore.mergePartialEntities(nodes, [], guard),
  beginRequest: () => partialStore.store.beginRequest('selection-node'),
  isRequestCurrent: guard => partialStore.store.isRequestCurrent(guard),
})
const diagramScope = useDiagramScope({
  state,
  selectedDiagramId,
  partialStore,
  autoOpen: true,
  beforeOpen: whenCatalogReady,
})
const diagramScopeError = diagramScope.error
const diagramScopeReady = diagramScope.diagramScopeReady
const showShareModal = ref(false)
const showValidationScriptsModal = ref(false)

const validationRunPayload = computed(() => {
  if (!model.value) return null
  return buildValidationSnapshot({
    state: state.value,
    modelName: model.value.name,
    modelVersion: model.value.version,
    openDiagramId: selectedDiagramId.value,
  })
})

function handleValidationIssueSelect(issue: ValidationIssue): void {
  showValidationScriptsModal.value = false
  const target = issue.target
  if (!target) return
  if (target.kind === 'diagram') {
    selectDiagram(target.id)
    return
  }
  if (target.kind === 'node' || target.kind === 'folder') {
    selectedNodeId.value = target.id
    treePanelRef.value?.focusNode?.(target.id)
    selectedModelNodeIds.value = [target.id]
    return
  }
  if (target.kind === 'link') {
    selectedModelLinkId.value = target.id
  }
}
const showCompareModal = ref(false)

const versionDiff = useModelVersionDiff()

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

function handleOpenRelationMatrix(): void {
  const modelId = state.value.modelId
  if (!modelId) return
  router.push({ name: 'model-relation-matrix', params: { id: modelId } })
}

function handleCompareModalClose() {
  showCompareModal.value = false
  versionDiff.clearCompare()
}

const {
  batchSaveConflictRows,
  batchConflictCrossLinkWarningRows,
  handleBatchConflictReload,
  handleBatchConflictOverwrite,
} = useModelBatchConflictUi({
  state,
  batchSaveConflict,
  selectedDiagramId,
  locale,
  t: (key, params) => String(t(key, params ?? {})),
  resolveBatchSaveReload,
  resolveBatchSaveOverwrite,
})

const compareModalState = computed(() => ({
  relatedVersions: versionDiff.relatedVersions.value,
  relatedVersionsLoading: versionDiff.relatedVersionsLoading.value,
  compareTargetId: versionDiff.compareTargetId.value,
  compareTargetLoading: versionDiff.compareTargetLoading.value,
  compareTargetError: versionDiff.compareTargetError.value,
  diff: versionDiff.diff.value,
}))
const diagramRenderer = shallowRef<DiagramRenderer | null>(null)
const diagramInteractionManager = shallowRef<InteractionManager | null>(null)
const activeRightTab = ref('properties')
const { canShare: canShareModel } = useCanShare(model)
const diagramCanvasRef = ref<InstanceType<typeof ModelDiagramCanvas> | null>(null)
const treePanelRef = ref<InstanceType<typeof ModelTreePalettePanel> | null>(null)
const showDiagramCopyWizard = ref(false)
const sourceDiagramIdForCopy = ref('')
const diagramCopySuccess = ref(false)
let diagramCopySuccessTimer: ReturnType<typeof setTimeout> | null = null
const UNTYPED_TYPE_NAMES = new Set(['diagram only'])

const normalizeTypeName = (value: string | undefined): string => value?.trim().toLowerCase() ?? ''
const isUntypedTypeName = (value: string | undefined): boolean =>
  UNTYPED_TYPE_NAMES.has(normalizeTypeName(value))
const isUntypedNodeTypeId = (nodeTypeId: string): boolean =>
  isUntypedTypeName(state.value.nodeTypes.find(type => type.id === nodeTypeId)?.name)
const isUntypedLinkTypeId = (linkTypeId: string): boolean =>
  isUntypedTypeName(state.value.linkTypes.find(type => type.id === linkTypeId)?.name)

const canUndo = computed(() => diagramCanvasRef.value?.getCanUndo() ?? false)
const canRedo = computed(() => diagramCanvasRef.value?.getCanRedo() ?? false)
const activeDiagram = computed(() =>
  selectedDiagramId.value
    ? (state.value.diagrams.find(
        diagram => diagram.id === selectedDiagramId.value && !diagram._isDeleted
      ) ?? null)
    : null
)

/** Wiki-страница активной диаграммы (parsedAttrs.documentFileId) — пункт тулбара канвы */
const activeDiagramDocumentFileId = computed((): string | null => {
  const d = activeDiagram.value
  const raw = d?.parsedAttrs?.documentFileId
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
})

const showDiagramWikiToolbarButton = computed(
  () => canInspectDiagramJson.value || !!activeDiagramDocumentFileId.value
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
    d => !d._isDeleted && d.modelId === diagram.modelId && d.name.trim() === diagram.name.trim()
  )
  return [...sameName].sort((a, b) => compareVersions(b.version, a.version))
})

/** Последняя (редактируемая) версия диаграммы по имени */
const latestDiagramVersion = computed(() => diagramVersionsForCurrentName.value[0] ?? null)

/** Открыта старая версия — только просмотр, без редактирования */
const isDiagramReadOnlyBaseline = computed(
  () =>
    !!activeDiagram.value &&
    !!latestDiagramVersion.value &&
    activeDiagram.value.id !== latestDiagramVersion.value.id
)

/** Диаграмма с таким id уже сохранена на сервере (не temp id до первого save) */
const isSelectedDiagramPersistedOnServer = computed(() => {
  const id = selectedDiagramId.value
  if (!id) return false
  const d = state.value.diagrams.find(diagram => diagram.id === id && !diagram._isDeleted)
  return !!d && !d._isNew
})

const {
  diagramEditLock,
  diagramLocksForTree,
  diagramLockBlockedByOther,
  diagramLockHolderName,
  diagramLockServerNewerWhileBlocked,
  isDiagramLockHolder,
  isDiagramReadOnly,
  remoteEditorPointer,
  diagramSpectators,
  onLiveCollaborationGesture,
  scheduleDebouncedLivePush,
  onCanvasMouseMoveForPointer,
  onCanvasMouseLeaveForPointer,
  handleReloadModelForDiagramLock: reloadModelForDiagramLock,
  verifyLockBeforeSave,
  dismissForceRevoked,
} = useModelEditorSync({
  modelId: computed(() => state.value.modelId || null),
  state,
  model,
  enabled: modelLiveSyncEnabled,
  isLoading,
  initialSnapshotReady,
  isSaving,
  modelDirty,
  selectedDiagramId,
  activeDiagramUpdatedAt: computed(() => activeDiagram.value?.updatedAt ?? null),
  isActiveDiagramLatest: computed(
    () =>
      !!activeDiagram.value &&
      !!latestDiagramVersion.value &&
      activeDiagram.value.id === latestDiagramVersion.value.id
  ),
  isDiagramReadOnlyBaseline,
  canEditModel: canInspectDiagramJson,
  canInspectDiagramJson,
  isSelectedDiagramPersistedOnServer,
  currentUserId: computed(() => currentUser.value?.id ?? null),
  getDiagramRenderer: () => diagramRenderer.value,
  ensureNotationRelationsAndRules,
  reconcileMaterializedRows: partialStore.reconcileMaterializedRows,
  onRemoteSnapshotApplied: () => {
    detachedModelLinks.invalidateAfterRemoteSync()
  },
  granularSync: {
    store: partialStore.store,
    publishMaterializedRows: partialStore.publishMaterializedRows,
    refreshVisibleChildrenScope: partialStore.refreshVisibleChildrenScope,
    invalidateChildrenScope: partialStore.invalidateChildrenScope,
    onDetachedSnapshotInvalidated: () => {
      detachedModelLinks.invalidateAfterRemoteSync()
    },
    onSyncError: (event, message, retry) => {
      const next = new Map(granularSyncFailures.value)
      next.set(`${event.entity}:${event.id}`, { entity: event.entity, message, retry })
      granularSyncFailures.value = next
    },
    onSyncRecovered: event => {
      const next = new Map(granularSyncFailures.value)
      next.delete(`${event.entity}:${event.id}`)
      granularSyncFailures.value = next
    },
  },
  onModelUnavailable: status => {
    errorMessage.value =
      status === 403 ? t('models.modelAccessRevoked') : t('models.modelNoLongerAvailable')
  },
})

async function handleReloadModelForDiagramLock() {
  await reloadModelForDiagramLock(loadModel)
}

watch(
  () => activeDiagram.value?.parsedAttrs.instances,
  () => {
    scheduleDebouncedLivePush()
  },
  { deep: true }
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
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        const exporter = new SvgExporter(diagramRenderer.value)
        let svg = exporter.exportSVG({
          includeBackground: true,
          backgroundColor:
            getComputedStyle(document.documentElement).getPropertyValue('--base-bg').trim() ||
            '#ffffff',
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

const diagramScopeLoadingText = computed(() => {
  const current = diagramScope.progress.value
  if (!current || current.total === 0) return t('models.diagramLoading')
  return `${t('models.diagramLoading')} ${current.loaded}/${current.total}`
})
watch(selectedDiagramId, () => {
  baselineError.value = null
})

async function retryDiagramScope(): Promise<void> {
  await whenCatalogReady()
  await diagramScope.reload()
}

const activeNotationId = computed(() => activeDiagram.value?.notationId ?? null)
const isActiveNotationRulesLoading = computed(() =>
  isNotationRelationsAndRulesLoading(activeNotationId.value)
)
const availableNodeComponents = computed(() => {
  const notationId = activeNotationId.value
  const node = selectedNode.value
  if (!notationId || !node) return []
  return resolveComponentByNodeType(state.value.components, notationId, node.nodeTypeId)
})

/** Visual binding for the selected diagram instance (fallback: node default for active notation). */
const nodeBindingComponentId = computed(() => {
  const notationId = activeNotationId.value
  const node = selectedNode.value
  if (!notationId || !node) return null
  const instanceId = selectedNodeInstanceId.value
  const instance = instanceId
    ? (activeDiagram.value?.parsedAttrs.instances.nodes.find(item => item.id === instanceId) ??
      null)
    : null
  return resolveInstanceComponentId({ instance, node, notationId })
})
const selectedNodeComponent = computed(() => {
  const notationId = activeNotationId.value
  const componentId = nodeBindingComponentId.value
  if (!notationId || !componentId) return null
  return (
    state.value.components.find(
      component => component.id === componentId && component.notationId === notationId
    ) ?? null
  )
})

const nodeCustomProperties = computed<CustomProperty[]>(() => {
  if (!selectedNodeComponent.value) return []
  return parseEntityAttrs(selectedNodeComponent.value.attrs ?? null).customProperties.filter(
    property => !property.system
  )
})

const selectedNodeTypeEntity = computed(() => {
  const node = selectedNode.value
  if (!node) return null
  return state.value.nodeTypes.find(nt => nt.id === node.nodeTypeId) ?? null
})

const nodeTypeCustomProperties = computed<CustomProperty[]>(() => {
  const nt = selectedNodeTypeEntity.value
  if (!nt) return []
  return parseEntityAttrs(nt.attrs ?? null).customProperties.filter(property => !property.system)
})

const nodeTypeScopedValues = computed<Record<string, unknown>>(() => {
  const node = selectedNode.value
  if (!node) return {}
  return node.parsedAttrs.typeProperties
})

const selectedLinkTypeEntity = computed(() => {
  const link = selectedLink.value
  if (!link) return null
  return state.value.linkTypes.find(lt => lt.id === link.linkTypeId) ?? null
})

const linkTypeCustomProperties = computed<CustomProperty[]>(() => {
  const lt = selectedLinkTypeEntity.value
  if (!lt) return []
  return parseEntityAttrs(lt.attrs ?? null).customProperties.filter(property => !property.system)
})

const linkTypeScopedValues = computed<Record<string, unknown>>(() => {
  const link = selectedLink.value
  if (!link) return {}
  return link.parsedAttrs.typeProperties
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
    .filter(d => !d._isDeleted)
    .map(d => ({ id: d.id, label: `${d.name} ${d.version}` }))
)

const documentsFromApi = ref<{ fileId: string; label: string }[]>([])
let documentsFetchTimer: ReturnType<typeof setTimeout> | null = null
let documentsFetchSeq = 0

async function fetchDocumentsFromApi() {
  const modelId = state.value.modelId
  if (!modelId || isLoading.value) return
  // Avoid competing with heavy model payload downloads on the HTTP/1.1 pool.
  await whenBackgroundReady()
  if (state.value.modelId !== modelId) return

  const seq = ++documentsFetchSeq
  const params = new URLSearchParams()
  params.set('modelId', modelId)
  const notationId = activeNotationId.value
  if (notationId) params.set('notationId', notationId)
  const componentId = nodeBindingComponentId.value
  if (componentId) params.set('componentId', componentId)
  const nodeTypeId = selectedNode.value?.nodeTypeId ?? null
  if (nodeTypeId) params.set('nodeTypeId', nodeTypeId)
  const nodeId = selectedNode.value?.id ?? null
  if (nodeId) params.set('nodeId', nodeId)
  const res = await apiGet<{ fileId: string; label: string }[]>(`/documents?${params.toString()}`)
  if (seq !== documentsFetchSeq) return
  if (res.success) documentsFromApi.value = res.data
  else documentsFromApi.value = []
}

function scheduleFetchDocumentsFromApi() {
  if (documentsFetchTimer) clearTimeout(documentsFetchTimer)
  documentsFetchTimer = setTimeout(() => {
    documentsFetchTimer = null
    void fetchDocumentsFromApi()
  }, 400)
}

watch(
  () => [
    state.value.modelId,
    isLoading.value,
    activeNotationId.value,
    nodeBindingComponentId.value,
    selectedNode.value?.id,
    selectedNode.value?.nodeTypeId,
  ],
  () => {
    scheduleFetchDocumentsFromApi()
  }
)

/** Local wiki links from explicit documentFileId only — no deep UUID scan over 10k+ nodes. */
function modelDocumentsInState(): { fileId: string; label: string }[] {
  const seen = new Set<string>()
  const list: { fileId: string; label: string }[] = []
  for (const node of state.value.nodes) {
    if (node._isDeleted) continue
    const fileId = node.parsedAttrs.documentFileId
    if (typeof fileId === 'string' && fileId && !seen.has(fileId)) {
      seen.add(fileId)
      list.push({ fileId, label: `${node.name} (${t('diagram.nodeLabel')})` })
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

const layoutBusy = ref(false)
const showLayoutPreviewModal = ref(false)
const layoutPreviewBefore = ref<DiagramAttrs | null>(null)
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

function handleLayoutPreviewApply(after: DiagramAttrs) {
  showLayoutPreviewModal.value = false
  layoutPreviewBefore.value = null
  diagramCanvasRef.value?.applyLayoutResult(after)
}

function handleLayoutPreviewClose() {
  showLayoutPreviewModal.value = false
  layoutPreviewBefore.value = null
}

const {
  newerNotationVersions,
  activeDiagramNotationName,
  activeDiagramNotationVersion,
  activeDiagramNotationOwnerLabel,
  canOpenActiveDiagramNotation,
} = useNotationVersionBanner({
  state,
  activeDiagram,
  activeNotationId,
  selectedDiagramId,
  t: (key, params) => String(t(key, params ?? {})),
  ensureNotationRelationsAndRules,
  setUiError,
})

const {
  showMigrateModal,
  migrateTarget,
  isMigrating,
  migratePreviewUnmapped,
  openMigrateModal,
  closeMigrateModal,
  confirmMigrateNotation,
} = useDiagramNotationMigration({
  state,
  activeDiagram,
  isDiagramReadOnly,
  newerNotationVersions,
  t: (key, params) => String(t(key, params ?? {})),
  setUiError,
  markDiagramDirty,
  markNodeDirty,
  markLinkDirty,
  ensureNotationRelationsAndRules,
})

const {
  showNoteEditorModal,
  editingNoteInstanceId,
  noteEditorText,
  isNoteInstance,
  openNoteEditor,
  saveNoteEditor,
  cancelNoteEditor,
} = useNoteEditor(activeDiagram, isDiagramReadOnly, markDiagramDirty)

const isSelectedNodeUntyped = computed(() => {
  const node = selectedNode.value
  return !!node && isUntypedNodeTypeId(node.nodeTypeId)
})
const canShowPropertiesTab = computed(() => true)
const traceabilityNodes = computed(() =>
  state.value.nodes.filter(node => !node._isDeleted && !isUntypedNodeTypeId(node.nodeTypeId))
)
const traceabilityLinks = computed(() =>
  (detachedModelLinks.loadedModelId.value === state.value.modelId
    ? detachedConsumerLinks.value
    : []
  ).filter(link => !link._isDeleted && !isUntypedLinkTypeId(link.linkTypeId))
)
const treeVisibleNodes = computed(() =>
  state.value.nodes.filter(node => !node._isDeleted && !isUntypedNodeTypeId(node.nodeTypeId))
)
const canShowTraceabilityTab = computed(() => !!selectedNode.value && !isSelectedNodeUntyped.value)
const canEditSelectedElementStyle = computed(() => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !selectedElementId) return false

  if (selectedElementId.startsWith('instance-')) {
    const instanceId = selectedElementId.slice('instance-'.length)
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    return !!instance
  }

  if (selectedElementId.startsWith('edge-')) {
    const edgeId = selectedElementId.slice('edge-'.length)
    const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
    return !!edge && edge.attrs?.isDiagramOnly !== true
  }

  return false
})
const canShowStyleTab = computed(
  () => !!activeDiagram.value && !isDiagramReadOnly.value && canEditSelectedElementStyle.value
)
const selectedElementIsComposite = computed(
  () => selectedElementDiagramStyle.value?.nodeShape === 'composite'
)
const rightPanelTabs = computed(() => {
  const tabs: { id: string; label: string; icon: string }[] = []
  if (canShowPropertiesTab.value) {
    tabs.push({ id: 'properties', label: t('models.propertiesTab'), icon: 'tune' })
  }
  if (canShowTraceabilityTab.value) {
    tabs.push({ id: 'traceability', label: t('models.traceabilityTab'), icon: 'device_hub' })
  }
  if (canShowStyleTab.value) {
    if (selectedElementIsComposite.value) {
      tabs.push({
        id: 'composite-style',
        label: t('notations.compositeFigureStyleTab'),
        icon: 'dashboard_customize',
      })
    } else {
      tabs.push({ id: 'style', label: t('models.figureStyleTab'), icon: 'palette' })
    }
  }
  return tabs
})

watch([rightPanelTabs, activeRightTab], () => {
  if (!rightPanelTabs.value.some(tab => tab.id === activeRightTab.value)) {
    activeRightTab.value = rightPanelTabs.value[0]?.id ?? 'properties'
  }
})
watch(activeRightTab, tab => {
  if (tab === 'traceability') {
    void detachedModelLinks.load()
  }
})
watch(partialStore.generation, () => {
  granularSyncFailures.value = new Map()
  detachedModelLinks.reset()
  if (activeRightTab.value === 'traceability') {
    void whenCatalogReady().then(() => detachedModelLinks.load())
  }
})

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
  if (!canInspectDiagramJson.value) return
  const error = renameModel(nextName)
  if (error) setUiError(error)
}
const handleOpenNotationEditor = (notationId: string) => {
  router.push({ name: 'notation-editor', params: { id: notationId } })
}
const {
  createNodeModal,
  showCreateNodeModal,
  createNodePending,
  newNodeName,
  newNodeTypeId,
  showCreateDiagramModal,
  newDiagramName,
  newDiagramVersion,
  newDiagramNotationId,
  hasDiagramNameVersionConflict,
  directoryNodeType,
  nodeTypeDefaultDirectoryById,
  createNodeModalTitle,
  nonDirectoryNodeTypes,
  treeRootNodeId,
  treeScopeForParent,
  ensureCompleteSiblingScope,
  canCreateNodeFromModal,
  getNextTreeOrderForParent,
  ensureDirectoryPath,
  openCreateFolder,
  openCreateRegularNode,
  createNode,
  openCreateDiagram,
  createDiagram,
  isDirectoryNode,
  handleMoveNode,
  handleMoveDiagram,
  handleRenameNode,
  handleRenameDiagram,
} = useModelTreeOperations({
  state,
  model,
  selectedDiagramId,
  t: (key, params) => String(t(key, params ?? {})),
  setUiError,
  clearUiError: () => {
    uiError.value = null
  },
  markNodeDirty,
  markDiagramDirty,
  ensureDiagramAttrsLoaded: diagramId => {
    void ensureDiagramAttrsLoaded(() => state.value, diagramId)
  },
  isChildrenScopeComplete: scope =>
    partialStore.store.loadedChildrenFor.has(partialStore.store.scopeKey(scope)),
  ensureChildrenScopeComplete: partialStore.ensureChildrenScopeComplete,
  reconcileMaterializedRows: partialStore.reconcileMaterializedRows,
})
const lazyTreeSearchQuery = ref('')
const lazyTreeSearch = useLazyTreeSearch({
  modelId: computed(() => state.value.modelId),
  treeRootNodeId,
  query: lazyTreeSearchQuery,
  mergeNodes: (nodes, guard) => partialStore.mergePartialEntities(nodes, [], guard),
  beginRequest: () => partialStore.store.beginRequest('tree-search-selection'),
  isRequestCurrent: guard => partialStore.store.isRequestCurrent(guard),
})

const applyLazyTreePath = async (nodeId: string, path: readonly string[]): Promise<void> => {
  if (path.length === 0) return
  treePanelRef.value?.expandPath?.(path.slice(0, -1))
  handleTreeSelectNode(nodeId)
  await nextTick()
  await treePanelRef.value?.focusNode?.(nodeId)
}

const handleTreeSearchHit = async (nodeId: string): Promise<void> => {
  await applyLazyTreePath(nodeId, await lazyTreeSearch.selectHit(nodeId))
}

const retryTreeSearchSelection = async (): Promise<void> => {
  const path = await lazyTreeSearch.retrySelection()
  const nodeId = path.at(-1)
  if (nodeId) await applyLazyTreePath(nodeId, path)
}
const closeCreateNodeModal = (): void => {
  if (!createNodePending.value) showCreateNodeModal.value = false
}

const {
  showImportWizard,
  isImportingOef,
  oefImportProgress,
  oefImportReport,
  oefWarningLabel,
  handleOefImportSubmit,
} = useOefImport({
  state,
  treeRootNodeId,
  t: (key, params) => String(t(key, params ?? {})),
  setUiError,
  loadModel,
  getExistingLinks: () => detachedConsumerLinks.value,
  isExistingLinksReady: () =>
    detachedModelLinks.loadedModelId.value === state.value.modelId &&
    !detachedModelLinks.stale.value,
})

async function ensureImportNotationCatalog(notationId: string): Promise<void> {
  await ensureNotationImportCatalog({
    modelId: state.value.modelId,
    notationId,
    state: state.value,
    ensureNotationRelationsAndRules,
  })
}

async function ensureImportDiagramAttrs(): Promise<void> {
  await ensureAllDiagramAttrsLoaded(() => state.value)
}

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
    if (isNoteInstance(instance)) return t('models.noteName')
    if (isContainerInstance(instance)) return t('models.containerName')
    if (isEdgeAnchorInstance(instance)) return t('models.edgeAnchorName')
    return state.value.nodes.find(item => item.id === instance.modelNodeId)?.name ?? ''
  }
  const nodeId = pendingDeleteNodeIds.value[0]
  if (!nodeId) return ''
  if (isDiagramNoteModelNodeId(nodeId)) return t('models.noteName')
  if (isDiagramContainerModelNodeId(nodeId)) return t('models.containerName')
  if (isEdgeAnchorModelNodeId(nodeId)) return t('models.edgeAnchorName')
  return state.value.nodes.find(item => item.id === nodeId)?.name ?? ''
})
const nodeDeleteConfirmMessage = computed(() => {
  const name = pendingDeleteNodeSingleName.value || t('common.unnamed')
  const count = pendingDeleteNodeCount.value
  if (pendingDeleteNodeSource.value === 'canvas') {
    return count === 1
      ? t('models.deleteNodeFromDiagramSingle', { name })
      : t('models.deleteNodeFromDiagramMultiple', { count })
  }
  return count === 1
    ? t('models.deleteNodeFromModelSingle', { name })
    : t('models.deleteNodeFromModelMultiple', { count })
})
const pendingDeleteDiagramName = computed(() => {
  const diagramId = pendingDeleteDiagramId.value
  if (!diagramId) return ''
  return state.value.diagrams.find(item => item.id === diagramId)?.name ?? ''
})

const getLinkTypeName = (linkTypeId: string): string =>
  state.value.linkTypes.find(item => item.id === linkTypeId)?.name ?? t('models.unknownLinkType')

const resolveRelationForLink = (link: EditorLink): RelationResponse | null => {
  const notationId = activeNotationId.value
  if (!notationId) return null

  const explicitRelationId = link.parsedAttrs.notationRelations[notationId]?.relationId
  if (explicitRelationId) {
    const explicitRelation = state.value.relations.find(
      item => item.id === explicitRelationId && item.notationId === notationId
    )
    if (explicitRelation) return explicitRelation
  }

  return (
    state.value.relations.find(
      item => item.notationId === notationId && item.linkTypeId === link.linkTypeId
    ) ?? null
  )
}

const formatCustomPropertyValue = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.length > 0 ? value : '""'
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  try {
    const serialized = JSON.stringify(value)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

const getReuseLinkCustomProperties = (link: EditorLink): Array<{ name: string; value: string }> => {
  const notationId = activeNotationId.value
  if (!notationId) return []

  const relation = resolveRelationForLink(link)
  if (!relation) return []

  const scopedValues = getDiagramScopedLinkValues({
    diagram: activeDiagram.value?.parsedAttrs,
    modelLinkId: link.id,
    notationId,
    relationId: relation.id,
    linkAttrsFallback: link.parsedAttrs,
  })
  const relationProperties = parseEntityAttrs(relation.attrs ?? null).customProperties

  const result: Array<{ name: string; value: string }> = []
  for (const property of relationProperties) {
    if (!Object.prototype.hasOwnProperty.call(scopedValues, property.name)) continue
    result.push({
      name: property.name,
      value: formatCustomPropertyValue(scopedValues[property.name]),
    })
  }

  for (const [name, value] of Object.entries(scopedValues)) {
    if (result.some(item => item.name === name)) continue
    result.push({ name, value: formatCustomPropertyValue(value) })
  }

  return result
}

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const isDiagramNoteModelNodeId = (modelNodeId: string): boolean =>
  isDiagramNoteModelNodeIdHelper(modelNodeId)

const isUntypedModelLinkId = (modelLinkId: string): boolean => {
  const link = state.value.links.find(item => item.id === modelLinkId && !item._isDeleted)
  if (!link) return false
  return isUntypedLinkTypeId(link.linkTypeId)
}

const isDirectoryNoteInstanceId = (instanceId: string): boolean => {
  const diagram = activeDiagram.value
  if (!diagram) return false
  const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
  return instance?.attrs?.isDirectoryNote === true
}

const pushDiagramHistory = (command: { execute: () => void; undo: () => void }) => {
  const history = diagramInteractionManager.value?.history
  if (history && typeof history.execute === 'function') {
    history.execute(command)
    return
  }
  command.execute()
}

const diagramHistoryBatcher = createDiagramHistoryBatcher({
  executeCommand: pushDiagramHistory,
})

const executeDiagramHistoryCommand = (command: { execute: () => void; undo: () => void }) => {
  diagramHistoryBatcher.flush()
  pushDiagramHistory(command)
}

const recordDiagramHistory = (key: string, command: { execute: () => void; undo: () => void }) => {
  if (isDiagramReadOnly.value || !activeDiagram.value) return
  diagramHistoryBatcher.record(key, command)
}

const commitDiagramHistory = (command: { execute: () => void; undo: () => void }) => {
  if (isDiagramReadOnly.value || !activeDiagram.value) return
  diagramHistoryBatcher.commit(command)
}

type NodeInstanceStyleSnapshot = {
  width?: number
  height?: number
  attrs?: Record<string, unknown>
}

const applyNodeInstanceStyleSnapshot = (
  diagramId: string,
  instanceId: string,
  snapshot: NodeInstanceStyleSnapshot
): void => {
  const diagram = state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
  const instance = diagram?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
  if (!diagram || !instance) return
  instance.width = snapshot.width
  instance.height = snapshot.height
  instance.attrs = snapshot.attrs ? clonePlainDeep(snapshot.attrs) : undefined
  markDiagramDirty(diagram.id)
}

const applyEdgeInstanceStyleSnapshot = (
  diagramId: string,
  edgeId: string,
  attrs: Record<string, unknown> | undefined
): void => {
  const diagram = state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
  const edge = diagram?.parsedAttrs.instances.edges.find(item => item.id === edgeId)
  if (!diagram || !edge) return
  edge.attrs = attrs ? clonePlainDeep(attrs) : undefined
  markDiagramDirty(diagram.id)
}

const {
  showComponentChoiceModal,
  componentChoiceOptions,
  handleComponentChoiceModalClose,
  finalizeComponentChoiceForDiagram,
  bindNodeComponent,
  bindInstanceComponent,
  addExistingNodeToDiagram,
  createNodeFromPaletteComponent,
  createDiagramNote,
  createDiagramContainer,
  copySelectedNotesToClipboard,
  pasteCopiedNotes,
} = useModelDiagramInstances({
  state,
  activeDiagram,
  activeNotationId,
  isDiagramReadOnly,
  directoryNodeType,
  nodeTypeDefaultDirectoryById,
  selectedModelNodeIds,
  selectedInstanceIds,
  selectedNodeId,
  selectedModelLinkId,
  selectedEdgeInstanceId,
  selectedCanvasElementId,
  editingNoteInstanceId,
  showNoteEditorModal,
  isDirectoryNode,
  isNoteInstance,
  ensureDirectoryPath,
  ensureCompleteSiblingScope,
  getNextTreeOrderForParent,
  treeScopeForParent,
  executeDiagramHistoryCommand,
  markDiagramDirty,
  markNodeDirty,
  reconcileMaterializedRows: partialStore.reconcileMaterializedRows,
  setUiError,
  t: key => String(t(key)),
})

const handleBindNodeComponent = (componentId: string): void => {
  if (isDiagramReadOnly.value) return
  const diagram = activeDiagram.value
  const instanceId = selectedNodeInstanceId.value
  const node = selectedNode.value
  const instance = instanceId
    ? diagram?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    : null
  const beforeNode = node ? clonePlainDeep(node.parsedAttrs) : null
  const beforeInstance = instance
    ? clonePlainDeep({
        width: instance.width,
        height: instance.height,
        attrs: instance.attrs,
      })
    : null

  if (instanceId) {
    bindInstanceComponent(instanceId, componentId)
  } else if (node) {
    bindNodeComponent(node, componentId)
  } else {
    return
  }

  const nodeId = node?.id
  const afterNode = node ? clonePlainDeep(node.parsedAttrs) : null
  const afterInstance = instance
    ? clonePlainDeep({
        width: instance.width,
        height: instance.height,
        attrs: instance.attrs,
      })
    : null
  const diagramId = diagram?.id
  commitDiagramHistory({
    execute: () => {
      const n = nodeId ? state.value.nodes.find(item => item.id === nodeId) : null
      if (n && afterNode) n.parsedAttrs = clonePlainDeep(afterNode)
      if (diagramId && instanceId && afterInstance) {
        applyNodeInstanceStyleSnapshot(diagramId, instanceId, afterInstance)
      }
      if (n) markNodeDirty(n.id)
    },
    undo: () => {
      const n = nodeId ? state.value.nodes.find(item => item.id === nodeId) : null
      if (n && beforeNode) n.parsedAttrs = clonePlainDeep(beforeNode)
      if (diagramId && instanceId && beforeInstance) {
        applyNodeInstanceStyleSnapshot(diagramId, instanceId, beforeInstance)
      }
      if (n) markNodeDirty(n.id)
    },
  })
}

const bindLinkRelationFromPanel = (relationId: string): void => {
  const link = selectedLink.value
  if (!link || isDiagramReadOnly.value) return
  const before = clonePlainDeep(link.parsedAttrs)
  bindLinkRelation(link, relationId)
  const after = clonePlainDeep(link.parsedAttrs)
  const linkId = link.id
  commitDiagramHistory({
    execute: () => {
      const row = state.value.links.find(item => item.id === linkId)
      if (!row) return
      row.parsedAttrs = clonePlainDeep(after)
      markLinkDirty(row.id)
    },
    undo: () => {
      const row = state.value.links.find(item => item.id === linkId)
      if (!row) return
      row.parsedAttrs = clonePlainDeep(before)
      markLinkDirty(row.id)
    },
  })
}

const scheduleSyncDefaultsOnLoad = (): void => {
  const modelId = state.value.modelId
  void whenCatalogReady()
    .then(() => whenBackgroundReady())
    .then(async () => {
      if (state.value.modelId !== modelId) return
      await syncDefaultsOnLoadChunked(state.value)
    })
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
    applyDefaultCustomPropertyValuesFromAttrs(
      link.parsedAttrs.relationProperties[notationId][relationId]!,
      relation.attrs
    )
  }
  const linkType = state.value.linkTypes.find(item => item.id === link.linkTypeId)
  if (linkType) {
    applyDefaultCustomPropertyValuesFromAttrs(link.parsedAttrs.typeProperties, linkType.attrs, {
      skipSystem: true,
    })
  }
  if (options?.markDirty ?? true) {
    markLinkDirty(link.id)
  }
}

const {
  showRelationChoiceModal,
  relationChoiceOptions,
  showReuseLinkModal,
  reuseLinkOptions,
  startConnectNodes,
  connectNodeToEdge,
  reconnectEdgeToHost,
  finalizeConnection,
  handleCreateNewLinkFromReuseModal,
  handleRequestAutoLink,
  handleRequestBoundaryAutoLink,
  handleSelectExistingLink,
  placeTraceLinkOnDiagram,
  canConnect,
} = useModelDiagramConnections({
  state,
  activeDiagram,
  activeNotationId,
  defaultEdgeType,
  isRelationRulesLoading: isActiveNotationRulesLoading,
  isDiagramReadOnly,
  isDiagramNoteModelNodeId,
  isDiagramContainerModelNodeId,
  isEdgeAnchorModelNodeId,
  isDirectoryNode,
  isDirectoryNoteInstanceId,
  executeDiagramHistoryCommand,
  markDiagramDirty,
  markLinkDirty,
  reconcileMaterializedRows: partialStore.reconcileMaterializedRows,
  bindLinkRelation,
  setUiError,
  t: key => String(t(key)),
  selectedModelLinkId,
  selectedEdgeInstanceId,
  selectedCanvasElementId,
})

const reuseLinkModalOptions = computed(() =>
  reuseLinkOptions.value.map(link => ({
    id: link.id,
    linkTypeName: getLinkTypeName(link.linkTypeId),
    customProperties: getReuseLinkCustomProperties(link),
  }))
)

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
    markNodeDirty(node.id)
  }
  partialStore.reconcileMaterializedRows([treeScopeForParent(node.parentNodeId ?? null)])
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
  const deletedCanvasNodeIds = canvasModelNodeIds(row.parsedAttrs.instances)
  if (row._isNew) {
    state.value.diagrams = state.value.diagrams.filter(item => item.id !== diagramId)
  } else {
    row._isDeleted = true
    row._isDirty = true
  }
  if (selectedDiagramId.value === diagramId) selectedDiagramId.value = null

  const remainingCanvasNodeIds = state.value.diagrams
    .filter(diagram => diagram.id !== diagramId && !diagram._isDeleted)
    .flatMap(diagram => canvasModelNodeIds(diagram.parsedAttrs.instances))
  const untypedNodeTypeIds = new Set(
    state.value.nodeTypes.filter(type => isUntypedTypeName(type.name)).map(type => type.id)
  )
  for (const nodeId of orphanedUntypedNodeIds({
    deletedCanvasNodeIds,
    remainingCanvasNodeIds,
    nodes: state.value.nodes,
    untypedNodeTypeIds,
  })) {
    markNodeDeleted(nodeId)
  }
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
    markLinkDirty(row.id)
  }
  partialStore.reconcileMaterializedRows([])

  if (selectedModelLinkId.value === linkId) {
    selectedModelLinkId.value = null
    selectedEdgeInstanceId.value = null
  }
  if (selectedCanvasElementId.value?.startsWith('edge-')) selectedCanvasElementId.value = null
}

const cancelDiagramSwitch = () => {
  pendingDiagramSwitchId.value = null
  pendingDiagramAction.value = null
  showDiagramSwitchModal.value = false
}

const switchDiagramWithoutSave = async () => {
  const action = pendingDiagramAction.value
  if (!action) return

  const targetDiagramId = pendingDiagramSwitchId.value
  // Close the modal immediately so the UI does not feel stuck on large models.
  cancelDiagramSwitch()

  await discardUnsavedChanges()
  diagramInteractionManager.value?.history?.clear?.()

  if (action === 'close') {
    selectedDiagramId.value = null
    selectedModelNodeIds.value = []
    selectedInstanceIds.value = []
    selectedModelLinkId.value = null
    selectedEdgeInstanceId.value = null
    return
  }

  if (!targetDiagramId) return
  const restoredTarget = state.value.diagrams.find(
    diagram => diagram.id === targetDiagramId && !diagram._isDeleted
  )
  if (!restoredTarget) {
    setUiError(t('models.diagramSwitchFailed'))
    return
  }

  applyDiagramSelection(restoredTarget.id)
}

const validateRequiredCustomProperties = (): string | null => {
  const issue = validateRequiredCustomPropertiesState({
    state: state.value,
    activeDiagram: activeDiagram.value?.parsedAttrs,
  })
  return issue ? t(issue.key, issue.params) : null
}

/** Let Vue paint the saving toast before sync/CPU-heavy pre-save work. */
const yieldToUiPaint = (): Promise<void> =>
  new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

const saveWithValidation = async (): Promise<boolean> => {
  if (isSaving.value) return false

  // Show toast immediately — validation/lock/flush can block the main thread for a while.
  startSave()
  saveProgress.value = t('common.saving')
  await nextTick()
  await yieldToUiPaint()

  try {
    const validationError = validateRequiredCustomProperties()
    if (validationError) {
      setUiError(validationError)
      return false
    }
    // Проверить, что лок ещё наш, до начала сохранения
    const lockOk = await verifyLockBeforeSave()
    if (!lockOk) return false

    diagramHistoryBatcher.flush()
    diagramCanvasRef.value?.flushCanvasState()
    await nextTick()
    const ok = await saveChanges()
    if (ok) {
      await detachedModelLinks.refreshAfterSuccessfulSave()
      diagramCanvasRef.value?.resetHistory()
      if (activeDiagram.value?.id && diagramRenderer.value) {
        void uploadDiagramPreview()
      }
    }
    return ok
  } finally {
    if (isSaving.value) finishSave()
  }
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
    const cleaned = removeOrphanEdgeAnchors(diagram.parsedAttrs)
    if (cleaned.changed) {
      diagram.parsedAttrs = cleaned.nextAttrs
    }
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

  if (isDiagramOnlyEdgeModelLinkId(linkId) || isUntypedModelLinkId(linkId)) {
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
  openLinkDeleteDialog(selectedModelLinkId.value, selectedEdgeInstanceId.value ?? undefined)
}

watch(
  () => activeDiagram.value?.id ?? null,
  diagramId => {
    diagramHistoryBatcher.drop()
    if (!diagramId) {
      selectedCanvasElementId.value = null
    }
  }
)

const setDiagramAttrs = (next: DiagramAttrs, options?: { dirty?: boolean }) => {
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

  const idx = state.value.diagrams.findIndex(d => d.id === diagram.id && !d._isDeleted)
  if (idx >= 0) {
    const diagrams = [...state.value.diagrams]
    const current = diagrams[idx]
    if (!current) return
    const keepDirty = options?.dirty === false ? false : true
    diagrams[idx] = {
      ...current,
      parsedAttrs: next,
      ...(keepDirty ? (current._isNew ? {} : { _isDirty: true }) : { _isDirty: false }),
    }
    state.value.diagrams = diagrams
  } else if (options?.dirty !== false) {
    markDiagramDirty(diagram.id)
  }
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

const handleTraceabilityFocusNode = (modelNodeId: string) => {
  const diagram = activeDiagram.value
  if (!diagram) return
  const hasNodeOnDiagram = diagram.parsedAttrs.instances.nodes.some(
    instance => instance.modelNodeId === modelNodeId
  )
  if (!hasNodeOnDiagram) return

  selectedModelLinkId.value = null
  selectedEdgeInstanceId.value = null
  selectedInstanceIds.value = []
  selectedModelNodeIds.value = [modelNodeId]

  nextTick(() => {
    diagramCanvasRef.value?.zoomToSelection()
  })
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
  if (
    isDiagramNoteModelNodeId(modelNodeId) ||
    isDiagramContainerModelNodeId(modelNodeId) ||
    isEdgeAnchorModelNodeId(modelNodeId)
  ) {
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
  const nextName = newLabel.trim()
  if (!node || !nextName || node.name === nextName) return
  node.name = nextName
  markNodeDirty(node.id)
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

const boundaryRelationIds = (notationId: string): Set<string> =>
  new Set(
    state.value.relations
      .filter(
        relation =>
          relation.notationId === notationId &&
          hasSystemBooleanDefault(
            parseEntityAttrs(relation.attrs ?? null).customProperties,
            'boundary'
          )
      )
      .map(relation => relation.id)
  )

const guestBoundaryLinks = (guestModelNodeId: string, hostModelNodeId?: string | null) => {
  const notationId = activeNotationId.value
  if (!notationId) return []
  return listBoundaryLinksToGuest({
    links: state.value.links,
    boundaryRelationIds: boundaryRelationIds(notationId),
    notationId,
    guestModelNodeId,
    hostModelNodeId,
  })
}

const removeBoundaryLinkEdges = (linkId: string, guestInstanceId: string): void => {
  for (const diagram of state.value.diagrams) {
    if (diagram._isDeleted) continue
    const initial = diagram.parsedAttrs.instances.edges.length
    diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
      edge =>
        !(
          edge.modelLinkId === linkId &&
          (edge.targetInstanceId === guestInstanceId || edge.sourceInstanceId === guestInstanceId)
        )
    )
    if (diagram.parsedAttrs.instances.edges.length !== initial) {
      markDiagramDirty(diagram.id)
    }
  }
}

const handleRequestBoundaryDetach = (
  guestModelNodeId: string,
  guestInstanceId: string,
  oldHostModelNodeId?: string | null
) => {
  if (isDiagramReadOnly.value) return
  for (const link of guestBoundaryLinks(guestModelNodeId, oldHostModelNodeId)) {
    removeBoundaryLinkEdges(link.id, guestInstanceId)
    markLinkDeleted(link.id)
  }
}

const handleRequestBoundaryRebind = (
  guestModelNodeId: string,
  guestInstanceId: string,
  newHostModelNodeId: string,
  _newHostInstanceId: string,
  oldHostModelNodeId?: string | null
) => {
  if (isDiagramReadOnly.value) return
  const diagram = activeDiagram.value
  if (!diagram) return

  const linksOnNewHost = guestBoundaryLinks(guestModelNodeId, newHostModelNodeId)
  const linksOnOldHost = guestBoundaryLinks(guestModelNodeId, oldHostModelNodeId)
  const linksToKeep = linksOnNewHost.length > 0 ? linksOnNewHost : linksOnOldHost
  if (linksToKeep.length === 0) return

  if (linksOnNewHost.length > 0) {
    for (const link of linksOnOldHost) {
      if (linksOnNewHost.some(item => item.id === link.id)) continue
      removeBoundaryLinkEdges(link.id, guestInstanceId)
      markLinkDeleted(link.id)
    }
  } else {
    for (const link of linksOnOldHost) {
      if (link.sourceId === newHostModelNodeId) continue
      link.sourceId = newHostModelNodeId
      markLinkDirty(link.id)
    }
  }

  const keepIds = new Set(linksToKeep.map(link => link.id))
  const beforeEdges = diagram.parsedAttrs.instances.edges.length
  diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
    edge => !keepIds.has(edge.modelLinkId)
  )
  if (diagram.parsedAttrs.instances.edges.length !== beforeEdges) {
    markDiagramDirty(diagram.id)
  }
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
      diagramHistoryBatcher.flush()
      diagramCanvasRef.value?.undo()
      break
    case 'redo':
      diagramHistoryBatcher.flush()
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
    case 'auto-layout-nodes': {
      const d = activeDiagram.value
      if (!d || isDiagramReadOnly.value) break
      layoutPreviewBefore.value = clonePlainDeep(d.parsedAttrs)
      showLayoutPreviewModal.value = true
      break
    }
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
    case 'import-oef':
      if (canInspectDiagramJson.value) {
        const loadedLinks = await detachedModelLinks.load()
        if (!loadedLinks) {
          setUiError(detachedModelLinks.error.value ?? t('common.error'))
          break
        }
        showImportWizard.value = true
      }
      break
    case 'export-model-package': {
      const modelId = model.value?.id
      if (!modelId) break
      try {
        const fileName = `${sanitizeFileName(model.value?.name ?? '') || 'model'}.zip`
        await downloadModelPackage(modelId, fileName)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setUiError(t('models.packageExportFailed', { message }))
      }
      break
    }
    case 'run-validation-script':
      showValidationScriptsModal.value = true
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
    case 'open-model-doc': {
      const hasModelDoc = !!modelRootDocumentFileId.value
      if (!canInspectDiagramJson.value && !hasModelDoc) break
      handleOpenModelDoc()
      break
    }
    case 'open-diagram-doc': {
      const d = activeDiagram.value
      if (!d) break
      const hasDiagramDoc =
        typeof d.parsedAttrs?.documentFileId === 'string' &&
        d.parsedAttrs.documentFileId.trim().length > 0
      if (!canInspectDiagramJson.value && !hasDiagramDoc) break
      handleOpenDiagramDoc()
      break
    }
  }
}

const setNodeTypePropertyValue = (key: string, value: unknown) => {
  const node = selectedNode.value
  if (!node) return
  if (Object.is(node.parsedAttrs.typeProperties[key], value)) return
  const nodeId = node.id
  const before = clonePlainDeep(node.parsedAttrs.typeProperties)
  node.parsedAttrs.typeProperties[key] = value
  markNodeDirty(node.id)
  const after = clonePlainDeep(node.parsedAttrs.typeProperties)
  recordDiagramHistory(`nodeType:${nodeId}`, {
    execute: () => {
      const row = state.value.nodes.find(item => item.id === nodeId)
      if (!row) return
      row.parsedAttrs.typeProperties = clonePlainDeep(after)
      markNodeDirty(row.id)
    },
    undo: () => {
      const row = state.value.nodes.find(item => item.id === nodeId)
      if (!row) return
      row.parsedAttrs.typeProperties = clonePlainDeep(before)
      markNodeDirty(row.id)
    },
  })
}

const setLinkTypePropertyValue = (key: string, value: unknown) => {
  const link = selectedLink.value
  if (!link) return
  if (Object.is(link.parsedAttrs.typeProperties[key], value)) return
  const linkId = link.id
  const before = clonePlainDeep(link.parsedAttrs.typeProperties)
  link.parsedAttrs.typeProperties[key] = value
  markLinkDirty(link.id)
  const after = clonePlainDeep(link.parsedAttrs.typeProperties)
  recordDiagramHistory(`linkType:${linkId}`, {
    execute: () => {
      const row = state.value.links.find(item => item.id === linkId)
      if (!row) return
      row.parsedAttrs.typeProperties = clonePlainDeep(after)
      markLinkDirty(row.id)
    },
    undo: () => {
      const row = state.value.links.find(item => item.id === linkId)
      if (!row) return
      row.parsedAttrs.typeProperties = clonePlainDeep(before)
      markLinkDirty(row.id)
    },
  })
}

const setNodeScopedValue = (key: string, value: unknown) => {
  const notationId = activeNotationId.value
  const componentId = nodeBindingComponentId.value
  const node = selectedNode.value
  const diagram = activeDiagram.value
  if (!notationId || !componentId || !node) return

  if (diagram) {
    const instanceId = selectedNodeInstanceId.value
    const instance = instanceId
      ? diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
      : null
    const beforeAttrs = clonePlainDeep(instance?.attrs)
    const changed = setDiagramScopedNodeValue({
      diagram: diagram.parsedAttrs,
      modelNodeId: node.id,
      notationId,
      componentId,
      key,
      value,
      nodeAttrsFallback: node.parsedAttrs,
      instanceId,
    })
    if (changed) {
      markDiagramDirty(diagram.id)
      const afterAttrs = clonePlainDeep(instance?.attrs)
      const diagramId = diagram.id
      if (instanceId) {
        recordDiagramHistory(`nodeScoped:${instanceId}`, {
          execute: () => {
            const d = state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
            const inst = d?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
            if (!d || !inst) return
            inst.attrs = afterAttrs ? clonePlainDeep(afterAttrs) : undefined
            markDiagramDirty(d.id)
          },
          undo: () => {
            const d = state.value.diagrams.find(item => item.id === diagramId && !item._isDeleted)
            const inst = d?.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
            if (!d || !inst) return
            inst.attrs = beforeAttrs ? clonePlainDeep(beforeAttrs) : undefined
            markDiagramDirty(d.id)
          },
        })
      }
    }
    return
  }

  if (!node.parsedAttrs.componentProperties[notationId]) {
    node.parsedAttrs.componentProperties[notationId] = {}
  }
  if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
    node.parsedAttrs.componentProperties[notationId][componentId] = {}
  }
  const target = node.parsedAttrs.componentProperties[notationId][componentId]!
  if (!Object.is(target[key], value)) {
    target[key] = value
    markNodeDirty(node.id)
  }
}

const setLinkScopedValue = (key: string, value: unknown) => {
  const notationId = activeNotationId.value
  const relationId = linkBindingRelationId.value
  const link = selectedLink.value
  const diagram = activeDiagram.value
  if (!notationId || !relationId || !link || !diagram) return
  const edgeId = selectedLinkEdgeInstanceId.value
  const edge = edgeId ? diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId) : null
  const beforeAttrs = clonePlainDeep(edge?.attrs)
  const changed = setDiagramScopedLinkValue({
    diagram: diagram.parsedAttrs,
    modelLinkId: link.id,
    notationId,
    relationId,
    key,
    value,
    linkAttrsFallback: link.parsedAttrs,
    edgeInstanceId: edgeId,
  })
  if (changed) {
    markDiagramDirty(diagram.id)
    if (edgeId) {
      const afterAttrs = clonePlainDeep(edge?.attrs)
      const diagramId = diagram.id
      recordDiagramHistory(`linkScoped:${edgeId}`, {
        execute: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, afterAttrs),
        undo: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, beforeAttrs),
      })
    }
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
  setNodeTypePropertyValue,
  t,
  onDocLinkFailed: (message: string) => setUiError(t('models.docLinkRegisterFailed', { message })),
})

const handleCanvasContextChange = (ctx: {
  renderer: DiagramRenderer | null
  interactionManager: InteractionManager | null
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
    const diagramId = diagram.id
    const instanceId = targetNodeInstance.id
    const before = clonePlainDeep({
      width: targetNodeInstance.width,
      height: targetNodeInstance.height,
      attrs: targetNodeInstance.attrs,
    })
    applyDiagramStyleToNodeInstance(targetNodeInstance, style)
    markDiagramDirty(diagram.id)
    const after = clonePlainDeep({
      width: targetNodeInstance.width,
      height: targetNodeInstance.height,
      attrs: targetNodeInstance.attrs,
    })
    recordDiagramHistory(`style:node:${instanceId}`, {
      execute: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, after),
      undo: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, before),
    })
    return
  }

  if (targetEdgeInstance) {
    const diagramId = diagram.id
    const edgeId = targetEdgeInstance.id
    const beforeAttrs = clonePlainDeep(targetEdgeInstance.attrs)
    if (!targetEdgeInstance.attrs) targetEdgeInstance.attrs = {}
    let bound: DiagramStyle | undefined
    if (targetEdgeInstance.modelLinkId) {
      const modelLink = state.value.links.find(item => item.id === targetEdgeInstance.modelLinkId)
      const notationId = activeNotationId.value
      if (modelLink && notationId) {
        const relationId = modelLink.parsedAttrs.notationRelations[notationId]?.relationId
        const relation = relationId
          ? state.value.relations.find(item => item.id === relationId)
          : null
        if (relation) {
          bound = parseEntityAttrs(relation.attrs ?? null).diagramStyle
        }
      }
    }
    const previousInstance =
      targetEdgeInstance.attrs.diagramStyle &&
      typeof targetEdgeInstance.attrs.diagramStyle === 'object'
        ? (targetEdgeInstance.attrs.diagramStyle as DiagramStyle)
        : undefined
    const previousEffective = mergeEffectiveDiagramStyle(bound, previousInstance) ?? {}
    const currentType = (previousEffective.edgeType as string | undefined) ?? 'bezier'
    const newType = (style as Record<string, unknown>).edgeType as string | undefined
    const fromPolyline = currentType === 'polyline' || currentType === 'editable-polyline'
    const toNonPolyline = newType === 'bezier' || newType === 'straight'
    // Merge relation defaults under panel style so a partial/stale panel payload cannot
    // drop label fields that only existed on the notation relation.
    targetEdgeInstance.attrs.diagramStyle = {
      ...previousEffective,
      ...JSON.parse(JSON.stringify(style)),
    }
    if (fromPolyline && toNonPolyline && targetEdgeInstance.attrs.controlPoints) {
      delete targetEdgeInstance.attrs.controlPoints
    }
    markDiagramDirty(diagram.id)
    const afterAttrs = clonePlainDeep(targetEdgeInstance.attrs)
    recordDiagramHistory(`style:edge:${edgeId}`, {
      execute: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, afterAttrs),
      undo: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, beforeAttrs),
    })
  }
}

const selectedElementDiagramStyle = computed((): DiagramStyle | undefined => {
  const diagram = activeDiagram.value
  const selectedElementId = selectedCanvasElementId.value
  if (!diagram || !selectedElementId) return undefined

  if (selectedElementId.startsWith('instance-')) {
    const instanceId = selectedElementId.slice('instance-'.length)
    const instance = diagram.parsedAttrs.instances.nodes.find(item => item.id === instanceId)
    if (!instance) return undefined

    if (instance.attrs?.diagramStyle && typeof instance.attrs.diagramStyle === 'object') {
      return withInstanceDimensions(instance.attrs.diagramStyle as DiagramStyle, instance)
    }
    const notationId = activeNotationId.value
    if (!notationId) return withInstanceDimensions(undefined, instance)
    const modelNode = state.value.nodes.find(item => item.id === instance.modelNodeId)
    const componentId = resolveInstanceComponentId({
      instance,
      node: modelNode ?? null,
      notationId,
    })
    if (!componentId) return withInstanceDimensions(undefined, instance)
    const component = state.value.components.find(item => item.id === componentId)
    if (!component) return withInstanceDimensions(undefined, instance)
    return withInstanceDimensions(parseEntityAttrs(component.attrs ?? null).diagramStyle, instance)
  }

  if (selectedElementId.startsWith('edge-')) {
    const edgeId = selectedElementId.slice('edge-'.length)
    const edge = diagram.parsedAttrs.instances.edges.find(item => item.id === edgeId)
    if (!edge) return undefined

    let bound: DiagramStyle | undefined
    if (edge.modelLinkId) {
      const modelLink = state.value.links.find(item => item.id === edge.modelLinkId)
      const notationId = activeNotationId.value
      if (modelLink && notationId) {
        const relationId = modelLink.parsedAttrs.notationRelations[notationId]?.relationId
        const relation = relationId
          ? state.value.relations.find(item => item.id === relationId)
          : null
        if (relation) {
          bound = parseEntityAttrs(relation.attrs ?? null).diagramStyle
        }
      }
    }

    const instanceStyle =
      edge.attrs?.diagramStyle && typeof edge.attrs.diagramStyle === 'object'
        ? (edge.attrs.diagramStyle as DiagramStyle)
        : undefined
    return mergeEffectiveDiagramStyle(bound, instanceStyle)
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
    if (!edge?.modelLinkId) return false
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
    const componentId = resolveInstanceComponentId({
      instance,
      node: modelNode ?? null,
      notationId,
    })
    const component = componentId
      ? state.value.components.find(
          item => item.id === componentId && item.notationId === notationId
        )
      : null

    if (!component) {
      setUiError(t('models.figureComponentNotFound'))
      return
    }

    const before = clonePlainDeep({
      width: instance.width,
      height: instance.height,
      attrs: instance.attrs,
    })
    if (instance.attrs && typeof instance.attrs === 'object') {
      delete instance.attrs.diagramStyle
      if (Object.keys(instance.attrs).length === 0) delete instance.attrs
    }
    markDiagramDirty(diagram.id)
    const after = clonePlainDeep({
      width: instance.width,
      height: instance.height,
      attrs: instance.attrs,
    })
    const diagramId = diagram.id
    commitDiagramHistory({
      execute: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, after),
      undo: () => applyNodeInstanceStyleSnapshot(diagramId, instanceId, before),
    })
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
      setUiError(t('models.edgeRelationNotFound'))
      return
    }

    const beforeAttrs = clonePlainDeep(edge.attrs)
    if (edge.attrs && typeof edge.attrs === 'object') {
      delete edge.attrs.diagramStyle
      if (Object.keys(edge.attrs).length === 0) delete edge.attrs
    }
    markDiagramDirty(diagram.id)
    const afterAttrs = clonePlainDeep(edge.attrs)
    const diagramId = diagram.id
    commitDiagramHistory({
      execute: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, afterAttrs),
      undo: () => applyEdgeInstanceStyleSnapshot(diagramId, edgeId, beforeAttrs),
    })
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

function openDiagramCopyWizard(diagramId: string): void {
  sourceDiagramIdForCopy.value = diagramId
  showDiagramCopyWizard.value = true
}

function handleDiagramCopyCommitted(payload: { targetModelId: string; diagramId: string }): void {
  showDiagramCopyWizard.value = false
  sourceDiagramIdForCopy.value = ''
  if (diagramCopySuccessTimer) clearTimeout(diagramCopySuccessTimer)
  diagramCopySuccess.value = true
  diagramCopySuccessTimer = setTimeout(() => {
    diagramCopySuccess.value = false
    diagramCopySuccessTimer = null
  }, 5000)
  void router.push({
    name: 'model-editor',
    params: { id: payload.targetModelId },
    query: { diagramId: payload.diagramId },
  })
}

const router = useRouter()
const route = useRoute()
const routeModelId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const routeDiagramId = computed(() =>
  typeof route.query.diagramId === 'string' ? route.query.diagramId : ''
)
const applyRouteDiagramSelection = (diagramId: string): void => {
  if (!diagramId) return
  const target = state.value.diagrams.find(
    diagram => diagram.id === diagramId && !diagram._isDeleted
  )
  if (!target) return
  applyDiagramSelection(target.id)
}
const routeTreeFocusLoading = ref(false)
const routeTreeFocusError = ref<string | null>(null)
const focusRouteDiagramInTree = async (
  diagramId: string,
  isCurrent: () => boolean
): Promise<void> => {
  if (!isCurrent()) return
  routeTreeFocusLoading.value = false
  routeTreeFocusError.value = null
  if (!diagramId) return
  const target = state.value.diagrams.find(
    diagram => diagram.id === diagramId && !diagram._isDeleted
  )
  if (!target) return
  const needsTreePath = !!target.nodeId && target.nodeId !== treeRootNodeId.value
  routeTreeFocusLoading.value = true
  routeTreeFocusError.value = null
  try {
    await focusRouteDiagramTree({
      diagramId,
      nodeId: target.nodeId,
      treeRootNodeId: treeRootNodeId.value,
      selectHit: lazyTreeSearch.selectHit,
      waitForRender: nextTick,
      expandPath: path => treePanelRef.value?.expandPath?.(path),
      focusDiagram: (id, guard) => treePanelRef.value?.focusDiagram?.(id, guard),
      isCurrent,
    })
  } finally {
    if (isCurrent()) {
      routeTreeFocusLoading.value = false
      routeTreeFocusError.value = needsTreePath ? lazyTreeSearch.selectionError.value : null
    }
  }
}
const { applyCurrentDiagramNavigation, retryCurrentDiagramTreeFocus } =
  useModelEditorRouteNavigation({
    modelId: routeModelId,
    diagramId: routeDiagramId,
    loadModel: async () => loadModel(),
    applyRouteDiagramSelection,
    focusRouteDiagramInTree,
    afterModelLoad: () => {
      scheduleFetchDocumentsFromApi()
      scheduleSyncDefaultsOnLoad()
      void whenBackgroundReady().then(() => fetchWikiDocuments())
    },
  })
const showLeaveDialog = ref(false)
const allowLeave = ref(false)
let pendingRoute: RouteLocationRaw | null = null

const confirmLeave = () => {
  showLeaveDialog.value = false
  allowLeave.value = true
  if (pendingRoute) {
    const next = pendingRoute
    pendingRoute = null
    void router.push(next)
  }
}
const cancelLeave = () => {
  showLeaveDialog.value = false
  pendingRoute = null
}

/** Админ снял блокировку — выкинуть из диаграммы без сохранения */
watch(
  () => diagramEditLock.lockForceRevoked.value,
  revoked => {
    if (!revoked) return
    dismissForceRevoked()
    alert(t('models.diagramLockForceRevoked'))
    allowLeave.value = true
    router.push({ name: 'models' })
  }
)

onBeforeRouteLeave(to => {
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

const onHistoryShortcutCapture = (event: KeyboardEvent) => {
  if (shouldSkipDeleteHotkey(event)) return
  const isMod = event.ctrlKey || event.metaKey
  if (!isMod) return
  const key = event.code.startsWith('Key')
    ? event.code.slice(3).toLowerCase()
    : event.key.toLowerCase()
  const isUndo = key === 'z' && !event.shiftKey
  const isRedo = key === 'y' || (key === 'z' && event.shiftKey)
  if (!isUndo && !isRedo) return
  diagramHistoryBatcher.flush()
}

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    event.preventDefault()
  }
}

onMounted(async () => {
  await loadModel()
  applyCurrentDiagramNavigation()
  scheduleFetchDocumentsFromApi()
  scheduleSyncDefaultsOnLoad()
  // Wiki catalog is not needed for the tree/canvas — load after heavy payloads settle.
  void whenBackgroundReady().then(() => fetchWikiDocuments())
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onDeleteKeydown)
  window.addEventListener('keydown', onHistoryShortcutCapture, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onDeleteKeydown)
  window.removeEventListener('keydown', onHistoryShortcutCapture, true)
  if (documentsFetchTimer) {
    clearTimeout(documentsFetchTimer)
    documentsFetchTimer = null
  }
  documentsFetchSeq += 1
  if (uiErrorTimer) {
    clearTimeout(uiErrorTimer)
    uiErrorTimer = null
  }
  if (diagramCopySuccessTimer) {
    clearTimeout(diagramCopySuccessTimer)
    diagramCopySuccessTimer = null
  }
})
</script>

<template>
  <MainLayout>
    <template #header>
      <ModelEditorHeader
        hide-toolbar
        :has-unsaved-changes="hasUnsavedChanges"
        :can-save="!isSaving && !isDiagramReadOnly"
        :can-edit-model="canInspectDiagramJson"
        :show-model-wiki-button="showModelWikiHeaderButton"
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
        :layout-busy="layoutBusy"
        :baseline-creating="baselineCreating"
        :baseline-error="baselineError"
        :is-admin="canInspectDiagramJson"
        :show-compare-button="!!model?.id"
        :model-id="model?.id ?? null"
        @action="handleToolbarAction"
        @rename-model="handleRenameModel"
        @share="showShareModal = true"
        @compare="handleOpenCompareModal"
        @open-relation-matrix="handleOpenRelationMatrix"
        @open-notation="handleOpenNotationEditor"
        @select-diagram-version="selectedDiagramId = $event"
        @create-baseline="handleCreateBaseline"
      />
    </template>
    <template #default>
      <div
        v-if="catalogLoadWarning"
        class="background-load-warnings"
        role="status"
        aria-live="polite"
      >
        <div v-if="catalogLoadWarning" class="background-load-warnings__item">
          <span>{{ catalogLoadWarning }}</span>
          <button type="button" class="btn btn--secondary" @click="retryCatalogLoad">
            {{ t('common.retry') }}
          </button>
        </div>
      </div>
      <ModelMainPanelLayout>
        <template #left>
          <ModelTreePalettePanel
            ref="treePanelRef"
            :nodes="treeVisibleNodes"
            :diagrams="state.diagrams"
            :node-types="state.nodeTypes"
            :tree-root-node-id="treeRootNodeId"
            :selected-node-id="selectedNodeId"
            :selected-diagram-id="selectedDiagramId"
            :diagram-locks="diagramLocksForTree"
            :current-user-id="currentUser?.id ?? null"
            :model-name="model?.name"
            :sync-selection-enabled="selectionSyncEnabled"
            :navigation-only-mode="diagramNavigationOnlyMode"
            :loaded-children-for="loadedChildrenFor"
            :children-pages="childrenPages"
            :children-loading="partialStore.childrenLoading.value"
            :children-errors="partialStore.childrenErrors.value"
            :search-hits="lazyTreeSearch.hits.value"
            :search-loading="lazyTreeSearch.loading.value || lazyTreeSearch.selectionLoading.value"
            :search-error="lazyTreeSearch.error.value || lazyTreeSearch.selectionError.value"
            :tree-focus-loading="routeTreeFocusLoading"
            :tree-focus-error="routeTreeFocusError"
            @select-node="handleTreeSelectNode"
            @search-query-change="lazyTreeSearchQuery = $event"
            @select-search-hit="handleTreeSearchHit"
            @retry-search="
              lazyTreeSearch.selectionError.value
                ? retryTreeSearchSelection()
                : lazyTreeSearch.retry()
            "
            @retry-tree-focus="retryCurrentDiagramTreeFocus"
            @load-children="partialStore.loadChildren"
            @load-next-children-page="partialStore.loadNextChildrenPage"
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
            @copy-diagram-to-model="openDiagramCopyWizard"
          />
        </template>

        <div
          class="model-canvas-area"
          :class="{
            'model-canvas-area--has-newer-banner':
              newerNotationVersions.length > 0 &&
              !!activeDiagram &&
              diagramScopeReady &&
              !isDiagramReadOnly,
          }"
        >
          <template v-if="activeDiagram && diagramScopeReady && !isDiagramReadOnly">
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
            v-if="
              newerNotationVersions.length > 0 &&
              activeDiagram &&
              diagramScopeReady &&
              !isDiagramReadOnly
            "
            class="model-canvas-area__newer-notation-banner"
          >
            <span class="material-symbols-outlined model-canvas-area__newer-notation-icon"
              >info</span
            >
            <span class="model-canvas-area__newer-notation-text">
              {{
                t('diagram.newerNotationVersionsBanner', {
                  name: newerNotationVersions[0]?.name ?? '',
                  version: newerNotationVersions[0]?.version ?? '',
                })
              }}
            </span>
            <button
              type="button"
              class="btn btn--primary btn--sm model-canvas-area__newer-notation-action"
              @click="openMigrateModal()"
            >
              {{ t('diagram.migrateNotationAction') }}
            </button>
          </div>
          <div class="model-canvas-area__toolbar">
            <ModelEditorHeader
              canvas-mode
              :has-unsaved-changes="hasUnsavedChanges"
              :can-save="!isSaving && !isDiagramReadOnly"
              :can-edit-model="canInspectDiagramJson"
              :show-model-wiki-button="showModelWikiHeaderButton"
              :show-diagram-wiki-button="showDiagramWikiToolbarButton"
              :model-name="model?.name"
              :model-version="model?.version"
              :has-active-diagram="!!activeDiagram && diagramScopeReady"
              :can-undo="canUndo"
              :can-redo="canRedo"
              :can-share="canShareModel"
              :navigation-only-mode="diagramNavigationOnlyMode"
              :is-diagram-read-only="isDiagramReadOnly"
              :layout-busy="layoutBusy"
              :diagram-lock-blocked-by-other="diagramLockBlockedByOther"
              :diagram-lock-holder-display="diagramLockHolderName"
              :diagram-lock-server-newer="diagramLockServerNewerWhileBlocked"
              :diagram-spectators="diagramSpectators"
              :is-admin="canInspectDiagramJson"
              :can-open-notation="canOpenActiveDiagramNotation"
              @action="handleToolbarAction"
              @rename-model="handleRenameModel"
              @share="showShareModal = true"
              @open-notation="handleOpenNotationEditor"
              @diagram-lock-reload="handleReloadModelForDiagramLock"
            />
          </div>
          <ModelDiagramCanvas
            v-if="!activeDiagram || diagramScopeReady"
            :key="activeDiagram?.id ?? 'none'"
            ref="diagramCanvasRef"
            :active-diagram="activeDiagram"
            :read-only="isDiagramReadOnly"
            :diagram-dirty="Boolean(activeDiagram?._isDirty)"
            :navigation-only-mode="diagramNavigationOnlyMode"
            :nodes="state.nodes"
            :links="state.links"
            :relations="state.relations"
            :components="state.components"
            :node-types="state.nodeTypes"
            :link-types="state.linkTypes"
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
            :remote-editor-pointer="remoteEditorPointer"
            :diagram-live-broadcast-enabled="isDiagramLockHolder"
            :on-remote-pointer-track="onCanvasMouseMoveForPointer"
            :on-remote-pointer-leave="onCanvasMouseLeaveForPointer"
            :selected-model-node-ids="selectedModelNodeIds"
            :selected-model-link-id="selectedModelLinkId"
            :selected-edge-instance-id="selectedEdgeInstanceId"
            :selected-instance-ids="selectedInstanceIds"
            :connection-validator="canConnect"
            @update-diagram="setDiagramAttrs"
            @flush-diagram-history="diagramHistoryBatcher.flush"
            @select-nodes="handleCanvasSelectNodes"
            @select-instance-ids="ids => (selectedInstanceIds = ids)"
            @select-edge-instance-id="id => (selectedEdgeInstanceId = id)"
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
            @create-container="createDiagramContainer"
            @add-existing-node="addExistingNodeToDiagram"
            @place-existing-model-link="placeTraceLinkOnDiagram"
            @connect-nodes="startConnectNodes"
            @connect-node-to-edge="connectNodeToEdge"
            @request-auto-link="handleRequestAutoLink"
            @request-boundary-auto-link="handleRequestBoundaryAutoLink"
            @request-boundary-detach="handleRequestBoundaryDetach"
            @request-boundary-rebind="handleRequestBoundaryRebind"
            @reconnect-edge="handleReconnectEdge"
            @reconnect-edge-to-host="reconnectEdgeToHost"
            @find-in-tree="handleFindInTree"
            @node-label-change="handleNodeLabelChange"
            @request-delete-node-from-diagram="handleRequestDeleteNodeFromDiagram"
            @request-edit-note="openNoteEditor"
            @request-delete-link="handleRequestDeleteLink"
            @select-canvas-element-id="selectedCanvasElementId = $event"
            @canvas-context-change="handleCanvasContextChange"
            @live-collaboration-gesture="onLiveCollaborationGesture"
            @palette-visible-change="paletteVisible = $event"
            @open-diagram="selectDiagram"
            @open-document="handleOpenDocumentFromBadge"
          />
          <ModelDiagramScopeStatus
            v-else
            :loading="!diagramScopeError"
            :loading-text="diagramScopeLoadingText"
            :error="diagramScopeError?.message"
            :retry-text="t('common.retry')"
            @retry="retryDiagramScope"
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
            <div
              v-if="activeRightTab === 'properties' && selectedNodeLoading"
              class="selection-scope-status"
              role="status"
              aria-live="polite"
            >
              {{ t('models.selectedNodeLoading') }}
            </div>
            <div
              v-else-if="activeRightTab === 'properties' && selectedNodeError"
              class="selection-scope-status selection-scope-status--error"
              role="status"
              aria-live="polite"
            >
              <span>{{ selectedNodeError }}</span>
              <button type="button" class="btn btn--secondary" @click="retrySelectedNode">
                {{ t('common.retry') }}
              </button>
            </div>
            <ModelPropertiesPanel
              v-else-if="activeRightTab === 'properties' && canShowPropertiesTab"
              :active-notation-id="activeNotationId"
              :selected-node="selectedNode"
              :selected-link="selectedLink"
              :node-custom-properties="nodeCustomProperties"
              :node-type-custom-properties="nodeTypeCustomProperties"
              :node-type-scoped-values="nodeTypeScopedValues"
              :link-type-custom-properties="linkTypeCustomProperties"
              :link-type-scoped-values="linkTypeScopedValues"
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
              @bind-node-component="handleBindNodeComponent"
              @bind-link-relation="
                id => selectedLink && !isDiagramReadOnly && bindLinkRelationFromPanel(id)
              "
              @set-node-type-property-value="
                (k, v) => !isDiagramReadOnly && setNodeTypePropertyValue(k, v)
              "
              @set-link-type-property-value="
                (k, v) => !isDiagramReadOnly && setLinkTypePropertyValue(k, v)
              "
              @set-node-scoped-value="(k, v) => !isDiagramReadOnly && setNodeScopedValue(k, v)"
              @set-link-scoped-value="(k, v) => !isDiagramReadOnly && setLinkScopedValue(k, v)"
              @create-document-for-property="
                (name, scope) => !isDiagramReadOnly && handleCreateDocumentForProperty(name, scope)
              "
              :on-open-node-document="handleOpenNodeDoc"
            />
            <ModelTraceabilityPanel
              v-if="
                activeRightTab === 'traceability' &&
                canShowTraceabilityTab &&
                selectedNode &&
                !detachedModelLinks.loading.value &&
                !detachedModelLinks.error.value &&
                !detachedModelLinks.stale.value
              "
              :selected-node="selectedNode"
              :nodes="traceabilityNodes"
              :links="traceabilityLinks"
              :diagrams="state.diagrams.filter(diagram => !diagram._isDeleted)"
              :link-types="state.linkTypes"
              :active-diagram="activeDiagram"
              :active-notation-id="activeNotationId"
              :is-diagram-read-only="isDiagramReadOnly"
              :relations="state.relations"
              :can-connect="canConnect"
              :is-diagram-only-edge-model-link-id="isDiagramOnlyEdgeModelLinkId"
              @open-diagram="selectDiagram"
              @focus-node="handleTraceabilityFocusNode"
            />
            <div
              v-else-if="
                activeRightTab === 'traceability' &&
                canShowTraceabilityTab &&
                detachedModelLinks.stale.value
              "
              class="background-load-warnings__item"
              role="status"
            >
              <span>{{ t('models.detachedLinksStale') }}</span>
              <button
                type="button"
                class="btn btn--secondary"
                @click="detachedModelLinks.load()"
              >
                {{ t('models.detachedLinksRefresh') }}
              </button>
            </div>
            <div
              v-else-if="
                activeRightTab === 'traceability' &&
                canShowTraceabilityTab &&
                detachedModelLinks.loading.value
              "
              class="background-load-warnings__item"
              role="status"
            >
              <UiIcon name="sync" class="spin" />
              <span>{{ t('common.loading') }}</span>
            </div>
            <div
              v-else-if="
                activeRightTab === 'traceability' &&
                canShowTraceabilityTab &&
                detachedModelLinks.error.value
              "
              class="background-load-warnings__item"
              role="status"
            >
              <span>{{ detachedModelLinks.error.value }}</span>
              <button
                type="button"
                class="btn btn--secondary"
                @click="detachedModelLinks.refresh()"
              >
                {{ t('common.retry') }}
              </button>
            </div>
            <NodeStylePanel
              v-if="activeRightTab === 'style' && canShowStyleTab"
              :selected-element-id="selectedCanvasElementId"
              :interaction-manager="diagramInteractionManager"
              :renderer="diagramRenderer"
              :current-diagram-style="selectedElementDiagramStyle"
              :can-restore-style="hasDiagramStyleOverride"
              @style-change="handleDiagramElementStyleChange"
              @restore-style="restoreStyleFromNotation"
            />
            <CompositeStylePanel
              v-if="activeRightTab === 'composite-style' && canShowStyleTab"
              :current-diagram-style="selectedElementDiagramStyle"
              :component-properties="nodeCustomProperties"
              :node-type-properties="nodeTypeCustomProperties"
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

  <SaveToast
    :saving="isSaving"
    :success="saveSuccess || diagramCopySuccess"
    :success-message="diagramCopySuccess ? t('models.diagramCopy.success') : null"
    :error="saveError || uiError"
    :progress="saveProgress"
  />
  <RemoteCascadeConflictNotice
    v-if="remoteCascadeConflictCount > 0"
    :count="remoteCascadeConflictCount"
    @discard="discardRemoteCascadeConflictLinks"
    @reload="reloadAfterRemoteCascadeConflict"
  />
  <GranularSyncErrorNotice
    v-if="firstGranularSyncFailure"
    :entity="firstGranularSyncFailure.entity"
    :message="firstGranularSyncFailure.message"
    @retry="firstGranularSyncFailure.retry"
  />
  <GranularSyncErrorNotice
    v-if="showImportWizard && detachedModelLinks.stale.value"
    entity="links"
    :message="t('models.oefDetachedLinksStale')"
    @retry="detachedModelLinks.load"
  />

  <DiagramCopyWizard
    :open="showDiagramCopyWizard"
    :source-model-id="model?.id ?? ''"
    :source-diagram-id="sourceDiagramIdForCopy"
    :source-notation-id="
      state.diagrams.find(d => d.id === sourceDiagramIdForCopy)?.notationId ?? null
    "
    @close="showDiagramCopyWizard = false"
    @committed="handleDiagramCopyCommitted"
  />

  <BatchSaveConflictModal
    v-if="batchSaveConflict && batchSaveConflict.length > 0"
    :conflict-count="batchSaveConflict.length"
    :rows="batchSaveConflictRows"
    :cross-link-warnings="batchConflictCrossLinkWarningRows"
    @close="dismissBatchSaveConflict"
    @reload="handleBatchConflictReload"
    @overwrite="handleBatchConflictOverwrite"
    @dismiss="dismissBatchSaveConflict"
  />

  <LayoutPreviewModal
    v-if="layoutPreviewBefore"
    :open="showLayoutPreviewModal"
    :before="layoutPreviewBefore"
    :busy="layoutBusy"
    @close="handleLayoutPreviewClose"
    @apply="handleLayoutPreviewApply"
    @error="msg => setUiError(msg || t('toolbar.autoLayoutFailed'))"
  />

  <BaseModal
    v-if="showCreateNodeModal"
    :title="createNodeModalTitle"
    max-width="440px"
    @close="closeCreateNodeModal"
  >
    <div class="form-grid">
      <label>
        <span>{{ t('common.name') }}</span>
        <input
          v-model="newNodeName"
          class="form-input"
          :disabled="createNodePending"
          :placeholder="
            createNodeModal.kind === 'folder'
              ? t('models.newFolderPlaceholder')
              : t('models.newNodePlaceholder')
          "
          @keydown.enter.prevent="canCreateNodeFromModal && !createNodePending && createNode()"
        />
      </label>
      <label v-if="createNodeModal.kind === 'node'">
        <span>{{ t('models.nodeTypeLabel') }}</span>
        <SearchableSelect
          v-model="newNodeTypeId"
          :options="
            nonDirectoryNodeTypes.map(typeItem => ({ id: typeItem.id, label: typeItem.name }))
          "
          :placeholder="t('models.selectType')"
          :search-placeholder="t('models.typeSearchPlaceholder')"
          :empty-text="t('common.nothingFound')"
          :disabled="createNodePending"
        />
      </label>
      <div v-else class="form-hint">{{ t('models.directoryTypeHint') }}</div>
    </div>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        :disabled="createNodePending"
        @click="closeCreateNodeModal"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!canCreateNodeFromModal || createNodePending"
        @click="createNode"
      >
        {{ t('common.create') }}
      </button>
    </template>
  </BaseModal>

  <BaseModal
    v-if="showMigrateModal && migrateTarget"
    :title="t('diagram.migrateNotationTitle')"
    max-width="520px"
    @close="closeMigrateModal"
  >
    <p class="leave-text">
      {{
        t('diagram.migrateNotationConfirm', {
          name: migrateTarget.name,
          version: migrateTarget.version,
        })
      }}
    </p>
    <p class="leave-text">{{ t('diagram.migrateNotationHint') }}</p>
    <div
      v-if="migratePreviewUnmapped.components.length || migratePreviewUnmapped.relations.length"
      class="leave-text leave-text--warning"
    >
      <p v-if="migratePreviewUnmapped.components.length">
        {{
          t('diagram.migrateNotationUnmappedComponents', {
            list: migratePreviewUnmapped.components.join(', '),
          })
        }}
      </p>
      <p v-if="migratePreviewUnmapped.relations.length">
        {{
          t('diagram.migrateNotationUnmappedRelations', {
            list: migratePreviewUnmapped.relations.join(', '),
          })
        }}
      </p>
    </div>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        :disabled="isMigrating"
        @click="closeMigrateModal"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="isMigrating"
        @click="confirmMigrateNotation"
      >
        {{
          isMigrating ? t('diagram.migrateNotationInProgress') : t('diagram.migrateNotationAction')
        }}
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
          class="form-textarea form-textarea--lg"
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
          class="form-input"
          :placeholder="t('models.newDiagramPlaceholder')"
        />
      </label>
      <label>
        <span>{{ t('common.version') }}</span>
        <input v-model="newDiagramVersion" class="form-input" placeholder="1.0.0" />
      </label>
      <label>
        <span>{{ t('models.notationLabel') }}</span>
        <select v-model="newDiagramNotationId" class="form-select">
          <option v-for="notation in state.notations" :key="notation.id" :value="notation.id">
            {{ notation.name }} ({{ notation.version }})
          </option>
        </select>
      </label>
      <div v-if="hasDiagramNameVersionConflict" class="form-error">
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
    @close="handleComponentChoiceModalClose"
  >
    <div class="choice-list">
      <button
        v-for="option in componentChoiceOptions"
        :key="option.id"
        type="button"
        class="choice-item"
        @click="finalizeComponentChoiceForDiagram(option.id)"
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

  <LinkReuseModal
    v-if="showReuseLinkModal"
    :options="reuseLinkModalOptions"
    @close="showReuseLinkModal = false"
    @select="handleSelectExistingLink"
    @create-new="handleCreateNewLinkFromReuseModal"
  />

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

  <ConfirmModal
    v-if="showNodeDeleteModal"
    :title="t('models.deleteNodeTitle')"
    :message="nodeDeleteConfirmMessage"
    danger
    @close="cancelNodeDelete"
    @confirm="confirmNodeDelete"
  />

  <ConfirmModal
    v-if="showDiagramDeleteModal"
    :title="t('models.deleteDiagramTitle')"
    :message="
      t('models.deleteDiagramConfirm', { name: pendingDeleteDiagramName || t('common.unnamed') })
    "
    danger
    @close="cancelDiagramDelete"
    @confirm="confirmDiagramDelete"
  />

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
        v-if="
          pendingDeleteLinkId &&
          !isDiagramOnlyEdgeModelLinkId(pendingDeleteLinkId) &&
          !isUntypedModelLinkId(pendingDeleteLinkId)
        "
        type="button"
        class="btn btn--danger"
        @click="removeLinkFromModel"
      >
        {{ t('models.removeLinkFromModel') }}
      </button>
    </template>
  </BaseModal>

  <ConfirmModal
    v-if="showLeaveDialog"
    :title="t('models.unsavedChangesTitle')"
    :message="t('models.leaveUnsavedText')"
    :cancel-label="t('models.stay')"
    :confirm-label="t('models.leave')"
    danger
    max-width="400px"
    @close="cancelLeave"
    @confirm="confirmLeave"
  />

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

  <ValidationScriptsRunModal
    v-if="showValidationScriptsModal && validationRunPayload"
    :snapshot="validationRunPayload.snapshot"
    :open-diagram-id="validationRunPayload.openDiagramId"
    @close="showValidationScriptsModal = false"
    @select-issue="handleValidationIssueSelect"
  />

  <DiagramImageShareModal
    v-if="showDiagramImageShareModal"
    :visible="true"
    :diagram-id="activeDiagram?.id ?? null"
    :diagram-name="activeDiagram?.name ?? ''"
    :model-id="model?.id ?? null"
    :on-upload-preview="uploadDiagramPreview"
    @close="showDiagramImageShareModal = false"
  />

  <ModelImportWizard
    v-if="showImportWizard"
    :visible="showImportWizard"
    :model-id="state.modelId ?? ''"
    :notations="state.notations"
    :node-types="state.nodeTypes"
    :link-types="state.linkTypes"
    :components="state.components"
    :relations="state.relations"
    :relation-rules="state.relationRules"
    :existing-nodes="state.nodes"
    :existing-links="detachedConsumerLinks"
    :existing-diagrams="state.diagrams"
    :import-busy="isImportingOef"
    :import-progress="oefImportProgress"
    :ensure-notation-catalog="ensureImportNotationCatalog"
    :ensure-diagram-attrs="ensureImportDiagramAttrs"
    @close="showImportWizard = false"
    @submit="handleOefImportSubmit"
  />

  <BaseModal
    v-if="oefImportReport"
    :title="t('models.oefImportReportTitle')"
    max-width="520px"
    @close="oefImportReport = null"
  >
    <p class="leave-text">{{ t('models.oefImportReportSummary') }}</p>
    <ul class="model-import-report">
      <li>{{ t('models.oefImportStatNodes', { count: oefImportReport.nodes }) }}</li>
      <li>{{ t('models.oefImportStatLinks', { count: oefImportReport.links }) }}</li>
      <li>{{ t('models.oefImportStatDiagrams', { count: oefImportReport.diagrams }) }}</li>
      <li v-if="oefImportReport.nodesReused > 0">
        {{ t('models.oefImportReportReusedNodes', { count: oefImportReport.nodesReused }) }}
      </li>
      <li v-if="oefImportReport.nodesUpdated > 0">
        {{ t('models.oefImportReportUpdatedNodes', { count: oefImportReport.nodesUpdated }) }}
      </li>
      <li v-if="oefImportReport.linksReused > 0">
        {{ t('models.oefImportReportReusedLinks', { count: oefImportReport.linksReused }) }}
      </li>
      <li v-if="oefImportReport.linksUpdated > 0">
        {{ t('models.oefImportReportUpdatedLinks', { count: oefImportReport.linksUpdated }) }}
      </li>
      <li>
        {{
          t('models.oefImportReportDiagramNodeInstances', {
            count: oefImportReport.diagramNodeInstances,
          })
        }}
      </li>
      <li>
        {{
          t('models.oefImportReportDiagramEdgeInstances', {
            count: oefImportReport.diagramConnectionInstances,
          })
        }}
      </li>
    </ul>
    <p v-if="oefImportReport.warningsCount > 0" class="leave-text leave-text--warning">
      {{ t('models.oefImportCompletedWithWarnings', { count: oefImportReport.warningsCount }) }}
    </p>
    <div v-if="oefImportReport.warningGroups.length > 0" class="model-import-report__warnings">
      <p class="leave-text">{{ t('models.oefImportReportWarningsByReason') }}</p>
      <ul class="model-import-report model-import-report--warnings model-import-report--scrollable">
        <li v-for="item in oefImportReport.warningGroups" :key="item.code">
          {{ oefWarningLabel(item.code) }}: {{ item.count }}
        </li>
      </ul>
    </div>
    <div v-if="oefImportReport.missingRequired.total > 0" class="model-import-report__warnings">
      <p class="leave-text leave-text--warning">
        {{
          t('models.oefImportReportMissingRequiredTitle', {
            count: oefImportReport.missingRequired.total,
          })
        }}
      </p>
      <ul class="model-import-report model-import-report--warnings">
        <li>
          {{
            t('models.oefImportReportMissingRequiredNodeType', {
              count: oefImportReport.missingRequired.nodeType,
            })
          }}
        </li>
        <li>
          {{
            t('models.oefImportReportMissingRequiredComponent', {
              count: oefImportReport.missingRequired.component,
            })
          }}
        </li>
        <li>
          {{
            t('models.oefImportReportMissingRequiredRelation', {
              count: oefImportReport.missingRequired.relation,
            })
          }}
        </li>
      </ul>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="oefImportReport = null">
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>

  <DocumentEditorModal
    v-if="showDocModal"
    :title="docModalTitle"
    :file-id="docModalFileId"
    :read-only="!canInspectDiagramJson"
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

  <ModelEditorLoadProgress
    v-if="loadProgress && !initialSnapshotReady && !errorMessage"
    :progress="loadProgress"
  />
  <div v-if="errorMessage" class="overlay-loading overlay-loading--error">
    <UiIcon name="error" class="overlay-loading__icon" />
    <span>{{ errorMessage }}</span>
  </div>
</template>

<style scoped>
.selection-scope-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.selection-scope-status--error {
  color: var(--danger);
}

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

.overlay-loading--soft {
  background: color-mix(in srgb, var(--base-bg) 72%, transparent);
}

.overlay-loading--error {
  color: var(--danger);
}

.overlay-loading__icon {
  width: 24px;
  height: 24px;
}

.background-load-warnings {
  display: grid;
  gap: 6px;
  padding: 8px 12px;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 8%, var(--surface));
  border-bottom: 1px solid color-mix(in srgb, var(--warning) 35%, var(--border));
}

.background-load-warnings__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
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

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
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

.leave-text {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.leave-text--warning {
  color: var(--warning);
}

.model-import-report {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--text-muted);
  line-height: 1.5;
}

.model-import-report__warnings {
  margin-top: 10px;
}

.model-import-report--warnings {
  margin-top: 6px;
}

.model-import-report--scrollable {
  max-height: min(220px, 40vh);
  overflow-y: auto;
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
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--primary);
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
}

.model-canvas-area__newer-notation-text {
  flex: 1;
  min-width: 0;
}

.model-canvas-area__newer-notation-action {
  flex-shrink: 0;
  pointer-events: auto;
}

.model-canvas-area__newer-notation-icon {
  font-size: 18px;
  flex-shrink: 0;
}

/* Keep overlays below the full-width banner strip */
.model-canvas-area--has-newer-banner .model-canvas-area__toolbar {
  top: 50px;
}

.model-canvas-area--has-newer-banner .canvas-settings-toggle,
.model-canvas-area--has-newer-banner .canvas-settings {
  top: 50px;
}

.model-canvas-area--has-newer-banner :deep(.canvas-palette-toggle),
.model-canvas-area--has-newer-banner :deep(.canvas-palette) {
  top: 50px;
}

.model-canvas-area--has-newer-banner .relation-rules-loading-badge {
  top: 96px;
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
</style>

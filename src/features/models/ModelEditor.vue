<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet, uploadDiagramSvg } from '@/composables/useApi'
import MainLayout from '@/layouts/MainLayout.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ConfirmModal from '@/components/modals/ConfirmModal.vue'
import UnsavedChangesModal from '@/components/modals/UnsavedChangesModal.vue'
import ShareAccessModal from '@/components/modals/ShareAccessModal.vue'
import ChoiceListModal from './components/modals/ChoiceListModal.vue'
import CreateDiagramModal from './components/modals/CreateDiagramModal.vue'
import CreateNodeModal from './components/modals/CreateNodeModal.vue'
import DiagramJsonModal from './components/modals/DiagramJsonModal.vue'
import DiagramTrashConflictModal from './components/modals/DiagramTrashConflictModal.vue'
import LinkDeleteModal from './components/modals/LinkDeleteModal.vue'
import MigrateNotationModal from './components/modals/MigrateNotationModal.vue'
import NoteEditorModal from './components/modals/NoteEditorModal.vue'
import OefImportReportModal from './components/modals/OefImportReportModal.vue'
import DiagramImageShareModal from './components/DiagramImageShareModal.vue'
import { SvgExporter, DiagramRenderer, InteractionManager } from '@ngroznykh/papirus'
import {
  hasEligibleNotationComponent,
  resolveComponentByNodeType,
  resolveInstanceComponentId,
  resolveRelationByLinkType,
  type DiagramAttrs,
} from './modelAttrs'
import type {
  EditorGraphNeighbor,
  EditorLink,
  ModelPartialRequestGuard,
  TraceabilityBranchQuery,
  TraceabilityNeighborRef,
} from './types'
import {
  useModelBatchConflictUi,
  useDiagramScope,
  isDiagramOnlyEdgeModelLinkId,
  useModelDiagramConnections,
  useModelDiagramInstances,
  useModelDiagramExport,
  useModelEditor,
  useDetachedModelSnapshot,
  useModelScopedReload,
  prepareModelSaveValidation,
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
import {
  modelEditorDiagramHref,
  selectedDiagramQueryMatches,
  withSelectedDiagramQuery,
} from './utils/modelEditorDiagramLink'
import { isSaveLockedToolbarEvent } from './utils/modelEditorToolbarLock'
import { useModelEditorEntityDelete } from './composables/useModelEditorEntityDelete'
import { useModelEditorScriptRun } from './composables/useModelEditorScriptRun'
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
import type {
  DiagramReferenceResponse,
  LinkResponse,
  ModelSearchHit,
  NodeResponse,
  RelationResponse,
} from '@/types/api'
import { resolveTraceabilityDiagramReferences as resolveLocalDiagramReferences } from './utils/traceabilityDiagramReferences'
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
import type { LazyTreeSearchSelection } from './composables/useLazyTreeSearch'
import { applyLocalModelDelta } from './utils/applyLocalModelDelta'
import { applyDefaultCustomPropertyValuesFromAttrs } from '@/domain/attrs/customPropertyValues'

const {
  model,
  state,
  isLoading,
  loadProgress,
  initialSnapshotReady,
  catalogReady,
  errorMessage,
  catalogLoadWarning,
  retryCatalogLoad,
  modelDirty,
  modelInitialName,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadModel,
  assignScopedReload,
  discardUnsavedChanges,
  saveChanges,
  startSave,
  finishSave,
  markNodeDirty,
  markLinkDirty,
  markDiagramDirty,
  traceabilityDiagramRevision,
  invalidateTraceabilityDiagrams,
  markModelDirty,
  renameModel,
  createDiagramBaseline,
  ensureNotationRelationsAndRules,
  isNotationRelationsAndRulesLoading,
  whenCatalogReady,
  whenBackgroundReady,
  batchSaveConflict,
  diagramNameVersionConflict,
  resolveDiagramTrashBump,
  resolveDiagramTrashReplace,
  dismissDiagramNameVersionConflict,
  resolveBatchSaveReload,
  resolveBatchSaveOverwrite,
  dismissBatchSaveConflict,
  partialStore,
} = useModelEditor()

const loadedChildrenFor = computed(() => partialStore.store.loadedChildrenFor)
const childrenPages = computed(() => partialStore.store.childrenPages)
const detachedModelId = computed(() => state.value.modelId || null)
const detachedSnapshotOptions = { defaultsCatalog: () => state.value }
const oefDetachedSnapshot = useDetachedModelSnapshot(detachedModelId, detachedSnapshotOptions)
const isPreparingValidation = ref(false)
/** Let Vue paint the saving toast before sync/CPU-heavy pre-save work. */
const yieldToUiPaint = (): Promise<void> =>
  new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
const detachedOverlayReady = computed(
  () =>
    oefDetachedSnapshot.loadedModelId.value === state.value.modelId &&
    !oefDetachedSnapshot.stale.value &&
    oefDetachedSnapshot.snapshot.value !== null
)
const detachedOverlay = computed(() => {
  const remote = oefDetachedSnapshot.snapshot.value
  if (!detachedOverlayReady.value || !remote) {
    return { nodes: [] as typeof state.value.nodes, links: [] as typeof state.value.links }
  }
  return applyLocalModelDelta(remote, state.value)
})
const detachedConsumerLinks = computed(() => detachedOverlay.value.links)
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
  const result = await scopedReload.reloadPartialEditor()
  if (!result.ok && result.error) setUiError(result.error)
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
const scopedReload = useModelScopedReload({
  state,
  model,
  modelDirty,
  modelInitialName,
  selectedDiagramId,
  partialStore,
  reopenDiagramScope: async diagramId => {
    if (selectedDiagramId.value !== diagramId) return
    await diagramScope.reload()
    if (diagramScope.error.value) {
      throw new Error(diagramScope.error.value.message)
    }
  },
  refreshTreeScopes: async scopes => {
    await Promise.all(scopes.map(scope => partialStore.refreshChildrenScope(scope)))
  },
  t: key => t(key),
})
assignScopedReload({
  reload: async () => {
    const result = await scopedReload.reloadPartialEditor()
    if (!result.ok && result.error) setUiError(result.error)
    return result.ok
  },
  invalidate: scopedReload.invalidate,
})
const showShareModal = ref(false)
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

function handleOpenValidation(): void {
  const modelId = state.value.modelId
  if (!modelId) return
  router.push({ name: 'model-validation', params: { id: modelId } })
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
  lockLost,
  retryAcquire,
} = useModelEditorSync({
  modelId: computed(() => state.value.modelId || null),
  state,
  model,
  enabled: modelLiveSyncEnabled,
  isLoading,
  initialSnapshotReady,
  catalogReady,
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
  granularSync: {
    store: partialStore.store,
    publishMaterializedRows: partialStore.publishMaterializedRows,
    refreshVisibleChildrenScope: partialStore.refreshVisibleChildrenScope,
    invalidateChildrenScope: partialStore.invalidateChildrenScope,
    onDetachedSnapshotInvalidated: () => {
      oefDetachedSnapshot.invalidateAfterRemoteSync()
    },
    onDiagramReferencesInvalidated: invalidateTraceabilityDiagrams,
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
  boundedSync: {
    materializedScopes: partialStore.materializedChildrenScopes,
    refreshVisibleChildrenScope: partialStore.refreshVisibleChildrenScope,
    prepareVisibleChildrenScopeRefresh: partialStore.prepareVisibleChildrenScopeRefresh,
    reloadOpenDiagramScope: async (diagramId, signal) => {
      if (selectedDiagramId.value !== diagramId) return
      await diagramScope.reload(signal)
      if (signal.aborted) return
      if (diagramScope.error.value) {
        throw new Error(diagramScope.error.value.message)
      }
    },
    onDetachedSnapshotInvalidated: () => {
      oefDetachedSnapshot.invalidateAfterRemoteSync()
      invalidateTraceabilityDiagrams()
    },
    onSyncError: (_reason, message, retry) => {
      const next = new Map(granularSyncFailures.value)
      next.set('bounded:model', { entity: 'model', message, retry })
      granularSyncFailures.value = next
    },
    onSyncRecovered: () => {
      const next = new Map(granularSyncFailures.value)
      next.delete('bounded:model')
      granularSyncFailures.value = next
    },
  },
  onModelUnavailable: status => {
    errorMessage.value =
      status === 403 ? t('models.modelAccessRevoked') : t('models.modelNoLongerAvailable')
  },
})

async function handleReloadModelForDiagramLock() {
  await reloadModelForDiagramLock(async () => {
    const result = await scopedReload.reloadPartialEditor({ mode: 'lock' })
    if (!result.ok && result.error) setUiError(result.error)
  })
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
  return resolveInstanceComponentId({
    instance,
    node,
    notationId,
    components: state.value.components,
  })
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
  ensureNotationImportCatalog: (notationId, catalogOptions) =>
    ensureNotationImportCatalog({
      modelId: state.value.modelId,
      notationId,
      state,
      ensureNotationRelationsAndRules,
      force: catalogOptions?.force,
    }),
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
const traceabilityLinkTypes = computed(() =>
  state.value.linkTypes.filter(linkType => !isUntypedLinkTypeId(linkType.id))
)
const canDragTraceabilityNodeToDiagram = (
  nodeId: string
): { allowed: boolean; reason: string } => {
  if (!activeDiagram.value) {
    return { allowed: false, reason: 'models.traceabilityDragDisabledNoActiveDiagram' }
  }
  if (isDiagramReadOnly.value) {
    return { allowed: false, reason: 'models.traceabilityDragDisabledReadOnly' }
  }

  const node = state.value.nodes.find(item => item.id === nodeId && !item._isDeleted)
  if (!node) {
    return { allowed: false, reason: 'models.traceabilityDragDisabledMissingComponent' }
  }
  const nodeType = state.value.nodeTypes.find(item => item.id === node.nodeTypeId)
  if ((nodeType?.name ?? '').trim().toLowerCase() === 'directory') {
    return { allowed: true, reason: 'models.traceabilityDragHint' }
  }

  const notationId = activeNotationId.value
  const hasComponent = hasEligibleNotationComponent({
    node,
    notationId,
    components: state.value.components,
  })
  return hasComponent
    ? { allowed: true, reason: 'models.traceabilityDragHint' }
    : { allowed: false, reason: 'models.traceabilityDragDisabledMissingComponent' }
}
const beginTraceabilityRequest = (requestKey: string): ModelPartialRequestGuard =>
  partialStore.store.beginRequest(requestKey)
const isTraceabilityRequestCurrent = (guard: ModelPartialRequestGuard): boolean =>
  partialStore.store.isRequestCurrent(guard)
const mergeTraceabilityEntities = (
  nodes: readonly NodeResponse[],
  links: readonly LinkResponse[],
  guard: ModelPartialRequestGuard
): boolean => partialStore.mergePartialEntities(nodes, links, guard)
const resolveTraceabilityRows = (
  rowIds: readonly TraceabilityNeighborRef[],
  query: TraceabilityBranchQuery
): EditorGraphNeighbor[] => partialStore.store.resolveTraceabilityRows(rowIds, query)
const resolveTraceabilityDiagramReferences = (
  remoteRows: readonly DiagramReferenceResponse[],
  selectedNodeId: string
): DiagramReferenceResponse[] =>
  resolveLocalDiagramReferences(remoteRows, toRaw(state.value).diagrams, selectedNodeId)
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
watch(partialStore.generation, () => {
  granularSyncFailures.value = new Map()
  oefDetachedSnapshot.invalidateAfterRemoteSync()
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
  diagramTrashConflict,
  createDiagramPending,
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
  createDiagramWithBumpedVersion,
  createDiagramReplacingDeleted,
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

const applyLazyTreeSelection = async (
  selection: LazyTreeSearchSelection,
  hit: ModelSearchHit
): Promise<void> => {
  if (selection.nodePath.length === 0 && !selection.diagramId) return

  if (selection.nodePath.length > 0) {
    treePanelRef.value?.expandPath?.(
      hit.kind === 'node' ? selection.nodePath.slice(0, -1) : selection.nodePath
    )
    if (hit.kind === 'node') {
      handleTreeSelectNode(hit.id)
    }
  }

  lazyTreeSearchQuery.value = ''
  await nextTick()

  if (hit.kind === 'node') {
    await treePanelRef.value?.focusNode?.(hit.id)
    return
  }
  if (selection.diagramId) {
    await treePanelRef.value?.focusDiagram?.(selection.diagramId, () => true)
  }
}

let lastTreeSearchHit: ModelSearchHit | null = null

const handleTreeSearchHit = async (hit: ModelSearchHit): Promise<void> => {
  lastTreeSearchHit = hit
  const selection = await lazyTreeSearch.selectHit(hit)
  if (lazyTreeSearch.selectionError.value) return
  await applyLazyTreeSelection(selection, hit)
}

const retryTreeSearchSelection = async (): Promise<void> => {
  const selection = await lazyTreeSearch.retrySelection()
  if (!lastTreeSearchHit || lazyTreeSearch.selectionError.value) return
  await applyLazyTreeSelection(selection, lastTreeSearchHit)
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
  loadModel: async () => {
    const result = await scopedReload.reloadPartialEditor()
    if (!result.ok && result.error) setUiError(result.error)
  },
  getExistingNodes: () => detachedOverlay.value.nodes,
  getExistingLinks: () => detachedOverlay.value.links,
  isExistingLinksReady: () => detachedOverlayReady.value,
})

async function ensureImportNotationCatalog(notationId: string): Promise<void> {
  await ensureNotationImportCatalog({
    modelId: state.value.modelId,
    notationId,
    state,
    ensureNotationRelationsAndRules,
  })
}

async function ensureImportDiagramAttrs(): Promise<void> {
  await ensureAllDiagramAttrsLoaded(() => state.value)
}

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
  onDiagramInstancesChanged: invalidateTraceabilityDiagrams,
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
  for (const link of [...state.value.links]) {
    if (link.sourceId === nodeId || link.targetId === nodeId) {
      markLinkDeleted(link.id)
    }
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
  invalidateTraceabilityDiagrams()

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
  invalidateTraceabilityDiagrams()
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

const saveWithValidation = async (): Promise<boolean> => {
  if (isSaving.value) return false

  // Show toast immediately — snapshot load/validation/lock/flush can block for a while.
  startSave()
  isPreparingValidation.value = true
  saveProgress.value = t('models.savePreparingValidation')
  await nextTick()
  await yieldToUiPaint()

  try {
    const prepared = await prepareModelSaveValidation({
      state: state.value,
      activeDiagram: activeDiagram.value?.parsedAttrs,
      t: (key, params) => String(t(key, params ?? {})),
    })
    if (!prepared.ok) {
      setUiError(prepared.error)
      return false
    }
    isPreparingValidation.value = false
    saveProgress.value = t('common.saving')
    // Проверить, что лок ещё наш, до начала сохранения
    const lockOk = await verifyLockBeforeSave()
    if (!lockOk) {
      setUiError(t('models.diagramLockLostSaveBlocked'))
      return false
    }

    diagramHistoryBatcher.flush()
    diagramCanvasRef.value?.flushCanvasState()
    await nextTick()
    const ok = await saveChanges()
    if (ok) {
      oefDetachedSnapshot.invalidateAfterRemoteSync()
      diagramCanvasRef.value?.resetHistory()
      if (activeDiagram.value?.id && diagramRenderer.value) {
        void uploadDiagramPreview()
      }
    }
    return ok
  } finally {
    isPreparingValidation.value = false
    if (isSaving.value) finishSave()
  }
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

const handleTraceabilityAddNodeToDiagram = (modelNodeId: string): void => {
  if (!canDragTraceabilityNodeToDiagram(modelNodeId).allowed) return
  diagramCanvasRef.value?.addExistingNodeAtViewportCenter(modelNodeId)
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
    invalidateTraceabilityDiagrams()
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
    invalidateTraceabilityDiagrams()
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
    invalidateTraceabilityDiagrams()
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
    invalidateTraceabilityDiagrams()
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

const {
  showLinkDeleteModal,
  showNodeDeleteModal,
  showDiagramDeleteModal,
  showDiagramSwitchModal,
  pendingDiagramSwitchId,
  pendingDiagramAction,
  nodeDeleteConfirmMessage,
  pendingDeleteDiagramName,
  allowRemoveLinkFromModel,
  openNodeDeleteDialog,
  cancelNodeDelete,
  confirmNodeDelete,
  openDiagramDeleteDialog,
  cancelDiagramDelete,
  confirmDiagramDelete,
  cancelLinkDelete,
  removeLinkFromCurrentDiagram,
  removeLinkFromModel,
  handleRequestDeleteNodeFromDiagram,
  handleRequestDeleteLink,
  cancelDiagramSwitch,
  requestDiagramSwitch,
  switchDiagramWithoutSave,
  shouldSkipDeleteHotkey,
  onDeleteKeydown,
} = useModelEditorEntityDelete({
  state,
  activeDiagram,
  selectedDiagramId,
  isDiagramReadOnly,
  t: (key, params) => String(t(key, params ?? {})),
  setUiError,
  discardUnsavedChanges,
  applyDiagramSelection,
  markNodeDeleted,
  markDiagramDeleted,
  markLinkDeleted,
  markDiagramDirty,
  removeNodesFromCurrentDiagram,
  removeNodesFromCurrentDiagramByInstances,
  isDiagramOnlyEdgeModelLinkId,
  isUntypedModelLinkId,
  selectedModelNodeIds,
  selectedInstanceIds,
  selectedModelLinkId,
  selectedEdgeInstanceId,
  selectedCanvasElementId,
  diagramInteractionManager,
  isNoteInstance,
  isContainerInstance,
  isEdgeAnchorInstance,
  isDiagramNoteModelNodeId,
  isDiagramContainerModelNodeId,
  isEdgeAnchorModelNodeId,
  copySelectedNotesToClipboard,
  pasteCopiedNotes,
})

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
    requestDiagramSwitch('switch', diagramId)
    return
  }
  applyDiagramSelection(diagramId)
}

const {
  showValidationScriptsModal,
  validationRunPayload,
  openValidationScriptsModal,
  closeValidationScriptsModal,
  handleDiagramScriptQuery,
  handleApplyDiagramScriptCommands,
  handleValidationIssueSelect,
} = useModelEditorScriptRun({
  model,
  state,
  selectedDiagramId,
  activeDiagram,
  isDiagramReadOnly,
  t: (key, params) => String(t(key, params ?? {})),
  setUiError,
  partialStore,
  executeDiagramHistoryCommand,
  markDiagramDirty,
  invalidateTraceabilityDiagrams,
  selectDiagram,
  selectedNodeId,
  selectedModelNodeIds,
  selectedModelLinkId,
  focusTreeNode: nodeId => treePanelRef.value?.focusNode?.(nodeId),
})

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

const handleToolbarAction = async (event: string) => {
  if (isSaveLockedToolbarEvent(event, isSaving.value)) return
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
    case 'copy-diagram-link': {
      const modelId = model.value?.id
      const diagramId = activeDiagram.value?.id
      if (!modelId || !diagramId) break
      const href = modelEditorDiagramHref(
        to => router.resolve(to),
        window.location.origin,
        modelId,
        diagramId
      )
      try {
        await navigator.clipboard.writeText(href)
      } catch {
        setUiError(t('models.copyDiagramLinkFailed'))
      }
      break
    }
    case 'import-oef':
      if (canInspectDiagramJson.value) {
        const loadedSnapshot = await oefDetachedSnapshot.load()
        if (!loadedSnapshot) {
          setUiError(oefDetachedSnapshot.error.value ?? t('common.error'))
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
      openValidationScriptsModal()
      break
    case 'close-diagram':
      if (activeDiagram.value && hasUnsavedChanges.value) {
        requestDiagramSwitch('close')
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
      components: state.value.components,
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
      components: state.value.components,
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
const routeNodeId = computed(() =>
  typeof route.query.nodeId === 'string' ? route.query.nodeId : ''
)
const routeLinkId = computed(() =>
  typeof route.query.linkId === 'string' ? route.query.linkId : ''
)
const applyRouteDiagramSelection = (diagramId: string): void => {
  if (!diagramId) return
  const target = state.value.diagrams.find(
    diagram => diagram.id === diagramId && !diagram._isDeleted
  )
  if (!target) return
  applyDiagramSelection(target.id)
}
const applyRouteNodeSelection = (nodeId: string): void => {
  if (!nodeId) return
  selectedNodeId.value = nodeId
  treePanelRef.value?.focusNode?.(nodeId)
}
const applyRouteLinkSelection = (linkId: string): void => {
  if (!linkId) return
  selectedModelLinkId.value = linkId
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
      selectHit: async (nodeId, isCurrent) => {
        const result = await lazyTreeSearch.selectHit({ kind: 'node', id: nodeId }, isCurrent)
        return result.nodePath
      },
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
const focusRouteNodeInTree = async (
  nodeId: string,
  isCurrent: () => boolean
): Promise<void> => {
  if (!isCurrent()) return
  routeTreeFocusLoading.value = false
  routeTreeFocusError.value = null
  if (!nodeId) return
  const needsTreePath = nodeId !== treeRootNodeId.value
  routeTreeFocusLoading.value = true
  routeTreeFocusError.value = null
  try {
    await focusRouteDiagramTree({
      diagramId: nodeId,
      nodeId,
      treeRootNodeId: treeRootNodeId.value,
      selectHit: async (id, guard) => {
        const result = await lazyTreeSearch.selectHit({ kind: 'node', id }, guard)
        return result.nodePath
      },
      waitForRender: nextTick,
      expandPath: path => treePanelRef.value?.expandPath?.(path),
      focusDiagram: (id, guard) => treePanelRef.value?.focusNode?.(id, guard),
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
    nodeId: routeNodeId,
    linkId: routeLinkId,
    loadModel: async () => loadModel(),
    applyRouteDiagramSelection,
    applyRouteNodeSelection,
    applyRouteLinkSelection,
    focusRouteDiagramInTree,
    focusRouteNodeInTree,
    afterModelLoad: () => {
      scheduleFetchDocumentsFromApi()
      void whenBackgroundReady().then(() => fetchWikiDocuments())
    },
  })

watch(selectedDiagramId, diagramId => {
  if (selectedDiagramQueryMatches(route.query, diagramId)) return
  void router.replace({ query: withSelectedDiagramQuery(route.query, diagramId) })
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
        :has-unsaved-changes="hasUnsavedChanges"
        :can-save="!isSaving && !isDiagramReadOnly && !lockLost"
        :toolbar-locked="isSaving"
        :canvas-toggle-buttons="canvasToggleButtons"
        :default-link-type-options="defaultLinkTypeOptions"
        :default-edge-type="defaultEdgeType"
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
        :diagram-lock-blocked-by-other="diagramLockBlockedByOther"
        :diagram-lock-holder-display="diagramLockHolderName"
        :diagram-lock-server-newer="diagramLockServerNewerWhileBlocked"
        :diagram-lock-lost="lockLost"
        :diagram-spectators="diagramSpectators"
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
        @open-validation="handleOpenValidation"
        @open-notation="handleOpenNotationEditor"
        @select-diagram-version="selectedDiagramId = $event"
        @create-baseline="handleCreateBaseline"
        @diagram-lock-reload="handleReloadModelForDiagramLock"
        @diagram-lock-retry="retryAcquire"
        @update:default-edge-type="defaultEdgeType = $event"
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
            :search-query="lazyTreeSearchQuery"
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
              v-if="activeRightTab === 'traceability' && canShowTraceabilityTab && selectedNode"
              :model-id="state.modelId"
              :selected-node="selectedNode"
              :nodes="traceabilityNodes"
              :link-types="traceabilityLinkTypes"
              :authoritative-revision="partialStore.materializedRevision.value"
              :diagram-revision="traceabilityDiagramRevision"
              :active-diagram="activeDiagram"
              :active-notation-id="activeNotationId"
              :is-diagram-read-only="isDiagramReadOnly"
              :relations="state.relations"
              :can-connect="canConnect"
              :can-drag-node-to-diagram="canDragTraceabilityNodeToDiagram"
              :is-diagram-only-edge-model-link-id="isDiagramOnlyEdgeModelLinkId"
              :begin-request="beginTraceabilityRequest"
              :is-request-current="isTraceabilityRequestCurrent"
              :merge-partial-entities="mergeTraceabilityEntities"
              :resolve-branch-rows="resolveTraceabilityRows"
              :resolve-diagram-references="resolveTraceabilityDiagramReferences"
              @open-diagram="selectDiagram"
              @focus-node="handleTraceabilityFocusNode"
              @add-node-to-diagram="handleTraceabilityAddNodeToDiagram"
            />
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
    v-if="showImportWizard && oefDetachedSnapshot.stale.value"
    entity="links"
    :message="t('models.oefDetachedLinksStale')"
    @retry="oefDetachedSnapshot.load"
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

  <DiagramTrashConflictModal
    v-if="diagramNameVersionConflict?.error === 'DIAGRAM_NAME_VERSION_IN_TRASH'"
    :name="diagramNameVersionConflict.name"
    :version="diagramNameVersionConflict.version"
    :suggested-version="diagramNameVersionConflict.suggestedVersion"
    @close="dismissDiagramNameVersionConflict"
    @bump="resolveDiagramTrashBump"
    @replace="resolveDiagramTrashReplace"
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

  <CreateNodeModal
    v-if="showCreateNodeModal"
    :title="createNodeModalTitle"
    :kind="createNodeModal.kind"
    :name="newNodeName"
    :node-type-id="newNodeTypeId"
    :node-type-options="
      nonDirectoryNodeTypes.map(typeItem => ({ id: typeItem.id, label: typeItem.name }))
    "
    :can-create="canCreateNodeFromModal"
    :pending="createNodePending"
    @close="closeCreateNodeModal"
    @create="createNode"
    @update:name="newNodeName = $event"
    @update:node-type-id="newNodeTypeId = $event"
  />

  <MigrateNotationModal
    v-if="showMigrateModal && migrateTarget"
    :target-name="migrateTarget.name"
    :target-version="migrateTarget.version"
    :unmapped-components="migratePreviewUnmapped.components"
    :unmapped-relations="migratePreviewUnmapped.relations"
    :migrating="isMigrating"
    @close="closeMigrateModal"
    @confirm="confirmMigrateNotation"
  />

  <NoteEditorModal
    v-if="showNoteEditorModal"
    :text="noteEditorText"
    @close="cancelNoteEditor"
    @save="saveNoteEditor"
    @update:text="noteEditorText = $event"
  />

  <CreateDiagramModal
    v-if="showCreateDiagramModal"
    :name="newDiagramName"
    :version="newDiagramVersion"
    :notation-id="newDiagramNotationId"
    :notation-options="
      state.notations.map(notation => ({
        id: notation.id,
        label: `${notation.name} (${notation.version})`,
      }))
    "
    :has-name-version-conflict="hasDiagramNameVersionConflict"
    :trash-conflict="diagramTrashConflict"
    :pending="createDiagramPending"
    @close="showCreateDiagramModal = false"
    @create="createDiagram"
    @bump-version="createDiagramWithBumpedVersion"
    @replace-deleted="createDiagramReplacingDeleted"
    @update:name="newDiagramName = $event"
    @update:version="newDiagramVersion = $event"
    @update:notation-id="newDiagramNotationId = $event"
  />

  <ChoiceListModal
    v-if="showComponentChoiceModal"
    :title="t('diagram.selectComponent')"
    :options="componentChoiceOptions"
    @close="handleComponentChoiceModalClose"
    @select="finalizeComponentChoiceForDiagram"
  />

  <ChoiceListModal
    v-if="showRelationChoiceModal"
    :title="t('diagram.selectRelation')"
    :options="relationChoiceOptions"
    @close="showRelationChoiceModal = false"
    @select="finalizeConnection"
  />

  <LinkReuseModal
    v-if="showReuseLinkModal"
    :options="reuseLinkModalOptions"
    @close="showReuseLinkModal = false"
    @select="handleSelectExistingLink"
    @create-new="handleCreateNewLinkFromReuseModal"
  />

  <UnsavedChangesModal
    v-if="showDiagramSwitchModal"
    variant="save-or-discard"
    :title="t('models.unsavedChangesTitle')"
    :message="
      pendingDiagramAction === 'close'
        ? t('models.saveBeforeCloseDiagram')
        : t('models.saveBeforeSwitchDiagram')
    "
    :stay-label="t('common.cancel')"
    :confirm-label="t('models.dontSave')"
    :save-label="
      pendingDiagramAction === 'close' ? t('models.saveAndClose') : t('models.saveAndSwitch')
    "
    max-width="500px"
    :confirm-disabled="isLoading || isSaving"
    :save-disabled="isSaving"
    @stay="cancelDiagramSwitch"
    @confirm="switchDiagramWithoutSave"
    @save="saveAndSwitchDiagram"
    @close="cancelDiagramSwitch"
  />

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

  <LinkDeleteModal
    v-if="showLinkDeleteModal"
    :allow-remove-from-model="allowRemoveLinkFromModel"
    @close="cancelLinkDelete"
    @remove-from-diagram="removeLinkFromCurrentDiagram"
    @remove-from-model="removeLinkFromModel"
  />

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

  <DiagramJsonModal
    v-if="showDiagramJson"
    :content="diagramJsonContent"
    @close="showDiagramJson = false"
    @copy="copyDiagramJson"
  />

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
    :query="handleDiagramScriptQuery"
    :can-edit="canInspectDiagramJson"
    @close="closeValidationScriptsModal"
    @select-issue="handleValidationIssueSelect"
    @apply-commands="handleApplyDiagramScriptCommands"
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

  <OefImportReportModal
    v-if="oefImportReport"
    :report="oefImportReport"
    :warning-label="oefWarningLabel"
    @close="oefImportReport = null"
  />

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
}

.relation-rules-loading-badge__icon {
  width: 16px;
  height: 16px;
  color: var(--primary);
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

.model-canvas-area--has-newer-banner :deep(.canvas-palette-toggle),
.model-canvas-area--has-newer-banner :deep(.canvas-palette) {
  top: 50px;
}

.model-canvas-area--has-newer-banner .relation-rules-loading-badge {
  top: 96px;
}

</style>

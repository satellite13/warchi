<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
import MainLayout from '../layouts/MainLayout.vue'
import AppFooter from '../components/layout/AppFooter.vue'
import BaseModal from '../components/modals/BaseModal.vue'
import ShareAccessModal from '../components/modals/ShareAccessModal.vue'
import { apiGet, apiPost } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'
import { useCanShare } from '../composables/useCanShare'
import NotationMainPanelLayout from '../features/notations/layout/NotationMainPanelLayout.vue'
import NotationAppHeader from '../features/notations/layout/NotationAppHeader.vue'
import NotationComponentList from '../features/notations/layout/NotationComponentList.vue'
import NotationDiagram from '../features/notations/components/NotationDiagram.vue'
import NotationEntityModal from '../features/notations/components/NotationEntityModal.vue'
import CustomPropertiesPanel from '../features/notations/components/CustomPropertiesPanel.vue'
import NodeStylePanel from '../features/notations/components/NodeStylePanel.vue'
import TabPanel from '../components/layout/TabPanel.vue'
import DocumentEditorModal from '../components/modals/DocumentEditorModal.vue'
import { useNotationEditor } from '../features/notations/composables/useNotationEditor'
import {
  useNotationEntity,
  appendTagValue,
} from '../features/notations/composables/useNotationEntity'
import { useNotationToolbarState } from '../features/notations/composables/useNotationToolbarState'
import { useNotationExport } from '../features/notations/composables/useNotationExport'
import type { DiagramStyle } from '../features/notations/notationAttrs'
import { createId } from '../features/notations/notationAttrs'
import type { NodeResponse, LinkResponse } from '../types/api'
import type {
  EditorComponent,
  EditorRelation,
  EditorRelationRule,
} from '../features/notations/types'
import type { PaginatedResponse } from '../types/entities'

const {
  notation,
  state,
  isLoading,
  isSaving,
  saveError,
  saveSuccess,
  saveProgress,
  hasUnsavedChanges,
  loadNotation,
  saveChanges,
} = useNotationEditor()
const { currentUser, isAdmin } = useAuth()
const showShareModal = ref(false)
const { canShare: canShareNotation } = useCanShare(notation, currentUser)

// Document modal state
const showDocModal = ref(false)
const docModalTitle = ref('')
const docModalFileId = ref<string | null>(null)
const docModalTarget = ref<{ kind: 'notation' | 'component' | 'relation'; id: string } | null>(null)

function getNotationDocFileId(): string | null {
  const raw = notation.value?.attrs
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return typeof parsed.documentFileId === 'string' ? parsed.documentFileId : null
  } catch {
    return null
  }
}

function setNotationDocFileId(fileId: string) {
  const raw = notation.value?.attrs
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      parsed = {}
    }
  }
  parsed.documentFileId = fileId
  if (notation.value) {
    notation.value.attrs = JSON.stringify(parsed)
  }
}

function openDocModal(
  target: { kind: 'notation' | 'component' | 'relation'; id: string },
  title: string,
  fileId: string | null
) {
  docModalTarget.value = target
  docModalTitle.value = title
  docModalFileId.value = fileId
  showDocModal.value = true
}

function handleOpenEntityDoc(item: EditorComponent | EditorRelation) {
  const isRelation = 'linkTypeId' in item
  const kind = isRelation ? ('relation' as const) : ('component' as const)
  openDocModal({ kind, id: item.id }, item.name, item.parsedAttrs.documentFileId ?? null)
}

function handleOpenNotationDoc() {
  openDocModal(
    { kind: 'notation', id: state.value.notationId },
    notation.value?.name ?? t('notations.entityName'),
    getNotationDocFileId()
  )
}

async function handleDocSaved(fileId: string) {
  const target = docModalTarget.value
  if (!target) return

  const notationId = state.value.notationId ?? undefined

  if (target.kind === 'notation') {
    setNotationDocFileId(fileId)
    if (notationId) {
      await apiPost<{ fileId: string; label: string }>('/documents', { fileId, notationId })
    }
  } else if (target.kind === 'component') {
    const component = state.value.components.find(c => c.id === target.id)
    if (component && !component.parsedAttrs.documentFileId) {
      component.parsedAttrs.documentFileId = fileId
      markComponentDirty(target.id)
    }
    if (notationId) {
      await apiPost<{ fileId: string; label: string }>('/documents', {
        fileId,
        notationId,
        componentId: target.id
      })
    }
  } else if (target.kind === 'relation') {
    const relation = state.value.relations.find(r => r.id === target.id)
    if (relation && !relation.parsedAttrs.documentFileId) {
      relation.parsedAttrs.documentFileId = fileId
      markRelationDirty(target.id)
    }
    if (notationId) {
      await apiPost<{ fileId: string; label: string }>('/documents', {
        fileId,
        notationId,
        relationId: target.id
      })
    }
  }
}

function handleDocModalClose() {
  showDocModal.value = false
  docModalTarget.value = null
}

const {
  selectedEntity,
  showComponentModal,
  componentName,
  componentTags,
  componentVersion,
  componentTypeSelection,
  componentNewTypeName,
  componentStylePreset,
  componentFormError,
  componentTagSuggestions,
  showRelationModal,
  relationName,
  relationTags,
  relationVersion,
  relationTypeSelection,
  relationNewTypeName,
  relationStylePreset,
  relationFormError,
  relationTagSuggestions,
  componentStylePresets,
  relationStylePresets,
  selectedItem,
  openComponentModal,
  closeComponentModal,
  addComponent,
  openRelationModal,
  closeRelationModal,
  addRelation,
  selectComponent,
  selectRelation,
  markComponentDirty,
  markRelationDirty,
  removeComponent,
  removeRelation,
} = useNotationEntity(state)

const NEW_TYPE_VALUE = '__new__'

const userId = computed(() => currentUser.value?.id ?? null)

const { gridVisible, miniMapVisible, snapEnabled, alignEnabled, rulersEnabled } =
  useNotationToolbarState(userId)

const diagramRef = ref<InstanceType<typeof NotationDiagram> | null>(null)
const canUndo = ref(false)
const canRedo = ref(false)

const selectedEntityId = computed(() => selectedEntity.value?.id ?? null)
const selectedItemTypeProperties = computed(() => {
  const entity = selectedEntity.value
  if (!entity) return []
  if (entity.kind === 'component') {
    const item = state.value.components.find(c => c.id === entity.id)
    if (!item) return []
    const nodeType = state.value.nodeTypes.find(t => t.id === item.nodeTypeId)
    return nodeType?.parsedAttrs.customProperties ?? []
  }
  const item = state.value.relations.find(r => r.id === entity.id)
  if (!item) return []
  const linkType = state.value.linkTypes.find(t => t.id === item.linkTypeId)
  return linkType?.parsedAttrs.customProperties ?? []
})

const modelNodes = ref<NodeResponse[]>([])
const modelLinks = ref<LinkResponse[]>([])

const parseJsonObject = (raw: string | null | undefined): Record<string, unknown> => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore malformed attrs
  }
  return {}
}

const loadModelUsage = async () => {
  const query = new URLSearchParams({ size: '2000' })
  const [nodesResult, linksResult] = await Promise.all([
    apiGet<PaginatedResponse<NodeResponse>>(`/nodes?${query.toString()}`),
    apiGet<PaginatedResponse<LinkResponse>>(`/links?${query.toString()}`),
  ])
  modelNodes.value = nodesResult.success ? (nodesResult.data.content ?? []) : []
  modelLinks.value = linksResult.success ? (linksResult.data.content ?? []) : []
}

const selectedComponentUsedInModelNodes = computed(() => {
  if (selectedEntity.value?.kind !== 'component') return false
  const componentId = selectedEntity.value.id
  const notationId = state.value.notationId
  return modelNodes.value.some(node => {
    const attrs = parseJsonObject(node.attrs)
    const componentBindings = attrs.componentBindings
    if (
      !componentBindings ||
      typeof componentBindings !== 'object' ||
      Array.isArray(componentBindings)
    ) {
      return false
    }
    const byNotation = (componentBindings as Record<string, unknown>)[notationId]
    if (!byNotation || typeof byNotation !== 'object' || Array.isArray(byNotation)) return false
    return (byNotation as Record<string, unknown>).componentId === componentId
  })
})

const selectedRelationUsedInModelLinks = computed(() => {
  if (selectedEntity.value?.kind !== 'relation') return false
  const relationId = selectedEntity.value.id
  const notationId = state.value.notationId
  return modelLinks.value.some(link => {
    const attrs = parseJsonObject(link.attrs)
    const relationBindings = attrs.relationBindings
    if (
      !relationBindings ||
      typeof relationBindings !== 'object' ||
      Array.isArray(relationBindings)
    ) {
      return false
    }
    const byNotation = (relationBindings as Record<string, unknown>)[notationId]
    if (!byNotation || typeof byNotation !== 'object' || Array.isArray(byNotation)) return false
    return (byNotation as Record<string, unknown>).relationId === relationId
  })
})

// Compute the diagram element ID for the selected entity (for the style panel)
// Components use node ID, relations use edge ID
const selectedDiagramElementId = computed(() => {
  const entity = selectedEntity.value
  if (!entity) return null
  if (entity.kind === 'relation') {
    return `relation-edge-${entity.id}`
  }
  return `component-${entity.id}`
})

const interactionManager = computed(() => diagramRef.value?.interactionManagerRef ?? null)
const diagramRenderer = computed(() => diagramRef.value?.rendererRef ?? null)

const selectedDiagramStyle = computed(() => {
  const entity = selectedEntity.value
  if (!entity) return undefined
  if (entity.kind === 'component') {
    return state.value.components.find(c => c.id === entity.id)?.parsedAttrs.diagramStyle
  }
  return state.value.relations.find(r => r.id === entity.id)?.parsedAttrs.diagramStyle
})

const importNotationInputRef = ref<HTMLInputElement | null>(null)

const {
  showAttrsJson,
  attrsJsonContent,
  exportNotation,
  exportDiagramAsPng,
  exportDiagramAsSvg,
  triggerNotationImport,
  handleNotationImportChange,
  openAttrsJson,
  copyAttrsJson,
} = useNotationExport(
  notation,
  state,
  selectedEntity,
  diagramRenderer,
  saveError,
  saveSuccess,
  importNotationInputRef
)

const selectionSyncEnabled = ref(true)

const activeRightTab = ref('properties')

const rightPanelTabs = computed(() => [
  { id: 'properties', label: t('notations.propertiesTab'), icon: 'tune' },
  { id: 'style', label: t('notations.figureStyleTab'), icon: 'palette' },
])

const focusSelectedOnDiagram = (kind: 'component' | 'relation', id: string) => {
  if (!selectionSyncEnabled.value) return
  const renderer = diagramRef.value?.rendererRef
  const navigation = diagramRef.value?.interactionManagerRef?.navigation
  if (!renderer || !navigation || typeof navigation.zoomToRect !== 'function') return

  if (kind === 'component') {
    const node = renderer.getNode?.(`component-${id}`)
    const bounds = node?.getBounds?.()
    if (bounds) {
      navigation.zoomToRect(bounds, 64)
    }
    return
  }

  const edge = renderer.getEdge?.(`relation-edge-${id}`)
  const bounds = edge?.getBounds?.()
  if (bounds) {
    navigation.zoomToRect(bounds, 64)
  }
}

watch(
  interactionManager,
  im => {
    if (!im) return
    // Keep interaction managers in sync with toolbar state.
    im.drag.setSnapToGrid(snapEnabled.value)
    im.resize.setSnapToGrid(snapEnabled.value)
    im.connection.setSnapToGrid(snapEnabled.value)
    im.drag.setAlignmentEnabled(alignEnabled.value)
    const overlayGrid = diagramRef.value?.gridOverlayRef
    overlayGrid?.setEnabled(gridVisible.value)
    const overlayMiniMap = diagramRef.value?.miniMapRef
    overlayMiniMap?.setEnabled(miniMapVisible.value)
    const overlayRulers = diagramRef.value?.rulersOverlayRef
    overlayRulers?.setEnabled(rulersEnabled.value)
    diagramRenderer.value?.markDirty()
    im.history.on('change', () => {
      canUndo.value = im.history.canUndo
      canRedo.value = im.history.canRedo
    })
  },
  { immediate: true }
)

const handleStyleChange = (style: DiagramStyle) => {
  const entity = selectedEntity.value
  if (!entity) return

  if (entity.kind === 'component') {
    const item = state.value.components.find(c => c.id === entity.id)
    if (item) {
      item.parsedAttrs.diagramStyle = style
      markComponentDirty(entity.id)
    }
  } else {
    const item = state.value.relations.find(r => r.id === entity.id)
    if (item) {
      item.parsedAttrs.diagramStyle = style
      markRelationDirty(entity.id)
    }
  }
}

const handleMutateItem = (id: string, apply: (item: EditorComponent | EditorRelation) => void) => {
  const comp = state.value.components.find(c => c.id === id)
  if (comp) {
    apply(comp)
    markComponentDirty(id)
    return
  }
  const rel = state.value.relations.find(r => r.id === id)
  if (rel) {
    apply(rel)
    markRelationDirty(id)
  }
}

const handleMutateRelationRules = (apply: (rules: EditorRelationRule[]) => void) => {
  apply(state.value.relationRules)
  handleRelationRulesChanged()
}

const handleComponentTypeChanged = (componentId: string, nodeTypeId: string) => {
  const component = state.value.components.find(item => item.id === componentId)
  if (!component || component.nodeTypeId === nodeTypeId) return
  component.nodeTypeId = nodeTypeId
  markComponentDirty(componentId)
}

const handleCreateNodeType = (componentId: string, nodeTypeName: string) => {
  const trimmedName = nodeTypeName.trim()
  if (!trimmedName) return

  const existingType = state.value.nodeTypes.find(
    item => item.name.trim().toLowerCase() === trimmedName.toLowerCase()
  )

  const nodeTypeId = existingType?.id ?? createId()
  if (!existingType) {
    state.value.nodeTypes.push({
      id: nodeTypeId,
      ownerId: state.value.ownerId,
      name: trimmedName,
      parsedAttrs: {},
      _isNew: true,
    })
  }

  handleComponentTypeChanged(componentId, nodeTypeId)
}

const handleRelationTypeChanged = (relationId: string, linkTypeId: string) => {
  const relation = state.value.relations.find(item => item.id === relationId)
  if (!relation || relation.linkTypeId === linkTypeId) return
  relation.linkTypeId = linkTypeId
  markRelationDirty(relationId)
}

const handleCreateRelationType = (relationId: string, linkTypeName: string) => {
  const trimmedName = linkTypeName.trim()
  if (!trimmedName) return

  const existingType = state.value.linkTypes.find(
    item => item.name.trim().toLowerCase() === trimmedName.toLowerCase()
  )

  const linkTypeId = existingType?.id ?? createId()
  if (!existingType) {
    state.value.linkTypes.push({
      id: linkTypeId,
      ownerId: state.value.ownerId,
      name: trimmedName,
      parsedAttrs: {},
      _isNew: true,
    })
  }

  handleRelationTypeChanged(relationId, linkTypeId)
}

const handleRelationRulesChanged = () => {
  state.value.relationRules.forEach(rule => {
    if (!rule._isNew) {
      rule._isDirty = true
    }
  })
}

const handleSelect = (
  kind: 'component' | 'relation',
  id: string,
  source: 'list' | 'diagram' = 'list'
) => {
  if (kind === 'component') {
    selectComponent(id)
  } else {
    selectRelation(id)
  }
  if (source === 'list') {
    nextTick(() => {
      focusSelectedOnDiagram(kind, id)
    })
  }
}

const handleDiagramSelect = (id: string, kind: 'component' | 'relation') => {
  handleSelect(kind, id, 'diagram')
}

const toggleSelectionSync = () => {
  selectionSyncEnabled.value = !selectionSyncEnabled.value
  if (!selectionSyncEnabled.value) return
  const entity = selectedEntity.value
  if (!entity) return
  nextTick(() => {
    focusSelectedOnDiagram(entity.kind, entity.id)
  })
}

// Remove item confirmation
const showRemoveDialog = ref(false)
const pendingRemove = ref<{ kind: 'component' | 'relation'; id: string; name: string } | null>(null)

const handleRemoveItem = (kind: 'component' | 'relation', id: string) => {
  const item =
    kind === 'component'
      ? state.value.components.find(c => c.id === id)
      : state.value.relations.find(r => r.id === id)
  pendingRemove.value = { kind, id, name: item?.name || '' }
  showRemoveDialog.value = true
}

const confirmRemove = () => {
  if (pendingRemove.value) {
    const { kind, id } = pendingRemove.value
    if (kind === 'component') {
      removeComponent(id)
    } else {
      removeRelation(id)
    }
  }
  showRemoveDialog.value = false
  pendingRemove.value = null
}

const cancelRemove = () => {
  showRemoveDialog.value = false
  pendingRemove.value = null
}

// Toolbar actions
const handleToolbarAction = async (event: string) => {
  const im = interactionManager.value
  const renderer = diagramRenderer.value

  switch (event) {
    case 'save':
      if (!hasUnsavedChanges.value) break
      await saveChanges(false)
      break
    case 'undo':
      im?.history.undo()
      break
    case 'redo':
      im?.history.redo()
      break
    case 'zoom-in':
      if (renderer) {
        const center = { x: renderer.width / 2, y: renderer.height / 2 }
        im?.navigation.setZoom(renderer.zoom * 1.2, center)
      }
      break
    case 'zoom-out':
      if (renderer) {
        const center = { x: renderer.width / 2, y: renderer.height / 2 }
        im?.navigation.setZoom(renderer.zoom / 1.2, center)
      }
      break
    case 'fit-screen':
      diagramRef.value?.fitToView()
      break
    case 'zoom-selection':
      im?.zoomToSelection()
      break
    case 'auto-layout-components':
      diagramRef.value?.autoLayoutComponents()
      break
    case 'reset-view':
      diagramRef.value?.resetView()
      break
    case 'toggle-grid': {
      gridVisible.value = !gridVisible.value
      const overlay = diagramRef.value?.gridOverlayRef
      overlay?.setEnabled(gridVisible.value)
      renderer?.markDirty()
      break
    }
    case 'toggle-minimap': {
      miniMapVisible.value = !miniMapVisible.value
      const overlay = diagramRef.value?.miniMapRef
      overlay?.setEnabled(miniMapVisible.value)
      renderer?.markDirty()
      break
    }
    case 'toggle-snap': {
      snapEnabled.value = !snapEnabled.value
      im?.drag.setSnapToGrid(snapEnabled.value)
      im?.resize.setSnapToGrid(snapEnabled.value)
      im?.connection.setSnapToGrid(snapEnabled.value)
      break
    }
    case 'toggle-align': {
      alignEnabled.value = !alignEnabled.value
      im?.drag.setAlignmentEnabled(alignEnabled.value)
      break
    }
    case 'toggle-rulers': {
      rulersEnabled.value = !rulersEnabled.value
      const overlay = diagramRef.value?.rulersOverlayRef
      overlay?.setEnabled(rulersEnabled.value)
      renderer?.markDirty()
      break
    }
    case 'show-attrs-json':
      if (isAdmin.value) openAttrsJson()
      break
    case 'export-notation':
      exportNotation()
      break
    case 'export-diagram-png':
      await exportDiagramAsPng()
      break
    case 'export-diagram-svg':
      exportDiagramAsSvg()
      break
    case 'import-notation':
      triggerNotationImport()
      break
    case 'open-notation-doc':
      handleOpenNotationDoc()
      break
  }
}

// Unsaved changes confirmation dialog
const showLeaveDialog = ref(false)
const allowLeave = ref(false)
let pendingRoute: RouteLocationRaw | null = null

const confirmLeave = () => {
  showLeaveDialog.value = false
  allowLeave.value = true
  if (pendingRoute) {
    router.push(pendingRoute)
    pendingRoute = null
  }
}

const cancelLeave = () => {
  showLeaveDialog.value = false
  pendingRoute = null
}

// Guard Vue Router navigation
onBeforeRouteLeave(to => {
  if (allowLeave.value) {
    allowLeave.value = false
    return true
  }
  if (hasUnsavedChanges.value) {
    showLeaveDialog.value = true
    pendingRoute = to.fullPath
    return false
  }
  return true
})

// Guard browser close / refresh
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    e.preventDefault()
  }
}

onMounted(() => {
  loadNotation()
  loadModelUsage()
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <input
    ref="importNotationInputRef"
    class="notation-import-input"
    type="file"
    accept=".json,application/json"
    @change="handleNotationImportChange"
  />
  <MainLayout>
    <template #header>
      <NotationAppHeader
        hide-toolbar
        :has-unsaved-changes="hasUnsavedChanges"
        :notation-name="notation?.name"
        :notation-version="notation?.version"
        :grid-visible="gridVisible"
        :mini-map-visible="miniMapVisible"
        :snap-enabled="snapEnabled"
        :align-enabled="alignEnabled"
        :rulers-enabled="rulersEnabled"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :can-share="canShareNotation"
        :is-admin="isAdmin"
        @action="handleToolbarAction"
        @share="showShareModal = true"
      />
    </template>
    <template #default>
      <NotationMainPanelLayout>
        <template #left>
          <NotationComponentList
            v-if="!isLoading"
            :state="state"
            :selected-id="selectedEntityId"
            :sync-selection-enabled="selectionSyncEnabled"
            @select="handleSelect"
            @toggle-sync-selection="toggleSelectionSync"
            @create-component="openComponentModal"
            @create-relation="openRelationModal"
            @remove-item="handleRemoveItem"
          />
        </template>
        <template #default>
          <div class="notation-canvas-area">
            <div class="notation-canvas-area__toolbar">
              <NotationAppHeader
                canvas-mode
                :has-unsaved-changes="hasUnsavedChanges"
                :notation-name="notation?.name"
                :notation-version="notation?.version"
                :grid-visible="gridVisible"
                :mini-map-visible="miniMapVisible"
                :snap-enabled="snapEnabled"
                :align-enabled="alignEnabled"
                :rulers-enabled="rulersEnabled"
                :can-undo="canUndo"
                :can-redo="canRedo"
                :can-share="canShareNotation"
                :is-admin="isAdmin"
                @action="handleToolbarAction"
                @share="showShareModal = true"
              />
            </div>
            <NotationDiagram
              ref="diagramRef"
              v-if="!isLoading"
              :state="state"
              :selected-id="selectedEntityId"
              @select="handleDiagramSelect"
            />
          </div>
        </template>
        <template #right>
          <TabPanel v-model="activeRightTab" :tabs="rightPanelTabs">
            <CustomPropertiesPanel
              v-if="activeRightTab === 'properties'"
              :selected-item="selectedItem"
              :node-types="state.nodeTypes"
              :link-types="state.linkTypes"
              :type-properties="selectedItemTypeProperties"
              :all-components="state.components"
              :all-relations="state.relations"
              :relation-rules="state.relationRules"
              :is-component-type-locked="selectedComponentUsedInModelNodes"
              :is-relation-type-locked="selectedRelationUsedInModelLinks"
              :on-component-type-change="handleComponentTypeChanged"
              :on-relation-type-change="handleRelationTypeChanged"
              :on-create-node-type="handleCreateNodeType"
              :on-create-relation-type="handleCreateRelationType"
              :on-mutate-item="handleMutateItem"
              :on-mutate-relation-rules="handleMutateRelationRules"
              :on-open-document="handleOpenEntityDoc"
            />
            <NodeStylePanel
              v-if="activeRightTab === 'style'"
              :selected-element-id="selectedDiagramElementId"
              :interaction-manager="interactionManager"
              :renderer="diagramRenderer"
              :current-diagram-style="selectedDiagramStyle"
              @style-change="handleStyleChange"
            />
          </TabPanel>
        </template>
      </NotationMainPanelLayout>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>

  <!-- Save status toast -->
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
      <div v-else-if="saveError" class="save-toast save-toast--error">
        <UiIcon name="error" class="save-toast__icon" />
        <span>{{ saveError }}</span>
      </div>
    </Transition>
  </Teleport>

  <!-- Unsaved changes confirmation -->
  <BaseModal
    v-if="showLeaveDialog"
    :title="t('notations.unsavedChangesTitle')"
    max-width="400px"
    @close="cancelLeave"
  >
    <p class="leave-dialog__text">
      {{ t('notations.unsavedChangesText') }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelLeave">
        {{ t('notations.stayButton') }}
      </button>
      <button type="button" class="btn btn--danger" @click="confirmLeave">
        {{ t('notations.leaveButton') }}
      </button>
    </template>
  </BaseModal>

  <!-- Remove item confirmation -->
  <BaseModal
    v-if="showRemoveDialog"
    :title="t('notations.removeElementTitle')"
    max-width="400px"
    @close="cancelRemove"
  >
    <p class="leave-dialog__text">
      {{
        pendingRemove?.kind === 'component'
          ? t('notations.removeComponentConfirm', {
              name: pendingRemove?.name || t('common.unnamed'),
            })
          : t('notations.removeRelationConfirm', {
              name: pendingRemove?.name || t('common.unnamed'),
            })
      }}
    </p>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="cancelRemove">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn btn--danger" @click="confirmRemove">
        {{ t('common.delete') }}
      </button>
    </template>
  </BaseModal>

  <!-- JSON attrs viewer -->
  <BaseModal
    v-if="showAttrsJson"
    title="JSON attrs"
    max-width="600px"
    @close="showAttrsJson = false"
  >
    <pre class="json-viewer">{{ attrsJsonContent }}</pre>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="copyAttrsJson">
        {{ t('notations.copyButton') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="showAttrsJson = false">
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>

  <NotationEntityModal
    v-if="showComponentModal"
    v-model:name="componentName"
    v-model:version="componentVersion"
    v-model:tags="componentTags"
    v-model:type-selection="componentTypeSelection"
    v-model:new-type-name="componentNewTypeName"
    v-model:style-preset="componentStylePreset"
    :title="t('notations.newComponentTitle')"
    form-id="component-form"
    :name-label="t('notations.componentNameLabel')"
    name-placeholder="Component name"
    :version-label="t('notations.versionLabel')"
    version-placeholder="1.0.0"
    :tags-label="t('notations.tagsLabel')"
    tags-placeholder="tag1, tag2"
    :type-label="t('notations.nodeTypeLabel')"
    :type-options="state.nodeTypes"
    :new-type-value="NEW_TYPE_VALUE"
    :new-type-label="t('notations.newNodeTypeLabel')"
    :new-type-placeholder="t('notations.typeNamePlaceholder')"
    :style-label="t('notations.figureStyleLabel')"
    :style-presets="componentStylePresets"
    :suggestions="componentTagSuggestions"
    :error="componentFormError"
    @close="closeComponentModal"
    @submit="addComponent"
    @select-tag="componentTags = appendTagValue(componentTags, $event)"
  />

  <NotationEntityModal
    v-if="showRelationModal"
    v-model:name="relationName"
    v-model:version="relationVersion"
    v-model:tags="relationTags"
    v-model:type-selection="relationTypeSelection"
    v-model:new-type-name="relationNewTypeName"
    v-model:style-preset="relationStylePreset"
    :title="t('notations.newRelationTitle')"
    form-id="relation-form"
    :name-label="t('notations.relationNameLabel')"
    name-placeholder="Relation name"
    :version-label="t('notations.versionLabel')"
    version-placeholder="1.0.0"
    :tags-label="t('notations.tagsLabel')"
    tags-placeholder="tag1, tag2"
    :type-label="t('notations.linkTypeLabel')"
    :type-options="state.linkTypes"
    :new-type-value="NEW_TYPE_VALUE"
    :new-type-label="t('notations.newLinkTypeLabel')"
    :new-type-placeholder="t('notations.typeNamePlaceholder')"
    :style-label="t('notations.linkStyleLabel')"
    :style-presets="relationStylePresets"
    :suggestions="relationTagSuggestions"
    :error="relationFormError"
    @close="closeRelationModal"
    @submit="addRelation"
    @select-tag="relationTags = appendTagValue(relationTags, $event)"
  />

  <ShareAccessModal
    v-if="showShareModal && notation"
    :title="t('notations.notationAccessTitle')"
    resource-type="NOTATION"
    :resource-id="notation.id"
    @close="showShareModal = false"
  />

  <DocumentEditorModal
    v-if="showDocModal"
    :title="docModalTitle"
    :file-id="docModalFileId"
    @saved="handleDocSaved"
    @close="handleDocModalClose"
  />
</template>

<style scoped>
.notation-canvas-area {
  position: relative;
  height: 100%;
  min-height: 0;
}

.notation-canvas-area__toolbar {
  position: absolute;
  top: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  pointer-events: none;
}

.notation-canvas-area__toolbar :deep(*) {
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
  z-index: 2000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  pointer-events: none;
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
  border: 1px solid rgba(220, 53, 69, 0.15);
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

.leave-dialog__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.json-viewer {
  margin: 0;
  padding: 12px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  line-height: 1.5;
  color: var(--base-text);
  overflow: auto;
  max-height: 400px;
  white-space: pre-wrap;
  word-break: break-all;
}

.notation-import-input {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>

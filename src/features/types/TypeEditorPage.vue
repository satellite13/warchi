<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTypeEditor } from './composables/useTypeEditor'
import { useTypeDocument } from './composables/useTypeDocument'
import { apiPost } from '@/composables/useApi'
import { serializeTypeAttrs, type CustomProperty } from '@/domain/attrs/notationAttrs'
import { useCanShare } from '@/composables/useCanShare'
import { useDirtySelectionGuard } from '@/composables/useDirtySelectionGuard'
import { useSaveErrorToast } from '@/composables/useSaveErrorToast'
import ListDetailEditorLayout from '@/components/layout/ListDetailEditorLayout.vue'
import UnsavedChangesModal from '@/components/modals/UnsavedChangesModal.vue'
import ShareAccessModal from '@/components/modals/ShareAccessModal.vue'
import BatchShareModal from '@/components/modals/BatchShareModal.vue'
import type { BatchShareItem } from '@/components/modals/BatchShareModal.vue'
import TypeSidebar from './components/TypeSidebar.vue'
import TypeForm from './components/TypeForm.vue'
import TypeAside from './components/TypeAside.vue'
import DocumentEditorModal from '@/components/modals/DocumentEditorModal.vue'
import SaveToast from '@/components/ui/SaveToast.vue'
import type { ShareResourceType } from '@/types/api'

const {
  currentUserId,
  nodeTypes,
  linkTypes,
  selectedType,
  selectedTypeId,
  isLoading,
  isSaving,
  saveError,
  selectedTypeOwnerName,
  loadAll,
  selectType,
  markTypeDirty,
  addType,
  saveType,
  deleteType,
  addCustomProperty,
  removeCustomProperty,
  typeUsages,
  isLoadingUsages,
  isDirty,
} = useTypeEditor()

const { documentFileId, loadDocument, resetDocument } = useTypeDocument()

const { t } = useI18n()

const isSelectedTypeWikiReadOnly = computed(() => {
  const item = selectedType.value
  if (!item || item._isNew) return false
  return item.accessPermission === 'VIEW'
})

const showTypeWikiToolbarButton = computed(() => {
  const item = selectedType.value
  if (!item) return false
  if (item._isNew) return true
  const hasDoc = !!(documentFileId.value ?? item.parsedAttrs.documentFileId)
  return item.accessPermission !== 'VIEW' || hasDoc
})

onMounted(() => {
  loadAll()
})

// Load document when selected type changes; register ref so type docs appear in wiki
watch(
  () => selectedTypeId.value,
  async (currentId, previousId) => {
    if (currentId === previousId) return
    const item = selectedType.value
    if (item && !item._isNew) {
      await loadDocument(item.parsedAttrs.documentFileId)
      const fileId = item.parsedAttrs.documentFileId
      if (fileId && item.id) {
        try {
          if (item.kind === 'node') {
            await apiPost<{ fileId: string; label: string }>('/documents', {
              fileId,
              nodeTypeId: item.id,
            })
          } else {
            await apiPost<{ fileId: string; label: string }>('/documents', {
              fileId,
              linkTypeId: item.id,
            })
          }
        } catch {
          // ref may already exist or permission issue; ignore
        }
      }
    } else {
      resetDocument()
    }
  }
)

const showDocModal = ref(false)

function openDocModal() {
  showDocModal.value = true
}

async function handleDocumentSavedFromModal(fileId: string) {
  if (!selectedType.value || isSelectedTypeWikiReadOnly.value) return
  if (selectedType.value.parsedAttrs.documentFileId !== fileId) {
    selectedType.value.parsedAttrs.documentFileId = fileId
    await saveType(selectedType.value)
  }
  const item = selectedType.value
  if (item.kind === 'node') {
    await apiPost<{ fileId: string; label: string }>('/documents', { fileId, nodeTypeId: item.id })
  } else {
    await apiPost<{ fileId: string; label: string }>('/documents', { fileId, linkTypeId: item.id })
  }
  showDocModal.value = false
}

async function handleSave() {
  if (!selectedType.value) return
  await saveType(selectedType.value)
}

async function handleDelete() {
  if (!selectedType.value) return
  await deleteType(selectedType.value)
}

function handleTypeNameUpdate(value: string) {
  if (!selectedType.value) return
  selectedType.value.name = value
  markTypeDirty(selectedType.value)
}

function handleMutateProperty(propertyId: string, apply: (p: CustomProperty) => void) {
  if (!selectedType.value) return
  const p = selectedType.value.parsedAttrs.customProperties?.find(cp => cp.id === propertyId)
  if (p) {
    apply(p)
    markTypeDirty(selectedType.value)
  }
}

function handleDefaultDirectoryPathUpdate(value: string) {
  if (!selectedType.value || selectedType.value.kind !== 'node') return
  const normalized = value.trim()
  if (!normalized) {
    delete selectedType.value.parsedAttrs.defaultDirectoryPath
    markTypeDirty(selectedType.value)
    return
  }
  selectedType.value.parsedAttrs.defaultDirectoryPath = normalized
  markTypeDirty(selectedType.value)
}

function handleIconUpdate(value: string) {
  if (!selectedType.value || selectedType.value.kind !== 'node') return
  const normalized = value.trim()
  if (!normalized) {
    delete selectedType.value.parsedAttrs.icon
    markTypeDirty(selectedType.value)
    return
  }
  selectedType.value.parsedAttrs.icon = normalized
  markTypeDirty(selectedType.value)
}

const {
  showUnsavedDialog,
  requestSelect,
  requestAdd,
  discardAndContinue,
  cancelSwitch,
} = useDirtySelectionGuard({ isDirty })

function handleSelectType(id: string) {
  if (selectedType.value?.id === id) return
  requestSelect(id, selectType)
}

function handleAddType(kind: 'node' | 'link') {
  requestAdd(`__add_${kind}`, () => addType(kind))
}

function discardAndSwitch() {
  discardAndContinue({
    onSelect: selectType,
    onAdd: token => addType(token.replace('__add_', '') as 'node' | 'link'),
  })
}

const isTypeInUse = computed(() => typeUsages.value.length > 0)
const { canShare: canShareBase } = useCanShare(selectedType)
const canShareSelectedType = computed(() => canShareBase.value && !selectedType.value?._isNew)
const shareResourceType = computed<ShareResourceType>(() =>
  selectedType.value?.kind === 'link' ? 'LINK_TYPE' : 'NODE_TYPE'
)
const showShareModal = ref(false)

const { isToastVisible, toastError } = useSaveErrorToast(saveError)

// --- JSON preview ---
const attrsJson = computed(() => {
  if (!selectedType.value) return ''
  const raw = serializeTypeAttrs(selectedType.value.parsedAttrs)
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
})

// --- Batch selection mode ---
const selectionMode = ref(false)
const checkedTypeIds = ref(new Set<string>())
const showBatchShareModal = ref(false)

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    checkedTypeIds.value = new Set()
  }
}

function toggleCheck(id: string) {
  const next = new Set(checkedTypeIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  checkedTypeIds.value = next
}

const batchShareItems = computed<BatchShareItem[]>(() => {
  const items: BatchShareItem[] = []
  for (const id of checkedTypeIds.value) {
    const nodeType = nodeTypes.value.find(t => t.id === id)
    if (nodeType) {
      items.push({ id: nodeType.id, name: nodeType.name, resourceType: 'NODE_TYPE' })
      continue
    }
    const linkType = linkTypes.value.find(t => t.id === id)
    if (linkType) {
      items.push({ id: linkType.id, name: linkType.name, resourceType: 'LINK_TYPE' })
    }
  }
  return items
})

function handleBatchShare() {
  if (batchShareItems.value.length === 0) return
  showBatchShareModal.value = true
}

function handleBatchShareDone() {
  showBatchShareModal.value = false
  selectionMode.value = false
  checkedTypeIds.value = new Set()
}
</script>

<template>
  <ListDetailEditorLayout
    :has-selection="!!selectedType"
    empty-icon="edit_note"
    :empty-title="t('types.selectTypeToEdit')"
    :empty-hint="t('types.orCreateNew')"
  >
    <template #sidebar>
      <TypeSidebar
        :node-types="nodeTypes"
        :link-types="linkTypes"
        :current-user-id="currentUserId"
        :selected-type-id="selectedType?.id ?? null"
        :is-loading="isLoading"
        :selection-mode="selectionMode"
        :checked-ids="checkedTypeIds"
        @select-type="handleSelectType"
        @add-type="handleAddType"
        @toggle-selection-mode="toggleSelectionMode"
        @toggle-check="toggleCheck"
        @batch-share="handleBatchShare"
      />
    </template>

    <TypeForm
      v-if="selectedType"
      :selected-type="selectedType"
      :owner-display-name="selectedTypeOwnerName"
      :is-dirty="isDirty"
      :is-saving="isSaving"
      :is-type-in-use="isTypeInUse"
      :can-share="canShareSelectedType"
      :has-doc="!!documentFileId"
      :show-doc-button="showTypeWikiToolbarButton"
      @save="handleSave"
      @delete="handleDelete"
      @open-doc="openDocModal"
      @update-name="handleTypeNameUpdate"
      @update-default-directory-path="handleDefaultDirectoryPathUpdate"
      @update-icon="handleIconUpdate"
      :on-mutate-property="handleMutateProperty"
      @add-property="addCustomProperty(selectedType)"
      @remove-property="removeCustomProperty(selectedType, $event)"
      @share="showShareModal = true"
    />

    <template v-if="selectedType" #aside>
      <TypeAside
        :attrs-json="attrsJson"
        :type-usages="typeUsages"
        :is-loading-usages="isLoadingUsages"
        :is-new-type="!!selectedType._isNew"
        :type-kind="selectedType.kind"
      />
    </template>

    <template #modals>
      <UnsavedChangesModal
        v-if="showUnsavedDialog"
        :title="t('types.unsavedChangesTitle')"
        :message="t('types.unsavedChangesText')"
        :stay-label="t('types.stay')"
        :confirm-label="t('types.discardAndSwitch')"
        @stay="cancelSwitch"
        @confirm="discardAndSwitch"
        @close="cancelSwitch"
      />

      <ShareAccessModal
        v-if="showShareModal && selectedType"
        :title="t('types.accessTitle')"
        :resource-type="shareResourceType"
        :resource-id="selectedType.id"
        @close="showShareModal = false"
      />

      <BatchShareModal
        v-if="showBatchShareModal && batchShareItems.length > 0"
        :items="batchShareItems"
        @close="showBatchShareModal = false"
        @done="handleBatchShareDone"
      />

      <DocumentEditorModal
        v-if="showDocModal && selectedType"
        :title="selectedType.name"
        :file-id="documentFileId ?? selectedType.parsedAttrs.documentFileId ?? null"
        :read-only="isSelectedTypeWikiReadOnly"
        @close="showDocModal = false"
        @saved="handleDocumentSavedFromModal"
      />
    </template>

    <template #toast>
      <SaveToast :error="isToastVisible ? toastError : null" />
    </template>
  </ListDetailEditorLayout>
</template>

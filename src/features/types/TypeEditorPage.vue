<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTypeEditor } from './composables/useTypeEditor'
import { useTypeDocument } from './composables/useTypeDocument'
import { apiPost } from '../../composables/useApi'
import { serializeTypeAttrs, type CustomProperty } from '../notations/notationAttrs'
import { useCanShare } from '../../composables/useCanShare'
import BaseModal from '../../components/modals/BaseModal.vue'
import ShareAccessModal from '../../components/modals/ShareAccessModal.vue'
import TypeSidebar from './components/TypeSidebar.vue'
import TypeForm from './components/TypeForm.vue'
import TypeAside from './components/TypeAside.vue'
import DocumentEditorModal from '../../components/modals/DocumentEditorModal.vue'
import type { ShareResourceType } from '../../types/api'

const {
  currentUserId,
  nodeTypes,
  linkTypes,
  selectedType,
  selectedTypeId,
  isLoading,
  isSaving,
  saveError,
  ownerDisplayNames,
  loadAll,
  selectType,
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
  if (!selectedType.value) return
  if (!selectedType.value.parsedAttrs.documentFileId) {
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
}

function handleMutateProperty(propertyId: string, apply: (p: CustomProperty) => void) {
  if (!selectedType.value) return
  const p = selectedType.value.parsedAttrs.customProperties?.find(cp => cp.id === propertyId)
  if (p) apply(p)
}

function handleDefaultDirectoryPathUpdate(value: string) {
  if (!selectedType.value || selectedType.value.kind !== 'node') return
  const normalized = value.trim()
  if (!normalized) {
    delete selectedType.value.parsedAttrs.defaultDirectoryPath
    return
  }
  selectedType.value.parsedAttrs.defaultDirectoryPath = normalized
}

function handleIconUpdate(value: string) {
  if (!selectedType.value || selectedType.value.kind !== 'node') return
  const normalized = value.trim()
  if (!normalized) {
    delete selectedType.value.parsedAttrs.icon
    return
  }
  selectedType.value.parsedAttrs.icon = normalized
}

// --- Unsaved changes dialog ---
const pendingSelectId = ref<string | null>(null)
const showUnsavedDialog = ref(false)

function handleSelectType(id: string) {
  if (selectedType.value?.id === id) return
  if (isDirty.value) {
    pendingSelectId.value = id
    showUnsavedDialog.value = true
  } else {
    selectType(id)
  }
}

function handleAddType(kind: 'node' | 'link') {
  if (isDirty.value) {
    pendingSelectId.value = `__add_${kind}`
    showUnsavedDialog.value = true
  } else {
    addType(kind)
  }
}

function discardAndSwitch() {
  showUnsavedDialog.value = false
  const pending = pendingSelectId.value
  pendingSelectId.value = null
  if (pending?.startsWith('__add_')) {
    addType(pending.replace('__add_', '') as 'node' | 'link')
  } else if (pending) {
    selectType(pending)
  }
}

function cancelSwitch() {
  showUnsavedDialog.value = false
  pendingSelectId.value = null
}

const isTypeInUse = computed(() => typeUsages.value.length > 0)
const currentUserObj = computed(() => (currentUserId.value ? { id: currentUserId.value } : null))
const { canShare: canShareBase } = useCanShare(selectedType, currentUserObj)
const canShareSelectedType = computed(() => canShareBase.value && !selectedType.value?._isNew)
const shareResourceType = computed<ShareResourceType>(() =>
  selectedType.value?.kind === 'link' ? 'LINK_TYPE' : 'NODE_TYPE'
)
const showShareModal = ref(false)
const selectedTypeOwnerName = computed(() => {
  const type = selectedType.value
  if (!type) return t('common.unknownUser')
  return ownerDisplayNames.value.get(type.ownerId) ?? t('common.unknownUser')
})

const toastError = ref<string | null>(null)
const isToastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

watch(saveError, value => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }

  if (!value) {
    isToastVisible.value = false
    toastError.value = null
    return
  }

  toastError.value = value
  isToastVisible.value = true
  toastTimer = setTimeout(() => {
    isToastVisible.value = false
  }, 5000)
})

onBeforeUnmount(() => {
  if (!toastTimer) return
  clearTimeout(toastTimer)
  toastTimer = null
})

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
</script>

<template>
  <div class="type-editor">
    <!-- Left panel: type lists -->
    <TypeSidebar
      :node-types="nodeTypes"
      :link-types="linkTypes"
      :current-user-id="currentUserId"
      :selected-type-id="selectedType?.id ?? null"
      :is-loading="isLoading"
      @select-type="handleSelectType"
      @add-type="handleAddType"
    />

    <!-- Center + Right panels -->
    <main class="type-editor__main">
      <div v-if="!selectedType" class="type-editor__empty">
        <div class="empty-state">
          <UiIcon name="edit_note" class="empty-state__icon" />
          <p class="empty-state__text">{{ t('types.selectTypeToEdit') }}</p>
          <p class="empty-state__hint">{{ t('types.orCreateNew') }}</p>
        </div>
      </div>

      <template v-else>
        <div class="type-editor__content">
          <div class="type-editor__center">
            <TypeForm
              :selected-type="selectedType"
              :owner-display-name="selectedTypeOwnerName"
              :is-dirty="isDirty"
              :is-saving="isSaving"
              :is-type-in-use="isTypeInUse"
              :can-share="canShareSelectedType"
              :has-doc="!!documentFileId"
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
          </div>

          <TypeAside
            :attrs-json="attrsJson"
            :type-usages="typeUsages"
            :is-loading-usages="isLoadingUsages"
            :is-new-type="!!selectedType._isNew"
            :type-kind="selectedType.kind"
          />
        </div>
      </template>
    </main>

    <!-- Unsaved changes dialog -->
    <BaseModal
      v-if="showUnsavedDialog"
      :title="t('types.unsavedChangesTitle')"
      max-width="400px"
      @close="cancelSwitch"
    >
      <p class="unsaved-dialog__text">{{ t('types.unsavedChangesText') }}</p>
      <template #footer>
        <button type="button" class="btn btn--secondary" @click="cancelSwitch">
          {{ t('types.stay') }}
        </button>
        <button type="button" class="btn btn--danger" @click="discardAndSwitch">
          {{ t('types.discardAndSwitch') }}
        </button>
      </template>
    </BaseModal>

    <Teleport to="body">
      <Transition name="toast">
        <div v-if="isToastVisible && toastError" class="save-toast save-toast--error">
          <UiIcon name="error" class="save-toast__icon" />
          <span>{{ toastError }}</span>
        </div>
      </Transition>
    </Teleport>

    <ShareAccessModal
      v-if="showShareModal && selectedType"
      :title="t('types.accessTitle')"
      :resource-type="shareResourceType"
      :resource-id="selectedType.id"
      @close="showShareModal = false"
    />

    <DocumentEditorModal
      v-if="showDocModal && selectedType"
      :title="selectedType.name"
      :file-id="documentFileId ?? selectedType.parsedAttrs.documentFileId ?? null"
      @close="showDocModal = false"
      @saved="handleDocumentSavedFromModal"
    />
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Layout */
.type-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

/* Main area */
.type-editor__main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 36px;
}

.type-editor__content {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  animation: fadeIn 0.25s ease;
}

.type-editor__center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Empty state */
.type-editor__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: fadeIn 0.4s ease;
}

.empty-state__icon {
  width: 56px;
  height: 56px;
  color: var(--border-strong);
  margin-bottom: 4px;
}

.empty-state__text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
}

.empty-state__hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-subtle);
}

/* Unsaved dialog */
.unsaved-dialog__text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
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

.save-toast--error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger-soft);
}

.save-toast__icon {
  width: 20px;
  height: 20px;
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
</style>

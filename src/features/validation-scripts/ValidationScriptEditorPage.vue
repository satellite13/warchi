<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useValidationScripts } from '@/composables/useValidationScripts'
import type { ValidationScriptResponse } from '@/types/api'
import BaseModal from '@/components/modals/BaseModal.vue'
import ShareAccessModal from '@/components/modals/ShareAccessModal.vue'
import UnsavedChangesModal from '@/components/modals/UnsavedChangesModal.vue'
import ListDetailEditorLayout from '@/components/layout/ListDetailEditorLayout.vue'
import SaveToast from '@/components/ui/SaveToast.vue'
import EditorFormHeader from '@/components/forms/EditorFormHeader.vue'
import ValidationScriptSidebar from './components/ValidationScriptSidebar.vue'
import ValidationScriptCodeEditor from './components/ValidationScriptCodeEditor.vue'
import ValidationScriptApiHelpPanel from './components/ValidationScriptApiHelpPanel.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useAuth } from '@/composables/useAuth'
import { useDirtySelectionGuard } from '@/composables/useDirtySelectionGuard'
import { useSaveErrorToast } from '@/composables/useSaveErrorToast'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import {
  resolveOwnerDisplayNames,
  resolveOwnerLabel,
} from '@/utils/resolveOwnerNames'

const DEFAULT_VALIDATION_SCRIPT_SOURCE = '// Script\n'

const { t } = useI18n()
const { list, isLoading, fetchList, fetchById, create, update, remove } = useValidationScripts()

const selectedScriptId = ref<string | null>(null)
const selectedDetail = ref<ValidationScriptResponse | null>(null)
const isSaving = ref(false)
const isDeleting = ref(false)
const saveError = ref<string | null>(null)
const localName = ref('')
const localDescription = ref('')
const localSource = ref(DEFAULT_VALIDATION_SCRIPT_SOURCE)
const showDeleteConfirm = ref(false)
const showShareModal = ref(false)
const { checkPermission } = usePermissions()
const { currentUser } = useAuth()

const canEditSelected = computed(() => {
  const detail = selectedDetail.value
  if (!detail) return false
  if (canEditByAccessPermission(detail.accessPermission)) return true
  const userId = currentUser.value?.id
  return !!userId && detail.ownerId === userId
})
const canShareSelected = ref(false)
const ownerDisplayNames = ref(new Map<string, string>())

async function loadOwnerDisplayNames(ownerIds: string[]): Promise<void> {
  ownerDisplayNames.value = await resolveOwnerDisplayNames(
    ownerIds,
    ownerDisplayNames.value,
    currentUser.value,
    t('common.unknownUser'),
  )
}

const selectedScriptOwnerName = computed(() => {
  const detail = selectedDetail.value
  const fallback = t('common.unknownUser')
  if (!detail?.ownerId) return fallback
  return resolveOwnerLabel(
    ownerDisplayNames.value,
    detail.ownerId,
    currentUser.value,
    fallback,
  )
})

const isDirty = computed(() => {
  const detail = selectedDetail.value
  if (!detail) return false
  if (localName.value !== (detail.name ?? '')) return true
  if (localDescription.value !== (detail.description ?? '')) return true
  if (localSource.value !== (detail.source ?? DEFAULT_VALIDATION_SCRIPT_SOURCE)) return true
  return false
})

const canSave = computed(() => {
  return (
    !!selectedDetail.value &&
    canEditSelected.value &&
    localName.value.trim().length > 0 &&
    localSource.value.trim().length > 0 &&
    isDirty.value
  )
})

function applyDetailToLocal(detail: ValidationScriptResponse) {
  localName.value = detail.name
  localDescription.value = detail.description ?? ''
  localSource.value = detail.source || DEFAULT_VALIDATION_SCRIPT_SOURCE
}

onMounted(() => {
  fetchList({ size: 200 }).then(async (ok) => {
    if (!ok) {
      saveError.value = t('validationScripts.errorLoad')
      return
    }
    await loadOwnerDisplayNames(list.value.map((script) => script.ownerId))
  })
})

watch(selectedScriptId, async (id) => {
  selectedDetail.value = null
  localName.value = ''
  localDescription.value = ''
  localSource.value = DEFAULT_VALIDATION_SCRIPT_SOURCE
  canShareSelected.value = false
  if (!id) return
  const detail = await fetchById(id)
  selectedDetail.value = detail
  if (detail) {
    applyDetailToLocal(detail)
    await loadOwnerDisplayNames([detail.ownerId])
    canShareSelected.value = await checkPermission({
      resourceType: 'VALIDATION_SCRIPT',
      resourceId: detail.id,
      action: 'MANAGE',
    })
  }
})

const {
  showUnsavedDialog,
  requestSelect,
  requestAdd,
  discardAndContinue,
  cancelSwitch,
} = useDirtySelectionGuard({ isDirty })

function applySelect(id: string) {
  selectedScriptId.value = id
}

async function createAndSelectScript() {
  saveError.value = null
  const created = await create({
    name: t('validationScripts.defaultName'),
    description: '',
    source: DEFAULT_VALIDATION_SCRIPT_SOURCE,
  })
  if (created) {
    await fetchList({ size: 200 })
    await loadOwnerDisplayNames(list.value.map((script) => script.ownerId))
    selectedScriptId.value = created.id
    selectedDetail.value = created
    applyDetailToLocal(created)
    canShareSelected.value = await checkPermission({
      resourceType: 'VALIDATION_SCRIPT',
      resourceId: created.id,
      action: 'MANAGE',
    })
  } else {
    saveError.value = t('validationScripts.errorSave')
  }
}

function handleSelect(id: string) {
  if (selectedScriptId.value === id) return
  requestSelect(id, applySelect)
}

function handleAdd() {
  requestAdd('__add_validation_script', () => {
    void createAndSelectScript()
  })
}

function discardAndSwitch() {
  discardAndContinue({
    onSelect: applySelect,
    onAdd: () => {
      void createAndSelectScript()
    },
  })
}

async function handleSave() {
  if (!selectedDetail.value || !canEditSelected.value) return
  saveError.value = null
  isSaving.value = true
  const updated = await update(selectedDetail.value.id, {
    name: localName.value.trim(),
    description: localDescription.value.trim() || null,
    source: localSource.value,
  })
  isSaving.value = false
  if (updated) {
    selectedDetail.value = updated
    applyDetailToLocal(updated)
    const idx = list.value.findIndex((s) => s.id === updated.id)
    if (idx >= 0) {
      list.value = [
        ...list.value.slice(0, idx),
        updated,
        ...list.value.slice(idx + 1),
      ]
    }
  } else {
    saveError.value = t('validationScripts.errorSave')
  }
}

function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!selectedDetail.value || !canEditSelected.value) return
  showDeleteConfirm.value = false
  isDeleting.value = true
  saveError.value = null
  const ok = await remove(selectedDetail.value.id)
  isDeleting.value = false
  if (ok) {
    selectedScriptId.value = null
    selectedDetail.value = null
    await fetchList({ size: 200 })
  } else {
    saveError.value = t('validationScripts.errorDelete')
  }
}

const { isToastVisible, toastError } = useSaveErrorToast(saveError)
</script>

<template>
  <ListDetailEditorLayout
    class="script-editor-layout"
    :has-selection="!!selectedDetail"
    empty-icon="code"
    :empty-title="t('validationScripts.selectScript')"
    :empty-hint="t('validationScripts.orCreateNew')"
  >
    <template #sidebar>
      <ValidationScriptSidebar
        :scripts="list"
        :selected-script-id="selectedScriptId"
        :is-loading="isLoading"
        @select-script="handleSelect"
        @add-script="handleAdd"
      />
    </template>

    <div v-if="selectedDetail" class="script-editor">
      <EditorFormHeader
        :title="localName || t('validationScripts.title')"
        icon="terminal"
        help-docs-section="validationScripts"
        :help-title="t('validationScripts.helpTitle')"
        :is-dirty="isDirty"
        :is-saving="isSaving"
        :is-deleting="isDeleting"
        :can-edit="canEditSelected"
        :can-share="canShareSelected"
        :show-doc-button="false"
        :show-unsaved-badge="false"
        :save-disabled="isSaving || isDeleting || !canSave"
        @save="handleSave"
        @delete="openDeleteConfirm"
        @share="showShareModal = true"
      />

      <p v-if="!canEditSelected" class="script-editor__banner">
        {{ t('validationScripts.noEditRights') }}
      </p>

      <div class="script-editor__meta">
        <label class="script-editor__field script-editor__field--name">
          <span class="script-editor__label">{{ t('common.name') }}</span>
          <input
            v-model="localName"
            class="form-input"
            :placeholder="t('validationScripts.nameLabel')"
            :disabled="!canEditSelected"
          />
        </label>
        <label class="script-editor__field script-editor__field--desc">
          <span class="script-editor__label">{{ t('validationScripts.descriptionLabel') }}</span>
          <input
            v-model="localDescription"
            class="form-input"
            :placeholder="t('validationScripts.descriptionPlaceholder')"
            :disabled="!canEditSelected"
          />
        </label>
        <div class="script-editor__author" :title="t('common.author')">
          <UiIcon name="person" class="script-editor__author-icon" />
          <span>{{ selectedScriptOwnerName }}</span>
        </div>
      </div>

      <div class="script-editor__workspace">
        <section class="script-editor__code-panel">
          <div class="script-editor__code-bar">
            <span class="script-editor__code-lang">JavaScript</span>
            <span class="script-editor__code-hint">{{ t('validationScripts.sourceHint') }}</span>
          </div>
          <ValidationScriptCodeEditor
            v-model="localSource"
            class="script-editor__code"
            :readonly="!canEditSelected"
          />
        </section>
        <ValidationScriptApiHelpPanel class="script-editor__api-help" />
      </div>
    </div>

    <template #modals>
      <UnsavedChangesModal
        v-if="showUnsavedDialog"
        :title="t('validationScripts.unsavedChangesTitle')"
        :message="t('validationScripts.unsavedChangesText')"
        :stay-label="t('validationScripts.stay')"
        :confirm-label="t('validationScripts.discardAndSwitch')"
        @stay="cancelSwitch"
        @confirm="discardAndSwitch"
        @close="cancelSwitch"
      />

      <ShareAccessModal
        v-if="showShareModal && selectedDetail"
        :title="t('validationScripts.accessTitle')"
        resource-type="VALIDATION_SCRIPT"
        :resource-id="selectedDetail.id"
        @close="showShareModal = false"
      />

      <BaseModal
        v-if="showDeleteConfirm"
        :title="t('validationScripts.delete')"
        max-width="400px"
        @close="showDeleteConfirm = false"
      >
        <p class="script-editor__delete-text">
          {{ t('validationScripts.deleteConfirm', { name: selectedDetail?.name ?? '' }) }}
        </p>
        <template #footer>
          <button type="button" class="btn btn--secondary" @click="showDeleteConfirm = false">
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="btn btn--danger" @click="confirmDelete">
            {{ t('common.delete') }}
          </button>
        </template>
      </BaseModal>
    </template>

    <template #toast>
      <SaveToast :error="isToastVisible ? toastError : null" />
    </template>
  </ListDetailEditorLayout>
</template>

<style scoped>
/* Fill the list-detail main pane so the code editor can use remaining height. */
.script-editor-layout :deep(.ldel__main) {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 20px;
}

.script-editor-layout :deep(.ldel__content) {
  flex: 1;
  min-height: 0;
  align-items: stretch;
  gap: 0;
}

.script-editor-layout :deep(.ldel__center) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.script-editor-layout :deep(.ldel__empty) {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.script-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.script-editor__banner {
  margin: 0;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.script-editor__meta {
  display: grid;
  grid-template-columns: minmax(160px, 0.9fr) minmax(220px, 1.4fr) auto;
  gap: 12px;
  align-items: end;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

@media (max-width: 960px) {
  .script-editor__meta {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

.script-editor__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.script-editor__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.script-editor__author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 2px 2px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.script-editor__author-icon {
  width: 16px;
  height: 16px;
  color: var(--text-subtle);
}

.script-editor__workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  background: var(--surface);
}

@media (max-width: 1100px) {
  .script-editor__workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(180px, 40%);
  }

  .script-editor__api-help {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

.script-editor__code-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.script-editor__api-help {
  min-height: 0;
}

.script-editor__code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-muted);
}

.script-editor__code-lang {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--primary);
}

.script-editor__code-hint {
  font-size: 12px;
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-editor__code {
  flex: 1;
  min-height: 0;
}

.script-editor__delete-text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>

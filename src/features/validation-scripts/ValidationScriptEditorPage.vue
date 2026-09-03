<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import ShareAccessModal from '@/components/modals/ShareAccessModal.vue'
import UnsavedChangesModal from '@/components/modals/UnsavedChangesModal.vue'
import ListDetailEditorLayout from '@/components/layout/ListDetailEditorLayout.vue'
import SaveToast from '@/components/ui/SaveToast.vue'
import ValidationScriptSidebar from './components/ValidationScriptSidebar.vue'
import ValidationScriptForm from './components/ValidationScriptForm.vue'
import { useValidationScriptEditor } from './composables/useValidationScriptEditor'

const { t } = useI18n()
const {
  list,
  isLoading,
  selectedScriptId,
  selectedDetail,
  isSaving,
  isDeleting,
  localName,
  localDescription,
  localSource,
  showDeleteConfirm,
  showShareModal,
  canShareSelected,
  canEditSelected,
  selectedScriptOwnerName,
  isDirty,
  canSave,
  showUnsavedDialog,
  isToastVisible,
  toastError,
  handleSelect,
  handleAdd,
  discardAndSwitch,
  cancelSwitch,
  handleSave,
  openDeleteConfirm,
  confirmDelete,
} = useValidationScriptEditor()
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

    <ValidationScriptForm
      v-if="selectedDetail"
      :name="localName"
      :description="localDescription"
      :source="localSource"
      :owner-display-name="selectedScriptOwnerName"
      :can-edit="canEditSelected"
      :can-share="canShareSelected"
      :is-dirty="isDirty"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :can-save="canSave"
      @save="handleSave"
      @delete="openDeleteConfirm"
      @share="showShareModal = true"
      @update:name="localName = $event"
      @update:description="localDescription = $event"
      @update:source="localSource = $event"
    />

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

.script-editor__delete-text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>

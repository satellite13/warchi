<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import DocumentEditorModal from '@/components/modals/DocumentEditorModal.vue'
import ShareAccessModal from '@/components/modals/ShareAccessModal.vue'
import UnsavedChangesModal from '@/components/modals/UnsavedChangesModal.vue'
import ListDetailEditorLayout from '@/components/layout/ListDetailEditorLayout.vue'
import SaveToast from '@/components/ui/SaveToast.vue'
import ShapeSidebar from './components/ShapeSidebar.vue'
import ShapeForm from './components/ShapeForm.vue'
import { useShapeEditor } from './composables/useShapeEditor'

const { t } = useI18n()
const {
  list,
  isLoading,
  selectedShapeId,
  selectedDetail,
  isSaving,
  isDeleting,
  localName,
  localOutline,
  localScaleSlice,
  scaleSliceEnabled,
  showDeleteConfirm,
  showShareModal,
  showDocModal,
  docModalFileId,
  canShareSelected,
  canEditSelected,
  selectedShapeOwnerName,
  isDirty,
  showUnsavedDialog,
  isToastVisible,
  toastError,
  handleSelect,
  handleAdd,
  discardAndSwitch,
  cancelSwitch,
  handleSave,
  handleScaleSliceEnabled,
  getShapeDocFileId,
  openDocModal,
  handleDocSaved,
  handleDocModalClose,
  openDeleteConfirm,
  confirmDelete,
} = useShapeEditor()
</script>

<template>
  <ListDetailEditorLayout
    :has-selection="!!selectedDetail"
    empty-icon="hexagon"
    :empty-title="t('shapes.selectShape')"
    :empty-hint="t('shapes.orCreateNew')"
  >
    <template #sidebar>
      <ShapeSidebar
        :shapes="list"
        :selected-shape-id="selectedShapeId"
        :is-loading="isLoading"
        @select-shape="handleSelect"
        @add-shape="handleAdd"
      />
    </template>

    <ShapeForm
      v-if="selectedDetail"
      :selected-shape="selectedDetail"
      :name="localName"
      :outline="localOutline"
      :scale-slice="localScaleSlice"
      :scale-slice-enabled="scaleSliceEnabled"
      :owner-display-name="selectedShapeOwnerName"
      :can-edit="canEditSelected"
      :can-share="canShareSelected"
      :is-dirty="isDirty"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :has-doc="!!getShapeDocFileId()"
      @save="handleSave"
      @delete="openDeleteConfirm"
      @share="showShareModal = true"
      @open-doc="openDocModal"
      @update:name="localName = $event"
      @update:outline="localOutline = $event"
      @update:scale-slice="localScaleSlice = $event"
      @update:scale-slice-enabled="handleScaleSliceEnabled"
    />

    <template #modals>
      <UnsavedChangesModal
        v-if="showUnsavedDialog"
        :title="t('shapes.unsavedChangesTitle')"
        :message="t('shapes.unsavedChangesText')"
        :stay-label="t('shapes.stay')"
        :confirm-label="t('shapes.discardAndSwitch')"
        @stay="cancelSwitch"
        @confirm="discardAndSwitch"
        @close="cancelSwitch"
      />

      <DocumentEditorModal
        v-if="showDocModal && selectedDetail"
        :title="selectedDetail.name"
        :file-id="docModalFileId"
        :read-only="!canEditSelected"
        @close="handleDocModalClose"
        @saved="handleDocSaved"
      />

      <ShareAccessModal
        v-if="showShareModal && selectedDetail"
        :title="t('shapes.accessTitle')"
        resource-type="NODE_SHAPE"
        :resource-id="selectedDetail.id"
        @close="showShareModal = false"
      />

      <BaseModal
        v-if="showDeleteConfirm"
        :title="t('shapes.delete')"
        max-width="400px"
        @close="showDeleteConfirm = false"
      >
        <p class="shape-editor__delete-text">
          {{ t('shapes.deleteConfirm', { name: selectedDetail?.name ?? '' }) }}
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
.shape-editor__delete-text {
  margin: 0;
  font-size: 14px;
  color: var(--base-text);
  line-height: 1.55;
}
</style>

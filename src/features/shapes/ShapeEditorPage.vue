<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useNodeShapes } from "@/composables/useNodeShapes"
import type { NodeShapeResponse } from "@/types/api"
import { DEFAULT_RECTANGLE_OUTLINE } from "@/domain/attrs/notationAttrs"
import type { OutlineSegment } from "@/domain/attrs/notationAttrs"
import BaseModal from "@/components/modals/BaseModal.vue"
import DocumentEditorModal from "@/components/modals/DocumentEditorModal.vue"
import ShareAccessModal from "@/components/modals/ShareAccessModal.vue"
import UnsavedChangesModal from "@/components/modals/UnsavedChangesModal.vue"
import ListDetailEditorLayout from "@/components/layout/ListDetailEditorLayout.vue"
import SaveToast from "@/components/ui/SaveToast.vue"
import ShapeSidebar from "./components/ShapeSidebar.vue"
import ShapeForm from "./components/ShapeForm.vue"
import { apiPost } from "@/composables/useApi"
import { usePermissions } from "@/composables/usePermissions"
import { useAuth } from "@/composables/useAuth"
import { useDirtySelectionGuard } from "@/composables/useDirtySelectionGuard"
import { useSaveErrorToast } from "@/composables/useSaveErrorToast"
import { canEditByAccessPermission } from "@/utils/accessPermission"
import {
  resolveOwnerDisplayNames,
  resolveOwnerLabel,
} from "@/utils/resolveOwnerNames"

const { t } = useI18n()
const {
  list,
  isLoading,
  fetchList,
  fetchById,
  create,
  update,
  remove
} = useNodeShapes()

const selectedShapeId = ref<string | null>(null)
const selectedDetail = ref<NodeShapeResponse | null>(null)
const isSaving = ref(false)
const isDeleting = ref(false)
const saveError = ref<string | null>(null)
const localName = ref("")
const localOutline = ref<OutlineSegment[]>([])
const showDeleteConfirm = ref(false)
const showShareModal = ref(false)
const { checkPermission } = usePermissions()
const { currentUser } = useAuth()

function parseOutlineJson(json: string | null): OutlineSegment[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? (parsed as OutlineSegment[]) : []
  } catch {
    return []
  }
}

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
    t("common.unknownUser")
  )
}

const selectedShapeOwnerName = computed(() => {
  const detail = selectedDetail.value
  const fallback = t("common.unknownUser")
  if (!detail?.ownerId) return fallback
  return resolveOwnerLabel(
    ownerDisplayNames.value,
    detail.ownerId,
    currentUser.value,
    fallback
  )
})

/** Есть несохранённые изменения относительно данных с сервера */
const isDirty = computed(() => {
  const detail = selectedDetail.value
  if (!detail) return false
  const savedName = detail.name ?? ""
  const savedOutline = parseOutlineJson(detail.outline)
  if (localName.value !== savedName) return true
  return JSON.stringify(localOutline.value) !== JSON.stringify(savedOutline)
})

onMounted(() => {
  fetchList({ size: 200 }).then(async (ok) => {
    if (!ok) {
      saveError.value = t("shapes.errorLoad")
      return
    }
    await loadOwnerDisplayNames(list.value.map((shape) => shape.ownerId))
  })
})

watch(selectedShapeId, async (id) => {
  selectedDetail.value = null
  localName.value = ""
  localOutline.value = []
  canShareSelected.value = false
  if (!id) return
  const detail = await fetchById(id)
  selectedDetail.value = detail
  if (detail) {
    localName.value = detail.name
    localOutline.value = parseOutlineJson(detail.outline).length
      ? parseOutlineJson(detail.outline)
      : [...DEFAULT_RECTANGLE_OUTLINE]
    await loadOwnerDisplayNames([detail.ownerId])
    canShareSelected.value = await checkPermission({
      resourceType: 'NODE_SHAPE',
      resourceId: detail.id,
      action: 'MANAGE',
    })
  } else {
    canShareSelected.value = false
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
  selectedShapeId.value = id
}

async function createAndSelectShape() {
  saveError.value = null
  const outlineJson = JSON.stringify(DEFAULT_RECTANGLE_OUTLINE)
  const created = await create({
    name: t("shapes.addShape"),
    outline: outlineJson
  })
  if (created) {
    await fetchList({ size: 200 })
    await loadOwnerDisplayNames(list.value.map((shape) => shape.ownerId))
    selectedShapeId.value = created.id
    selectedDetail.value = created
    localName.value = created.name
    localOutline.value =
      parseOutlineJson(created.outline).length > 0
        ? parseOutlineJson(created.outline)
        : [...DEFAULT_RECTANGLE_OUTLINE]
  } else {
    saveError.value = t("shapes.errorSave")
  }
}

function handleSelect(id: string) {
  if (selectedShapeId.value === id) return
  requestSelect(id, applySelect)
}

function handleAdd() {
  requestAdd('__add_shape', () => {
    void createAndSelectShape()
  })
}

function discardAndSwitch() {
  discardAndContinue({
    onSelect: applySelect,
    onAdd: () => {
      void createAndSelectShape()
    },
  })
}

async function handleSave() {
  if (!selectedDetail.value || !canEditSelected.value) return
  saveError.value = null
  isSaving.value = true
  const updated = await update(selectedDetail.value.id, {
    name: localName.value.trim() || selectedDetail.value.name,
    outline: JSON.stringify(localOutline.value),
    attrs: selectedDetail.value.attrs ?? undefined
  })
  isSaving.value = false
  if (updated) {
    selectedDetail.value = updated
    const idx = list.value.findIndex((s) => s.id === updated.id)
    if (idx >= 0) {
      list.value = [
        ...list.value.slice(0, idx),
        updated,
        ...list.value.slice(idx + 1)
      ]
    }
  } else {
    saveError.value = t("shapes.errorSave")
  }
}

function getShapeDocFileId(): string | null {
  const raw = selectedDetail.value?.attrs
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return typeof parsed.documentFileId === 'string' ? parsed.documentFileId : null
  } catch {
    return null
  }
}

function setShapeDocFileId(fileId: string) {
  if (!selectedDetail.value) return
  const raw = selectedDetail.value.attrs
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      parsed = {}
    }
  }
  parsed.documentFileId = fileId
  selectedDetail.value = { ...selectedDetail.value, attrs: JSON.stringify(parsed) }
}

const showDocModal = ref(false)
const docModalFileId = ref<string | null>(null)

function openDocModal() {
  docModalFileId.value = getShapeDocFileId()
  showDocModal.value = true
}

async function handleDocSaved(fileId: string) {
  if (!selectedDetail.value || !canEditSelected.value) return
  setShapeDocFileId(fileId)
  const updated = await update(selectedDetail.value.id, {
    attrs: selectedDetail.value.attrs ?? undefined
  })
  if (updated) selectedDetail.value = updated
  const linkRes = await apiPost<{ fileId: string; label: string }>('/documents', {
    fileId,
    nodeShapeId: selectedDetail.value.id
  })
  if (!linkRes.success) {
    saveError.value = t('shapes.docLinkRegisterFailed', { message: linkRes.error.message })
  }
}

function handleDocModalClose() {
  showDocModal.value = false
  docModalFileId.value = null
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
    selectedShapeId.value = null
    selectedDetail.value = null
    await fetchList({ size: 200 })
  } else {
    saveError.value = t("shapes.errorDelete")
  }
}

const { isToastVisible, toastError } = useSaveErrorToast(saveError)
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
          {{ t("shapes.deleteConfirm", { name: selectedDetail?.name ?? "" }) }}
        </p>
        <template #footer>
          <button type="button" class="btn btn--secondary" @click="showDeleteConfirm = false">
            {{ t("common.cancel") }}
          </button>
          <button type="button" class="btn btn--danger" @click="confirmDelete">
            {{ t("common.delete") }}
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

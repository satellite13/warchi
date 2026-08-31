import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodeShapes } from '@/composables/useNodeShapes'
import type { NodeShapeResponse } from '@/types/api'
import { DEFAULT_RECTANGLE_OUTLINE, createDefaultScaleSlice } from '@/domain/attrs/notationAttrs'
import type { OutlineSegment, ScaleSlice } from '@/domain/attrs/notationAttrs'
import { parseOutlineSegmentsOrEmpty } from '@/domain/attrs/outline'
import { apiPost } from '@/composables/useApi'
import { usePermissions } from '@/composables/usePermissions'
import { useAuth } from '@/composables/useAuth'
import { useDirtySelectionGuard } from '@/composables/useDirtySelectionGuard'
import { useSaveErrorToast } from '@/composables/useSaveErrorToast'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import {
  resolveOwnerDisplayNames,
  resolveOwnerLabel,
} from '@/utils/resolveOwnerNames'
import {
  hasEffectiveScaleSlice,
  mergeScaleSliceIntoAttrs,
  parseScaleSliceFromAttrs,
} from '@/types/shapes'

function outlineFromDetail(outline: string | null | undefined): OutlineSegment[] {
  const parsed = parseOutlineSegmentsOrEmpty(outline)
  return parsed.length > 0 ? parsed : [...DEFAULT_RECTANGLE_OUTLINE]
}

function normalizeSliceForCompare(slice: ScaleSlice | null): ScaleSlice | null {
  if (!slice || !hasEffectiveScaleSlice(slice)) return null
  return {
    left: slice.left,
    right: slice.right,
    top: slice.top,
    bottom: slice.bottom,
    refWidth: slice.refWidth,
    refHeight: slice.refHeight,
  }
}

export function useShapeEditor() {
  const { t } = useI18n()
  const { list, isLoading, fetchList, fetchById, create, update, remove } = useNodeShapes()
  const { checkPermission } = usePermissions()
  const { currentUser } = useAuth()

  const selectedShapeId = ref<string | null>(null)
  const selectedDetail = ref<NodeShapeResponse | null>(null)
  const isSaving = ref(false)
  const isDeleting = ref(false)
  const saveError = ref<string | null>(null)
  const localName = ref('')
  const localOutline = ref<OutlineSegment[]>([])
  const localScaleSlice = ref<ScaleSlice | null>(null)
  const scaleSliceEnabled = ref(false)
  const showDeleteConfirm = ref(false)
  const showShareModal = ref(false)
  const showDocModal = ref(false)
  const docModalFileId = ref<string | null>(null)
  const canShareSelected = ref(false)
  const ownerDisplayNames: Ref<Map<string, string>> = ref(new Map())

  const canEditSelected = computed(() => {
    const detail = selectedDetail.value
    if (!detail) return false
    if (canEditByAccessPermission(detail.accessPermission)) return true
    const userId = currentUser.value?.id
    return !!userId && detail.ownerId === userId
  })

  async function loadOwnerDisplayNames(ownerIds: string[]): Promise<void> {
    ownerDisplayNames.value = await resolveOwnerDisplayNames(
      ownerIds,
      ownerDisplayNames.value,
      currentUser.value,
      t('common.unknownUser')
    )
  }

  const selectedShapeOwnerName = computed(() => {
    const detail = selectedDetail.value
    const fallback = t('common.unknownUser')
    if (!detail?.ownerId) return fallback
    return resolveOwnerLabel(
      ownerDisplayNames.value,
      detail.ownerId,
      currentUser.value,
      fallback
    )
  })

  const isDirty = computed(() => {
    const detail = selectedDetail.value
    if (!detail) return false
    const savedName = detail.name ?? ''
    const savedOutline = parseOutlineSegmentsOrEmpty(detail.outline)
    if (localName.value !== savedName) return true
    if (JSON.stringify(localOutline.value) !== JSON.stringify(savedOutline)) return true
    const savedSlice = parseScaleSliceFromAttrs(detail.attrs) ?? null
    const localSlice = scaleSliceEnabled.value ? localScaleSlice.value : null
    return (
      JSON.stringify(normalizeSliceForCompare(localSlice)) !==
      JSON.stringify(normalizeSliceForCompare(savedSlice))
    )
  })

  function loadScaleSliceFromDetail(detail: NodeShapeResponse | null) {
    const slice = parseScaleSliceFromAttrs(detail?.attrs) ?? null
    if (slice) {
      localScaleSlice.value = slice
      scaleSliceEnabled.value = true
    } else {
      localScaleSlice.value = createDefaultScaleSlice({
        left: 24,
        right: 24,
        top: 24,
        bottom: 24,
      })
      scaleSliceEnabled.value = false
    }
  }

  function applyDetailToLocal(detail: NodeShapeResponse) {
    localName.value = detail.name
    localOutline.value = outlineFromDetail(detail.outline)
    loadScaleSliceFromDetail(detail)
  }

  function clearLocalFields() {
    localName.value = ''
    localOutline.value = []
    loadScaleSliceFromDetail(null)
  }

  onMounted(() => {
    fetchList({ size: 200 }).then(async (ok) => {
      if (!ok) {
        saveError.value = t('shapes.errorLoad')
        return
      }
      await loadOwnerDisplayNames(list.value.map((shape) => shape.ownerId))
    })
  })

  watch(selectedShapeId, async (id) => {
    selectedDetail.value = null
    clearLocalFields()
    canShareSelected.value = false
    if (!id) return
    const detail = await fetchById(id)
    selectedDetail.value = detail
    if (detail) {
      applyDetailToLocal(detail)
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
      name: t('shapes.addShape'),
      outline: outlineJson,
    })
    if (created) {
      await fetchList({ size: 200 })
      await loadOwnerDisplayNames(list.value.map((shape) => shape.ownerId))
      selectedShapeId.value = created.id
      selectedDetail.value = created
      applyDetailToLocal(created)
    } else {
      saveError.value = t('shapes.errorSave')
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
    const sliceToSave = scaleSliceEnabled.value ? localScaleSlice.value : null
    const nextAttrs = mergeScaleSliceIntoAttrs(selectedDetail.value.attrs, sliceToSave)
    const updated = await update(selectedDetail.value.id, {
      name: localName.value.trim() || selectedDetail.value.name,
      outline: JSON.stringify(localOutline.value),
      attrs: nextAttrs,
    })
    isSaving.value = false
    if (updated) {
      selectedDetail.value = updated
      loadScaleSliceFromDetail(updated)
      const idx = list.value.findIndex((s) => s.id === updated.id)
      if (idx >= 0) {
        list.value = [...list.value.slice(0, idx), updated, ...list.value.slice(idx + 1)]
      }
    } else {
      saveError.value = t('shapes.errorSave')
    }
  }

  function handleScaleSliceEnabled(enabled: boolean) {
    scaleSliceEnabled.value = enabled
    if (enabled && !localScaleSlice.value) {
      localScaleSlice.value = createDefaultScaleSlice({
        left: 24,
        right: 24,
        top: 24,
        bottom: 24,
      })
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

  function openDocModal() {
    docModalFileId.value = getShapeDocFileId()
    showDocModal.value = true
  }

  async function handleDocSaved(fileId: string) {
    if (!selectedDetail.value || !canEditSelected.value) return
    setShapeDocFileId(fileId)
    const updated = await update(selectedDetail.value.id, {
      attrs: selectedDetail.value.attrs ?? undefined,
    })
    if (updated) selectedDetail.value = updated
    const linkRes = await apiPost<{ fileId: string; label: string }>('/documents', {
      fileId,
      nodeShapeId: selectedDetail.value.id,
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
      saveError.value = t('shapes.errorDelete')
    }
  }

  const { isToastVisible, toastError } = useSaveErrorToast(saveError)

  return {
    list,
    isLoading,
    selectedShapeId,
    selectedDetail,
    isSaving,
    isDeleting,
    saveError,
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
  }
}

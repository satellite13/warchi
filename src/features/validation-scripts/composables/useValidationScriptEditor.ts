import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useValidationScripts } from '@/composables/useValidationScripts'
import type { ValidationScriptResponse } from '@/types/api'
import { usePermissions } from '@/composables/usePermissions'
import { useAuth } from '@/composables/useAuth'
import { useDirtySelectionGuard } from '@/composables/useDirtySelectionGuard'
import { useSaveErrorToast } from '@/composables/useSaveErrorToast'
import { canEditByAccessPermission } from '@/utils/accessPermission'
import {
  resolveOwnerDisplayNames,
  resolveOwnerLabel,
} from '@/utils/resolveOwnerNames'

export const DEFAULT_VALIDATION_SCRIPT_SOURCE = '// Script\n'

export function useValidationScriptEditor() {
  const { t } = useI18n()
  const { list, isLoading, fetchList, fetchById, create, update, remove } = useValidationScripts()
  const { checkPermission } = usePermissions()
  const { currentUser } = useAuth()

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

  const selectedScriptOwnerName = computed(() => {
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
        list.value = [...list.value.slice(0, idx), updated, ...list.value.slice(idx + 1)]
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

  return {
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
  }
}

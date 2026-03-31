import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiPut } from './useApi'
import { useModalState } from './useModalState'
import type { VersionedEntity } from '../types/entities'
import type { EntityListConfig } from './useEntityList'

export function useEntityIconModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>,
) {
  const { t } = useI18n()
  const modal = useModalState<T>()
  const iconPickerValue = ref('')

  const openIconModal = (item: T) => {
    const withAttrs = item as T & { attrs?: string | null }
    let currentIcon = ''
    try {
      const parsed = withAttrs.attrs ? JSON.parse(withAttrs.attrs) : {}
      if (typeof parsed?.icon === 'string') currentIcon = parsed.icon
    } catch {
      // ignore
    }
    modal.open(item)
    iconPickerValue.value = currentIcon
  }

  const closeIconModal = () => {
    modal.close()
    iconPickerValue.value = ''
  }

  const submitIconChange = async () => {
    const item = modal.item.value
    if (!item || !config.buildUpdateAttrsRequest) return
    const withAttrs = item as T & { attrs?: string | null }
    let nextAttrsObj: Record<string, unknown> = {}
    try {
      if (withAttrs.attrs) nextAttrsObj = JSON.parse(withAttrs.attrs) as Record<string, unknown>
    } catch {
      // ignore
    }
    nextAttrsObj.icon = iconPickerValue.value || undefined
    if (nextAttrsObj.icon === undefined) delete nextAttrsObj.icon
    const nextAttrsStr = Object.keys(nextAttrsObj).length > 0 ? JSON.stringify(nextAttrsObj) : null

    modal.isProcessing.value = true
    modal.error.value = null
    try {
      const body = config.buildUpdateAttrsRequest(item, nextAttrsStr)
      const result = await apiPut<T>(`/${config.endpoint}/${item.id}`, body)
      if (!result.success) throw new Error(result.error.message)
      items.value = items.value.map((i) => (i.id === item.id ? result.data : i))
      closeIconModal()
    } catch (e) {
      modal.error.value = e instanceof Error ? e.message : t('common.errorSave')
    } finally {
      modal.isProcessing.value = false
    }
  }

  return {
    showIconModal: modal.show,
    itemToUpdateIcon: modal.item,
    iconPickerValue,
    isUpdatingIcon: modal.isProcessing,
    iconUpdateError: modal.error,
    openIconModal,
    closeIconModal,
    submitIconChange,
  }
}

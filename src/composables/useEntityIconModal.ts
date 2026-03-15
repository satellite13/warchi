import { ref, type Ref } from "vue"
import { useI18n } from "vue-i18n"
import { apiPut } from "./useApi"
import type { VersionedEntity } from "../types/entities"
import type { EntityListConfig } from "./useEntityList"

export function useEntityIconModal<T extends VersionedEntity>(
  config: EntityListConfig<T>,
  items: Ref<T[]>
) {
  const { t } = useI18n()

  const showIconModal = ref(false)
  const itemToUpdateIcon = ref<T | null>(null) as Ref<T | null>
  const iconPickerValue = ref("")
  const isUpdatingIcon = ref(false)
  const iconUpdateError = ref<string | null>(null)

  const openIconModal = (item: T) => {
    const withAttrs = item as T & { attrs?: string | null }
    let currentIcon = ""
    try {
      const parsed = withAttrs.attrs ? JSON.parse(withAttrs.attrs) : {}
      if (typeof parsed?.icon === "string") currentIcon = parsed.icon
    } catch {
      // ignore
    }
    itemToUpdateIcon.value = item
    iconPickerValue.value = currentIcon
    iconUpdateError.value = null
    showIconModal.value = true
  }

  const closeIconModal = () => {
    showIconModal.value = false
    itemToUpdateIcon.value = null
    iconPickerValue.value = ""
    iconUpdateError.value = null
    isUpdatingIcon.value = false
  }

  const submitIconChange = async () => {
    const item = itemToUpdateIcon.value
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

    isUpdatingIcon.value = true
    iconUpdateError.value = null
    try {
      const body = config.buildUpdateAttrsRequest(item, nextAttrsStr)
      const result = await apiPut<T>(`/${config.endpoint}/${item.id}`, body)
      if (!result.success) throw new Error(result.error.message)
      items.value = items.value.map((i) => (i.id === item.id ? result.data : i))
      closeIconModal()
    } catch (error) {
      iconUpdateError.value =
        error instanceof Error ? error.message : t("common.errorSave")
    } finally {
      isUpdatingIcon.value = false
    }
  }

  return {
    showIconModal,
    itemToUpdateIcon,
    iconPickerValue,
    isUpdatingIcon,
    iconUpdateError,
    openIconModal,
    closeIconModal,
    submitIconChange,
  }
}

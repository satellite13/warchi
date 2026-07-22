import { type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import type { EditorComponent, EditorRelation } from '../types'
import { customPropertyValidationErrors } from '../utils/customPropertyValidation'
import { useCustomPropertyEditor } from '@/composables/useCustomPropertyEditor'

export interface CustomPropertiesReturn {
  hasValidationErrors: ComputedRef<boolean>
  addCustomProperty: () => void
  addCustomPropertyFromType: (typeProperty: CustomProperty) => void
  removeCustomProperty: (id: string) => void
  updateEnumValues: (property: CustomProperty, value: string) => void
  propertyErrors: (property: CustomProperty) => string[]
}

export function useCustomProperties(
  selectedItem: ComputedRef<EditorComponent | EditorRelation | null>,
  onMutateItem?: (
    id: string,
    apply: (item: EditorComponent | EditorRelation) => void,
  ) => void,
): CustomPropertiesReturn {
  const { t } = useI18n()

  const editor = useCustomPropertyEditor({
    selectedItem,
    onMutateItem,
    validateProperty: property =>
      customPropertyValidationErrors(property, key => String(t(key))),
  })

  return {
    hasValidationErrors: editor.hasValidationErrors,
    addCustomProperty: editor.addCustomProperty,
    addCustomPropertyFromType: editor.addCustomPropertyFromType,
    removeCustomProperty: editor.removeCustomProperty,
    updateEnumValues: editor.updateEnumValues,
    propertyErrors: editor.propertyErrors,
  }
}

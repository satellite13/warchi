import { computed, type ComputedRef } from 'vue'
import { createId, type CustomProperty } from '@/domain/attrs/notationAttrs'
import { createEmptyCustomProperty } from '@/domain/attrs/createEmptyCustomProperty'

export type CustomPropertyHost = {
  id: string
  parsedAttrs: {
    customProperties?: CustomProperty[]
  }
}

export type CustomPropertyEditorOptions<T extends CustomPropertyHost> = {
  selectedItem: ComputedRef<T | null>
  onMutateItem?: (id: string, apply: (item: T) => void) => void
  validateProperty?: (property: CustomProperty) => string[]
}

/**
 * Shared custom-property list mutations for type/notation editors.
 */
export function useCustomPropertyEditor<T extends CustomPropertyHost>(
  options: CustomPropertyEditorOptions<T>,
) {
  const { selectedItem, onMutateItem, validateProperty } = options

  const propertyErrors = (property: CustomProperty): string[] => {
    if (validateProperty) return validateProperty(property)
    return []
  }

  const hasValidationErrors = computed(() => {
    const target = selectedItem.value
    if (!target) return false
    return (target.parsedAttrs.customProperties ?? []).some(
      (property) => propertyErrors(property).length > 0,
    )
  })

  const mutate = (apply: (item: T) => void) => {
    const item = selectedItem.value
    if (!item || !onMutateItem) return
    onMutateItem(item.id, apply)
  }

  const addCustomProperty = () => {
    mutate((item) => {
      if (!item.parsedAttrs.customProperties) {
        item.parsedAttrs.customProperties = []
      }
      item.parsedAttrs.customProperties.push(createEmptyCustomProperty())
    })
  }

  const addCustomPropertyFromType = (typeProperty: CustomProperty) => {
    mutate((item) => {
      if (!item.parsedAttrs.customProperties) {
        item.parsedAttrs.customProperties = []
      }
      item.parsedAttrs.customProperties.push({
        ...typeProperty,
        id: createId(),
        enumValues: typeProperty.enumValues ? [...typeProperty.enumValues] : [],
        _fromType: true,
      })
    })
  }

  const removeCustomProperty = (propertyId: string) => {
    mutate((item) => {
      item.parsedAttrs.customProperties = (item.parsedAttrs.customProperties ?? []).filter(
        (p) => p.id !== propertyId,
      )
    })
  }

  return {
    hasValidationErrors,
    addCustomProperty,
    addCustomPropertyFromType,
    removeCustomProperty,
    propertyErrors,
  }
}

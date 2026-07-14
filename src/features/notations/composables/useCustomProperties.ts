import { computed, type ComputedRef } from "vue"
import { useI18n } from "vue-i18n"
import { createId, type CustomProperty } from "@/domain/attrs/notationAttrs"
import type { EditorComponent, EditorRelation } from "../types"
import { customPropertyValidationErrors } from "../utils/customPropertyValidation"

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
  onMutateItem?: (id: string, apply: (item: EditorComponent | EditorRelation) => void) => void
): CustomPropertiesReturn {
  const { t } = useI18n()

  const propertyErrors = (property: CustomProperty): string[] =>
    customPropertyValidationErrors(property, (key) => String(t(key)))

  const hasValidationErrors = computed(() => {
    const target = selectedItem.value
    if (!target) {
      return false
    }
    return target.parsedAttrs.customProperties.some(
      (property) => propertyErrors(property).length > 0
    )
  })

  const addCustomProperty = () => {
    if (!selectedItem.value) {
      return
    }
    const property: CustomProperty = {
      id: createId(),
      name: "",
      type: "string",
      required: false,
      system: false,
      regex: "",
      min: null,
      max: null,
      enumValues: [],
      defaultValue: undefined
    }
    const itemId = selectedItem.value.id
    if (onMutateItem) {
      onMutateItem(itemId, (item) => {
        item.parsedAttrs.customProperties.push(property)
      })
    }
  }

  const removeCustomProperty = (propertyId: string) => {
    if (!selectedItem.value) {
      return
    }
    const itemId = selectedItem.value.id
    if (onMutateItem) {
      onMutateItem(itemId, (item) => {
        item.parsedAttrs.customProperties =
          item.parsedAttrs.customProperties.filter(
            (p) => p.id !== propertyId
          )
      })
    }
  }

  const addCustomPropertyFromType = (typeProperty: CustomProperty) => {
    if (!selectedItem.value) {
      return
    }
    const property: CustomProperty = {
      ...typeProperty,
      id: createId(),
      enumValues: typeProperty.enumValues ? [...typeProperty.enumValues] : [],
      _fromType: true
    }
    const itemId = selectedItem.value.id
    if (onMutateItem) {
      onMutateItem(itemId, (item) => {
        item.parsedAttrs.customProperties.push(property)
      })
    }
  }

  const updateEnumValues = (property: CustomProperty, value: string) => {
    if (!selectedItem.value) return
    const nextValues = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    const propertyId = property.id
    if (onMutateItem) {
      onMutateItem(selectedItem.value.id, (item) => {
        const p = item.parsedAttrs.customProperties.find(cp => cp.id === propertyId)
        if (p) p.enumValues = nextValues
      })
    }
  }

  return {
    hasValidationErrors,
    addCustomProperty,
    addCustomPropertyFromType,
    removeCustomProperty,
    updateEnumValues,
    propertyErrors
  }
}

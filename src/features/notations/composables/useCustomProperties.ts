import { computed, type ComputedRef } from "vue"
import { createId, type CustomProperty } from "../notationAttrs"
import type { EditorComponent, EditorRelation } from "../types"

export interface CustomPropertiesReturn {
  hasValidationErrors: ComputedRef<boolean>
  addCustomProperty: () => void
  removeCustomProperty: (id: string) => void
  updateEnumValues: (property: CustomProperty, value: string) => void
  parseNumberInput: (value: string) => number | null
  propertyErrors: (property: CustomProperty) => string[]
}

export function useCustomProperties(
  selectedItem: ComputedRef<EditorComponent | EditorRelation | null>,
  onItemChanged?: (id: string) => void
): CustomPropertiesReturn {
  const propertyErrors = (property: CustomProperty): string[] => {
    const errors: string[] = []
    if (!property.name.trim()) {
      errors.push("Нужно указать имя свойства")
    }

    if (property.regex) {
      try {
        new RegExp(property.regex)
      } catch {
        errors.push("Регулярное выражение некорректно")
      }
    }

    if (
      property.type === "number" &&
      property.min !== null &&
      property.max !== null &&
      property.min > property.max
    ) {
      errors.push("min не может быть больше max")
    }

    if (
      property.type === "enum" &&
      (!property.enumValues || !property.enumValues.length)
    ) {
      errors.push("Для enum нужно указать значения")
    }

    return errors
  }

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
      regex: "",
      min: null,
      max: null,
      enumValues: []
    }
    selectedItem.value.parsedAttrs.customProperties.push(property)
    if (onItemChanged) {
      onItemChanged(selectedItem.value.id)
    }
  }

  const removeCustomProperty = (id: string) => {
    if (!selectedItem.value) {
      return
    }
    selectedItem.value.parsedAttrs.customProperties =
      selectedItem.value.parsedAttrs.customProperties.filter(
        (item) => item.id !== id
      )
    if (onItemChanged) {
      onItemChanged(selectedItem.value.id)
    }
  }

  const updateEnumValues = (property: CustomProperty, value: string) => {
    property.enumValues = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    if (selectedItem.value && onItemChanged) {
      onItemChanged(selectedItem.value.id)
    }
  }

  const parseNumberInput = (value: string): number | null => {
    if (!value.trim()) {
      return null
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return {
    hasValidationErrors,
    addCustomProperty,
    removeCustomProperty,
    updateEnumValues,
    parseNumberInput,
    propertyErrors
  }
}

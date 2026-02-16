import { computed, onScopeDispose, ref, type Ref, type ComputedRef } from "vue"
import { createId, type CustomProperty } from "../notationAttrs"
import type {
  NotationEditorState,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation
} from "../types"
import {
  getAllComponentPresets,
  getAllRelationPresets,
  applyComponentStylePreset,
  applyRelationStylePreset,
  getDefaultComponentStylePresetName,
  getDefaultRelationStylePresetName,
  subscribeStylePresetsChanges,
  type ComponentStylePreset,
  type RelationStylePreset
} from "../styles/stylePresets"

export type SelectedEntity = { kind: "component" | "relation"; id: string } | null

export type ListItem = {
  id: string
  kind: "component" | "relation"
  name: string
  typeLabel: string
  tags: string[]
}

export interface NotationEntityReturn {
  searchQuery: Ref<string>
  selectedTags: Ref<string[]>
  selectedEntity: Ref<SelectedEntity>
  showComponentModal: Ref<boolean>
  showRelationModal: Ref<boolean>
  componentName: Ref<string>
  componentTags: Ref<string>
  componentVersion: Ref<string>
  componentTypeSelection: Ref<string>
  componentNewTypeName: Ref<string>
  componentStylePreset: Ref<string>
  componentFormError: Ref<string | null>
  relationName: Ref<string>
  relationTags: Ref<string>
  relationVersion: Ref<string>
  relationTypeSelection: Ref<string>
  relationNewTypeName: Ref<string>
  relationStylePreset: Ref<string>
  relationFormError: Ref<string | null>
  availableTags: ComputedRef<string[]>
  componentTagSuggestions: ComputedRef<string[]>
  relationTagSuggestions: ComputedRef<string[]>
  componentStylePresets: ComputedRef<ComponentStylePreset[]>
  relationStylePresets: ComputedRef<RelationStylePreset[]>
  selectedItem: ComputedRef<EditorComponent | EditorRelation | null>
  combinedItems: ComputedRef<ListItem[]>
  toggleTag: (tag: string) => void
  selectComponent: (id: string) => void
  selectRelation: (id: string) => void
  addComponent: () => void
  addRelation: () => void
  removeComponent: (id: string) => void
  removeRelation: (id: string) => void
  openComponentModal: () => void
  closeComponentModal: () => void
  openRelationModal: () => void
  closeRelationModal: () => void
  markComponentDirty: (id: string) => void
  markRelationDirty: (id: string) => void
}

const NEW_TYPE_VALUE = "__new__"

const normalizeQuery = (value: string) => value.toLowerCase().trim()

const parseTagsInput = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)

const getTagQuery = (value: string) => {
  const parts = value.split(",")
  const prefix = parts
    .slice(0, -1)
    .map((tag) => tag.trim())
    .filter(Boolean)
  const query = parts[parts.length - 1]?.trim() || ""
  return { prefix, query }
}

export const appendTagValue = (current: string, tag: string): string => {
  const { prefix } = getTagQuery(current)
  const unique = new Set(prefix)
  unique.add(tag)
  return `${Array.from(unique).join(", ")}${unique.size ? ", " : ""}`
}

const copyTypeProperties = (source: CustomProperty[]): CustomProperty[] =>
  source.map((p) => ({
    ...p,
    id: createId(),
    enumValues: p.enumValues ? [...p.enumValues] : [],
    _fromType: true
  }))

const typeNameById = (
  items: (EditorNodeType | EditorLinkType)[],
  id: string | null
) => items.find((item) => item.id === id)?.name || "Без типа"

const addNodeType = (
  list: EditorNodeType[],
  name: string,
  ownerId: string
): string | null => {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  const existing = list.find(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (existing) {
    return existing.id
  }
  const newType: EditorNodeType = {
    id: createId(),
    name: trimmed,
    ownerId,
    parsedAttrs: {},
    _isNew: true
  }
  list.push(newType)
  return newType.id
}

const addLinkType = (
  list: EditorLinkType[],
  name: string,
  ownerId: string
): string | null => {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  const existing = list.find(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (existing) {
    return existing.id
  }
  const newType: EditorLinkType = {
    id: createId(),
    name: trimmed,
    ownerId,
    parsedAttrs: {},
    _isNew: true
  }
  list.push(newType)
  return newType.id
}

export function useNotationEntity(
  state: Ref<NotationEditorState>
): NotationEntityReturn {
  const searchQuery = ref("")
  const selectedTags = ref<string[]>([])
  const selectedEntity = ref<SelectedEntity>(null)

  const showComponentModal = ref(false)
  const showRelationModal = ref(false)

  const componentName = ref("")
  const componentTags = ref("")
  const componentVersion = ref("1.0.0")
  const componentTypeSelection = ref(NEW_TYPE_VALUE)
  const componentNewTypeName = ref("")
  const componentStylePreset = ref(getDefaultComponentStylePresetName())
  const componentFormError = ref<string | null>(null)

  const relationName = ref("")
  const relationTags = ref("")
  const relationVersion = ref("1.0.0")
  const relationTypeSelection = ref(NEW_TYPE_VALUE)
  const relationNewTypeName = ref("")
  const relationStylePreset = ref(getDefaultRelationStylePresetName())
  const relationFormError = ref<string | null>(null)
  const stylePresetsVersion = ref(0)

  const availableTags = computed(() => {
    const tags = new Set<string>()
    state.value.components.forEach((component) =>
      component.parsedAttrs.tags.forEach((tag) => tags.add(tag))
    )
    state.value.relations.forEach((relation) =>
      relation.parsedAttrs.tags.forEach((tag) => tags.add(tag))
    )
    return Array.from(tags.values()).sort()
  })

  const componentTagSuggestions = computed(() => {
    const { prefix, query } = getTagQuery(componentTags.value)
    const lowerQuery = query.toLowerCase()
    return availableTags.value
      .filter((tag) => !prefix.includes(tag))
      .filter((tag) => (lowerQuery ? tag.toLowerCase().includes(lowerQuery) : true))
      .slice(0, 6)
  })

  const relationTagSuggestions = computed(() => {
    const { prefix, query } = getTagQuery(relationTags.value)
    const lowerQuery = query.toLowerCase()
    return availableTags.value
      .filter((tag) => !prefix.includes(tag))
      .filter((tag) => (lowerQuery ? tag.toLowerCase().includes(lowerQuery) : true))
      .slice(0, 6)
  })

  const unsubscribeStylePresets = subscribeStylePresetsChanges(() => {
    stylePresetsVersion.value += 1
  })
  onScopeDispose(unsubscribeStylePresets)

  // Load style presets (built-in + user)
  const componentStylePresets = computed(() => {
    stylePresetsVersion.value
    return getAllComponentPresets()
  })
  const relationStylePresets = computed(() => {
    stylePresetsVersion.value
    return getAllRelationPresets()
  })

  const toggleTag = (tag: string) => {
    if (selectedTags.value.includes(tag)) {
      selectedTags.value = selectedTags.value.filter((item) => item !== tag)
    } else {
      selectedTags.value = [...selectedTags.value, tag]
    }
  }

  const matchesFilters = (name: string, tags: string[]) => {
    const query = normalizeQuery(searchQuery.value)
    if (query && !name.toLowerCase().includes(query)) {
      return false
    }
    if (selectedTags.value.length === 0) {
      return true
    }
    return selectedTags.value.every((tag) => tags.includes(tag))
  }

  const selectComponent = (id: string) => {
    selectedEntity.value = { kind: "component", id }
  }

  const selectRelation = (id: string) => {
    selectedEntity.value = { kind: "relation", id }
  }

  const selectedItem = computed<EditorComponent | EditorRelation | null>(() => {
    if (!selectedEntity.value) {
      return null
    }
    if (selectedEntity.value.kind === "component") {
      return (
        state.value.components.find(
          (item) => item.id === selectedEntity.value?.id && !item._isDeleted
        ) || null
      )
    }
    return (
      state.value.relations.find(
        (item) => item.id === selectedEntity.value?.id && !item._isDeleted
      ) || null
    )
  })

  const combinedItems = computed<ListItem[]>(() => {
    const components = state.value.components
      .filter((c) => !c._isDeleted)
      .map((component) => ({
        id: component.id,
        kind: "component" as const,
        name: component.name,
        typeLabel: typeNameById(state.value.nodeTypes, component.nodeTypeId),
        tags: component.parsedAttrs.tags
      }))
      .filter((item) => matchesFilters(item.name, item.tags))

    const relations = state.value.relations
      .filter((r) => !r._isDeleted)
      .map((relation) => ({
        id: relation.id,
        kind: "relation" as const,
        name: relation.name,
        typeLabel: typeNameById(state.value.linkTypes, relation.linkTypeId),
        tags: relation.parsedAttrs.tags
      }))
      .filter((item) => matchesFilters(item.name, item.tags))

    const sortByNameAndType = (a: ListItem, b: ListItem) => {
      const nameDiff = a.name.localeCompare(b.name, "ru")
      if (nameDiff !== 0) {
        return nameDiff
      }
      return a.typeLabel.localeCompare(b.typeLabel, "ru")
    }

    return [
      ...components.sort(sortByNameAndType),
      ...relations.sort(sortByNameAndType)
    ]
  })

  const addComponent = () => {
    componentFormError.value = null
    const name = componentName.value.trim()
    if (!name) {
      componentFormError.value = "Введите название компонента"
      return
    }

    const version = componentVersion.value.trim()
    if (!version) {
      componentFormError.value = "Введите версию компонента"
      return
    }

    let nodeTypeId = componentTypeSelection.value
    if (nodeTypeId === NEW_TYPE_VALUE) {
      nodeTypeId =
        addNodeType(
          state.value.nodeTypes,
          componentNewTypeName.value,
          state.value.ownerId
        ) || ""
      if (!nodeTypeId) {
        componentFormError.value = "Введите название нового типа узла"
        return
      }
    }

    const nodeType = state.value.nodeTypes.find((t) => t.id === nodeTypeId)
    const typeProps = nodeType?.parsedAttrs.customProperties ?? []

    // Apply selected style preset
    const initialStyle = applyComponentStylePreset(componentStylePreset.value)

    const component: EditorComponent = {
      id: createId(),
      name,
      version,
      notationId: state.value.notationId,
      ownerId: state.value.ownerId,
      nodeTypeId,
      parsedAttrs: {
        tags: parseTagsInput(componentTags.value),
        customProperties: copyTypeProperties(typeProps),
        diagramStyle: initialStyle
      },
      _isNew: true
    }

    state.value.components = [component, ...state.value.components]
    componentName.value = ""
    componentTags.value = ""
    componentVersion.value = "1.0.0"
    componentNewTypeName.value = ""
    componentStylePreset.value = getDefaultComponentStylePresetName()
    componentTypeSelection.value = nodeTypeId
    selectComponent(component.id)
    showComponentModal.value = false
  }

  const addRelation = () => {
    relationFormError.value = null
    const name = relationName.value.trim()
    if (!name) {
      relationFormError.value = "Введите название отношения"
      return
    }

    const version = relationVersion.value.trim()
    if (!version) {
      relationFormError.value = "Введите версию отношения"
      return
    }

    let linkTypeId = relationTypeSelection.value
    if (linkTypeId === NEW_TYPE_VALUE) {
      linkTypeId =
        addLinkType(
          state.value.linkTypes,
          relationNewTypeName.value,
          state.value.ownerId
        ) || ""
      if (!linkTypeId) {
        relationFormError.value = "Введите название нового типа связи"
        return
      }
    }

    const linkType = state.value.linkTypes.find((t) => t.id === linkTypeId)
    const typeProps = linkType?.parsedAttrs.customProperties ?? []

    // Apply selected style preset
    const initialStyle = applyRelationStylePreset(relationStylePreset.value)

    const relation: EditorRelation = {
      id: createId(),
      name,
      version,
      notationId: state.value.notationId,
      ownerId: state.value.ownerId,
      linkTypeId,
      parsedAttrs: {
        tags: parseTagsInput(relationTags.value),
        customProperties: copyTypeProperties(typeProps),
        diagramStyle: initialStyle
      },
      _isNew: true
    }

    state.value.relations = [relation, ...state.value.relations]
    relationName.value = ""
    relationTags.value = ""
    relationVersion.value = "1.0.0"
    relationNewTypeName.value = ""
    relationStylePreset.value = getDefaultRelationStylePresetName()
    relationTypeSelection.value = linkTypeId
    selectRelation(relation.id)
    showRelationModal.value = false
  }

  const removeComponent = (id: string) => {
    const component = state.value.components.find((c) => c.id === id)
    if (!component) return

    if (component._isNew) {
      // New component - just remove from array
      state.value.components = state.value.components.filter((c) => c.id !== id)
    } else {
      // Existing component - mark as deleted
      component._isDeleted = true
    }

    if (selectedEntity.value?.id === id) {
      selectedEntity.value = null
    }
  }

  const removeRelation = (id: string) => {
    const relation = state.value.relations.find((r) => r.id === id)
    if (!relation) return

    if (relation._isNew) {
      // New relation - just remove from array
      state.value.relations = state.value.relations.filter((r) => r.id !== id)
    } else {
      // Existing relation - mark as deleted
      relation._isDeleted = true
    }

    if (selectedEntity.value?.id === id) {
      selectedEntity.value = null
    }
  }

  const markComponentDirty = (id: string) => {
    const component = state.value.components.find((c) => c.id === id)
    if (component && !component._isNew) {
      component._isDirty = true
    }
  }

  const markRelationDirty = (id: string) => {
    const relation = state.value.relations.find((r) => r.id === id)
    if (relation && !relation._isNew) {
      relation._isDirty = true
    }
  }

  const openComponentModal = () => {
    componentFormError.value = null
    componentName.value = ""
    componentTags.value = ""
    componentVersion.value = "1.0.0"
    componentTypeSelection.value = NEW_TYPE_VALUE
    componentNewTypeName.value = ""
    componentStylePreset.value = getDefaultComponentStylePresetName()
    showComponentModal.value = true
  }

  const closeComponentModal = () => {
    showComponentModal.value = false
    componentFormError.value = null
  }

  const openRelationModal = () => {
    relationFormError.value = null
    relationName.value = ""
    relationTags.value = ""
    relationVersion.value = "1.0.0"
    relationTypeSelection.value = NEW_TYPE_VALUE
    relationNewTypeName.value = ""
    relationStylePreset.value = getDefaultRelationStylePresetName()
    showRelationModal.value = true
  }

  const closeRelationModal = () => {
    showRelationModal.value = false
    relationFormError.value = null
  }

  return {
    searchQuery,
    selectedTags,
    selectedEntity,
    showComponentModal,
    showRelationModal,
    componentName,
    componentTags,
    componentVersion,
    componentTypeSelection,
    componentNewTypeName,
    componentFormError,
    componentStylePreset,
    relationName,
    relationTags,
    relationVersion,
    relationTypeSelection,
    relationNewTypeName,
    relationFormError,
    relationStylePreset,
    availableTags,
    componentTagSuggestions,
    relationTagSuggestions,
    componentStylePresets,
    relationStylePresets,
    selectedItem,
    combinedItems,
    toggleTag,
    selectComponent,
    selectRelation,
    addComponent,
    addRelation,
    removeComponent,
    removeRelation,
    openComponentModal,
    closeComponentModal,
    openRelationModal,
    closeRelationModal,
    markComponentDirty,
    markRelationDirty
  }
}

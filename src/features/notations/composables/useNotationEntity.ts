import { computed, onScopeDispose, ref, watch, type Ref, type ComputedRef } from 'vue'
import { apiGet } from '../../../composables/useApi'
import type { PaginatedResponse } from '../../../types/entities'
import type { ComponentResponse, RelationResponse } from '../../../types/api'
import type {
  NotationEditorState,
  EditorNodeType,
  EditorLinkType,
  EditorComponent,
  EditorRelation,
} from '../types'
import { subscribeStylePresetsChanges } from '../styles/stylePresets'
import type { ComponentStylePreset, RelationStylePreset } from '../styles/stylePresets'
import { useComponentManagement } from './useComponentManagement'
import { useRelationManagement } from './useRelationManagement'

export type SelectedEntity = { kind: 'component' | 'relation'; id: string } | null

export type ListItem = {
  id: string
  kind: 'component' | 'relation'
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
  componentKind: Ref<string>
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

const normalizeQuery = (value: string) => value.toLowerCase().trim()

export const appendTagValue = (current: string, tag: string): string => {
  const parts = current.split(',')
  const prefix = parts
    .slice(0, -1)
    .map((t) => t.trim())
    .filter(Boolean)
  const unique = new Set(prefix)
  unique.add(tag)
  return `${Array.from(unique).join(', ')}${unique.size ? ', ' : ''}`
}

const typeNameById = (items: (EditorNodeType | EditorLinkType)[], id: string | null) =>
  items.find((item) => item.id === id)?.name || 'Без типа'

export function useNotationEntity(state: Ref<NotationEditorState>): NotationEntityReturn {
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const selectedEntity = ref<SelectedEntity>(null)

  const stylePresetsVersion = ref(0)
  const serverFilteredComponentIds = ref<Set<string> | null>(null)
  const serverFilteredRelationIds = ref<Set<string> | null>(null)
  let serverFilterTimer: ReturnType<typeof setTimeout> | null = null

  const hasLocalEntityChanges = computed(
    () =>
      state.value.components.some((item) => item._isNew || item._isDirty || item._isDeleted) ||
      state.value.relations.some((item) => item._isNew || item._isDirty || item._isDeleted),
  )
  const hasActiveSearchFilters = computed(
    () => normalizeQuery(searchQuery.value).length > 0 || selectedTags.value.length > 0,
  )

  const refreshServerFilters = async () => {
    if (!state.value.notationId || !hasActiveSearchFilters.value || hasLocalEntityChanges.value) {
      serverFilteredComponentIds.value = null
      serverFilteredRelationIds.value = null
      return
    }

    const query = normalizeQuery(searchQuery.value)
    const params = new URLSearchParams({
      notationId: state.value.notationId,
      size: '1000',
    })
    if (query) params.set('name', query)
    if (selectedTags.value.length > 0) {
      params.set('tagsAll', selectedTags.value.join(','))
    }

    const [componentsResult, relationsResult] = await Promise.all([
      apiGet<PaginatedResponse<ComponentResponse>>(`/components?${params.toString()}`),
      apiGet<PaginatedResponse<RelationResponse>>(`/relations?${params.toString()}`),
    ])

    serverFilteredComponentIds.value = componentsResult.success
      ? new Set((componentsResult.data.content ?? []).map((item) => item.id))
      : null
    serverFilteredRelationIds.value = relationsResult.success
      ? new Set((relationsResult.data.content ?? []).map((item) => item.id))
      : null
  }

  watch(
    [() => state.value.notationId, searchQuery, selectedTags, hasLocalEntityChanges],
    () => {
      if (serverFilterTimer) clearTimeout(serverFilterTimer)
      serverFilterTimer = setTimeout(() => {
        void refreshServerFilters()
      }, 180)
    },
    { immediate: true },
  )

  const availableTags = computed(() => {
    const tags = new Set<string>()
    state.value.components.forEach((component) =>
      component.parsedAttrs.tags.forEach((tag) => tags.add(tag)),
    )
    state.value.relations.forEach((relation) =>
      relation.parsedAttrs.tags.forEach((tag) => tags.add(tag)),
    )
    return Array.from(tags.values()).sort()
  })

  const unsubscribeStylePresets = subscribeStylePresetsChanges(() => {
    stylePresetsVersion.value += 1
  })
  onScopeDispose(() => {
    unsubscribeStylePresets()
    if (serverFilterTimer) {
      clearTimeout(serverFilterTimer)
      serverFilterTimer = null
    }
  })

  // Delegate component and relation management to sub-composables
  const componentMgmt = useComponentManagement({
    state,
    selectedEntity,
    availableTags,
    stylePresetsVersion,
  })

  const relationMgmt = useRelationManagement({
    state,
    selectedEntity,
    availableTags,
    stylePresetsVersion,
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

  const selectedItem = computed<EditorComponent | EditorRelation | null>(() => {
    if (!selectedEntity.value) return null
    if (selectedEntity.value.kind === 'component') {
      return (
        state.value.components.find(
          (item) => item.id === selectedEntity.value?.id && !item._isDeleted,
        ) || null
      )
    }
    return (
      state.value.relations.find(
        (item) => item.id === selectedEntity.value?.id && !item._isDeleted,
      ) || null
    )
  })

  const combinedItems = computed<ListItem[]>(() => {
    const componentFilterSet = serverFilteredComponentIds.value
    const relationFilterSet = serverFilteredRelationIds.value
    const useServerFilters = hasActiveSearchFilters.value && !hasLocalEntityChanges.value

    const components = state.value.components
      .filter((c) => !c._isDeleted)
      .filter((component) => {
        if (!useServerFilters || !componentFilterSet) {
          return matchesFilters(component.name, component.parsedAttrs.tags)
        }
        if (component._isNew || component._isDirty) {
          return matchesFilters(component.name, component.parsedAttrs.tags)
        }
        return componentFilterSet.has(component.id)
      })
      .map((component) => ({
        id: component.id,
        kind: 'component' as const,
        name: component.name,
        typeLabel: typeNameById(state.value.nodeTypes, component.nodeTypeId),
        tags: component.parsedAttrs.tags,
      }))

    const relations = state.value.relations
      .filter((r) => !r._isDeleted)
      .filter((relation) => {
        if (!useServerFilters || !relationFilterSet) {
          return matchesFilters(relation.name, relation.parsedAttrs.tags)
        }
        if (relation._isNew || relation._isDirty) {
          return matchesFilters(relation.name, relation.parsedAttrs.tags)
        }
        return relationFilterSet.has(relation.id)
      })
      .map((relation) => ({
        id: relation.id,
        kind: 'relation' as const,
        name: relation.name,
        typeLabel: typeNameById(state.value.linkTypes, relation.linkTypeId),
        tags: relation.parsedAttrs.tags,
      }))

    const sortByNameAndType = (a: ListItem, b: ListItem) => {
      const nameDiff = a.name.localeCompare(b.name, 'ru')
      if (nameDiff !== 0) return nameDiff
      return a.typeLabel.localeCompare(b.typeLabel, 'ru')
    }

    return [...components.sort(sortByNameAndType), ...relations.sort(sortByNameAndType)]
  })

  return {
    searchQuery,
    selectedTags,
    selectedEntity,
    availableTags,
    selectedItem,
    combinedItems,
    toggleTag,
    ...componentMgmt,
    ...relationMgmt,
  }
}

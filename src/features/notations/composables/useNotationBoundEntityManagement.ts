import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { SelectedEntity } from './useNotationEntity'
import { getTagQuery } from '../utils/tagParsers'

export type NotationBoundEntityKind = 'component' | 'relation'

export type NotationBoundEntityLike = {
  id: string
  _isNew?: boolean
  _isDeleted?: boolean
  _isDirty?: boolean
}

export type NotationBoundEntityManagementOptions<T extends NotationBoundEntityLike> = {
  kind: NotationBoundEntityKind
  getList: () => T[]
  setList: (items: T[]) => void
  selectedEntity: Ref<SelectedEntity>
  availableTags: ComputedRef<string[]>
  getDefaultStylePreset: () => string
}

/**
 * Shared modal/list helpers for notation-bound entities (components & relations).
 * Domain-specific create logic stays in useComponentManagement / useRelationManagement.
 */
export function useNotationBoundEntityManagement<T extends NotationBoundEntityLike>(
  options: NotationBoundEntityManagementOptions<T>,
) {
  const {
    kind,
    getList,
    setList,
    selectedEntity,
    availableTags,
    getDefaultStylePreset,
  } = options

  const showModal = ref(false)
  const name = ref('')
  const tags = ref('')
  const version = ref('1.0.0')
  const typeSelection = ref('')
  const newTypeName = ref('')
  const stylePreset = ref(getDefaultStylePreset())
  const formError = ref<string | null>(null)

  const tagSuggestions = computed(() => {
    const { prefix, query } = getTagQuery(tags.value)
    const lowerQuery = query.toLowerCase()
    return availableTags.value
      .filter(tag => !prefix.includes(tag))
      .filter(tag => (lowerQuery ? tag.toLowerCase().includes(lowerQuery) : true))
      .slice(0, 6)
  })

  const selectEntity = (id: string) => {
    selectedEntity.value = { kind, id }
  }

  const removeEntity = (id: string) => {
    const list = getList()
    const entity = list.find(item => item.id === id)
    if (!entity) return
    if (entity._isNew) {
      setList(list.filter(item => item.id !== id))
    } else {
      entity._isDeleted = true
    }
    if (selectedEntity.value?.id === id) {
      selectedEntity.value = null
    }
  }

  const markDirty = (id: string) => {
    const entity = getList().find(item => item.id === id)
    if (entity && !entity._isNew) {
      entity._isDirty = true
    }
  }

  const resetFormFields = (defaults: { typeSelection: string }) => {
    formError.value = null
    name.value = ''
    tags.value = ''
    version.value = '1.0.0'
    typeSelection.value = defaults.typeSelection
    newTypeName.value = ''
    stylePreset.value = getDefaultStylePreset()
  }

  const openModal = (defaults: { typeSelection: string }) => {
    resetFormFields(defaults)
    showModal.value = true
  }

  const closeModal = () => {
    showModal.value = false
    formError.value = null
  }

  const prependEntity = (entity: T) => {
    setList([entity, ...getList()])
  }

  return {
    showModal,
    name,
    tags,
    version,
    typeSelection,
    newTypeName,
    stylePreset,
    formError,
    tagSuggestions,
    selectEntity,
    removeEntity,
    markDirty,
    resetFormFields,
    openModal,
    closeModal,
    prependEntity,
  }
}

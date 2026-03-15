import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { createId, type CustomProperty } from '../notationAttrs'
import type { EditorLinkType, EditorRelation, NotationEditorState } from '../types'
import {
  getAllRelationPresets,
  applyRelationStylePreset,
  getDefaultRelationStylePresetName,
  type RelationStylePreset,
} from '../styles/stylePresets'
import type { SelectedEntity } from './useNotationEntity'

const NEW_TYPE_VALUE = '__new__'

const parseTagsInput = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

const getTagQuery = (value: string) => {
  const parts = value.split(',')
  const prefix = parts
    .slice(0, -1)
    .map((tag) => tag.trim())
    .filter(Boolean)
  const query = parts[parts.length - 1]?.trim() || ''
  return { prefix, query }
}

const copyTypeProperties = (source: CustomProperty[]): CustomProperty[] =>
  source.map((p) => ({
    ...p,
    id: createId(),
    enumValues: p.enumValues ? [...p.enumValues] : [],
    _fromType: true,
  }))

const addLinkType = (list: EditorLinkType[], name: string, ownerId: string): string | null => {
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = list.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing.id
  const newType: EditorLinkType = {
    id: createId(),
    name: trimmed,
    ownerId,
    parsedAttrs: {},
    _isNew: true,
  }
  list.push(newType)
  return newType.id
}

export interface RelationManagementOptions {
  state: Ref<NotationEditorState>
  selectedEntity: Ref<SelectedEntity>
  availableTags: ComputedRef<string[]>
  stylePresetsVersion: Ref<number>
}

export function useRelationManagement(options: RelationManagementOptions) {
  const { state, selectedEntity, availableTags, stylePresetsVersion } = options

  const showRelationModal = ref(false)
  const relationName = ref('')
  const relationTags = ref('')
  const relationVersion = ref('1.0.0')
  const relationTypeSelection = ref(NEW_TYPE_VALUE)
  const relationNewTypeName = ref('')
  const relationStylePreset = ref(getDefaultRelationStylePresetName())
  const relationFormError = ref<string | null>(null)

  const relationTagSuggestions = computed(() => {
    const { prefix, query } = getTagQuery(relationTags.value)
    const lowerQuery = query.toLowerCase()
    return availableTags.value
      .filter((tag) => !prefix.includes(tag))
      .filter((tag) => (lowerQuery ? tag.toLowerCase().includes(lowerQuery) : true))
      .slice(0, 6)
  })

  const relationStylePresets = computed<RelationStylePreset[]>(() => {
    void stylePresetsVersion.value
    return getAllRelationPresets()
  })

  const selectRelation = (id: string) => {
    selectedEntity.value = { kind: 'relation', id }
  }

  const addRelation = () => {
    relationFormError.value = null
    const name = relationName.value.trim()
    if (!name) {
      relationFormError.value = 'Введите название отношения'
      return
    }

    const version = relationVersion.value.trim()
    if (!version) {
      relationFormError.value = 'Введите версию отношения'
      return
    }

    let linkTypeId = relationTypeSelection.value
    if (linkTypeId === NEW_TYPE_VALUE) {
      linkTypeId =
        addLinkType(state.value.linkTypes, relationNewTypeName.value, state.value.ownerId) || ''
      if (!linkTypeId) {
        relationFormError.value = 'Введите название нового типа связи'
        return
      }
    }

    const linkType = state.value.linkTypes.find((t) => t.id === linkTypeId)
    const typeProps = linkType?.parsedAttrs.customProperties ?? []
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
        diagramStyle: initialStyle,
      },
      _isNew: true,
    }

    state.value.relations = [relation, ...state.value.relations]
    relationName.value = ''
    relationTags.value = ''
    relationVersion.value = '1.0.0'
    relationNewTypeName.value = ''
    relationStylePreset.value = getDefaultRelationStylePresetName()
    relationTypeSelection.value = linkTypeId
    selectRelation(relation.id)
    showRelationModal.value = false
  }

  const removeRelation = (id: string) => {
    const relation = state.value.relations.find((r) => r.id === id)
    if (!relation) return
    if (relation._isNew) {
      state.value.relations = state.value.relations.filter((r) => r.id !== id)
    } else {
      relation._isDeleted = true
    }
    if (selectedEntity.value?.id === id) {
      selectedEntity.value = null
    }
  }

  const markRelationDirty = (id: string) => {
    const relation = state.value.relations.find((r) => r.id === id)
    if (relation && !relation._isNew) {
      relation._isDirty = true
    }
  }

  const openRelationModal = () => {
    relationFormError.value = null
    relationName.value = ''
    relationTags.value = ''
    relationVersion.value = '1.0.0'
    relationTypeSelection.value = NEW_TYPE_VALUE
    relationNewTypeName.value = ''
    relationStylePreset.value = getDefaultRelationStylePresetName()
    showRelationModal.value = true
  }

  const closeRelationModal = () => {
    showRelationModal.value = false
    relationFormError.value = null
  }

  return {
    showRelationModal,
    relationName,
    relationTags,
    relationVersion,
    relationTypeSelection,
    relationNewTypeName,
    relationStylePreset,
    relationFormError,
    relationTagSuggestions,
    relationStylePresets,
    selectRelation,
    addRelation,
    removeRelation,
    markRelationDirty,
    openRelationModal,
    closeRelationModal,
  }
}

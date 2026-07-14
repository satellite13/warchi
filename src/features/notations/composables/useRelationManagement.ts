import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { createId } from '@/domain/attrs/notationAttrs'
import type { EditorRelation, NotationEditorState } from '../types'
import {
  getAllRelationPresets,
  applyRelationStylePreset,
  getDefaultRelationStylePresetName,
  type RelationStylePreset,
} from '@/features/diagram-style/styles/stylePresets'
import type { SelectedEntity } from './useNotationEntity'
import { parseTagsInput, getTagQuery, copyTypeProperties } from '../utils/tagParsers'
import { addType } from '../utils/typeManagement'

export const NEW_TYPE_VALUE = '__new__'
export const RELATION_WITHOUT_TYPE_VALUE = '__without_type__'
const UNTYPED_LINK_TYPE_NAME = 'Diagram only'


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
  const relationTypeSelection = ref(RELATION_WITHOUT_TYPE_VALUE)
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
    if (linkTypeId === RELATION_WITHOUT_TYPE_VALUE) {
      linkTypeId =
        addType(state.value.linkTypes, UNTYPED_LINK_TYPE_NAME, state.value.ownerId) || ''
    }
    if (linkTypeId === NEW_TYPE_VALUE) {
      linkTypeId =
        addType(state.value.linkTypes, relationNewTypeName.value, state.value.ownerId) || ''
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
    relationTypeSelection.value = RELATION_WITHOUT_TYPE_VALUE
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
    relationTypeSelection.value = RELATION_WITHOUT_TYPE_VALUE
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

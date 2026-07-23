import { computed, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createId } from '@/domain/attrs/notationAttrs'
import type { EditorRelation, NotationEditorState } from '../types'
import {
  getAllRelationPresets,
  applyRelationStylePreset,
  getDefaultRelationStylePresetName,
  type RelationStylePreset,
} from '@/features/diagram-style/styles/stylePresets'
import type { SelectedEntity } from './useNotationEntity'
import { parseTagsInput, copyTypeProperties } from '../utils/tagParsers'
import { addType } from '../utils/typeManagement'
import { findNameVersionConflict } from '../utils/nameVersionUniqueness'
import { useNotationBoundEntityManagement } from './useNotationBoundEntityManagement'

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
  const { t } = useI18n()

  const bound = useNotationBoundEntityManagement<EditorRelation>({
    kind: 'relation',
    getList: () => state.value.relations,
    setList: items => {
      state.value.relations = items
    },
    selectedEntity,
    availableTags,
    getDefaultStylePreset: getDefaultRelationStylePresetName,
  })

  const relationStylePresets = computed<RelationStylePreset[]>(() => {
    void stylePresetsVersion.value
    return getAllRelationPresets()
  })

  const addRelation = () => {
    bound.formError.value = null
    const name = bound.name.value.trim()
    if (!name) {
      bound.formError.value = t('notations.enterRelationName')
      return
    }

    const version = bound.version.value.trim()
    if (!version) {
      bound.formError.value = t('notations.enterRelationVersion')
      return
    }

    if (findNameVersionConflict(state.value.relations, name, version)) {
      bound.formError.value = t('notations.relationNameVersionConflict')
      return
    }

    let linkTypeId = bound.typeSelection.value
    if (linkTypeId === RELATION_WITHOUT_TYPE_VALUE) {
      linkTypeId =
        addType(state.value.linkTypes, UNTYPED_LINK_TYPE_NAME, state.value.ownerId) || ''
    }
    if (linkTypeId === NEW_TYPE_VALUE) {
      linkTypeId =
        addType(state.value.linkTypes, bound.newTypeName.value, state.value.ownerId) || ''
      if (!linkTypeId) {
        bound.formError.value = t('notations.enterNewLinkTypeName')
        return
      }
    }

    const linkType = state.value.linkTypes.find(item => item.id === linkTypeId)
    const typeProps = linkType?.parsedAttrs.customProperties ?? []
    const initialStyle = applyRelationStylePreset(bound.stylePreset.value)

    const relation: EditorRelation = {
      id: createId(),
      name,
      version,
      notationId: state.value.notationId,
      ownerId: state.value.ownerId,
      linkTypeId,
      parsedAttrs: {
        tags: parseTagsInput(bound.tags.value),
        customProperties: copyTypeProperties(typeProps),
        diagramStyle: initialStyle,
      },
      _isNew: true,
    }

    bound.prependEntity(relation)
    bound.resetFormFields({ typeSelection: RELATION_WITHOUT_TYPE_VALUE })
    bound.selectEntity(relation.id)
    bound.showModal.value = false
  }

  const openRelationModal = () => {
    bound.openModal({ typeSelection: RELATION_WITHOUT_TYPE_VALUE })
  }

  return {
    showRelationModal: bound.showModal,
    relationName: bound.name,
    relationTags: bound.tags,
    relationVersion: bound.version,
    relationTypeSelection: bound.typeSelection,
    relationNewTypeName: bound.newTypeName,
    relationStylePreset: bound.stylePreset,
    relationFormError: bound.formError,
    relationTagSuggestions: bound.tagSuggestions,
    relationStylePresets,
    selectRelation: bound.selectEntity,
    addRelation,
    removeRelation: bound.removeEntity,
    markRelationDirty: bound.markDirty,
    openRelationModal,
    closeRelationModal: bound.closeModal,
  }
}

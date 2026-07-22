import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createId, type CompositeSerializedCComponent } from '@/domain/attrs/notationAttrs'
import type { EditorComponent, NotationEditorState } from '../types'
import {
  getAllComponentPresets,
  applyComponentStylePreset,
  getDefaultComponentStylePresetName,
  type ComponentStylePreset,
} from '@/features/diagram-style/styles/stylePresets'
import type { SelectedEntity } from './useNotationEntity'
import { parseTagsInput, copyTypeProperties } from '../utils/tagParsers'
import { addType } from '../utils/typeManagement'
import { useNotationBoundEntityManagement } from './useNotationBoundEntityManagement'

export const NEW_TYPE_VALUE = '__new__'
export const COMPONENT_WITHOUT_TYPE_VALUE = '__without_type__'
export const COMPONENT_KIND_SIMPLE = 'simple'
export const COMPONENT_KIND_COMPOSITE = 'composite'
const UNTYPED_NODE_TYPE_NAME = 'Diagram only'

const createDefaultCompositeContent = (): CompositeSerializedCComponent => ({
  type: 'container',
  direction: 'column',
  children: [],
})

export interface ComponentManagementOptions {
  state: Ref<NotationEditorState>
  selectedEntity: Ref<SelectedEntity>
  availableTags: ComputedRef<string[]>
  stylePresetsVersion: Ref<number>
}

export function useComponentManagement(options: ComponentManagementOptions) {
  const { state, selectedEntity, availableTags, stylePresetsVersion } = options
  const { t } = useI18n()

  const bound = useNotationBoundEntityManagement<EditorComponent>({
    kind: 'component',
    getList: () => state.value.components,
    setList: items => {
      state.value.components = items
    },
    selectedEntity,
    availableTags,
    getDefaultStylePreset: getDefaultComponentStylePresetName,
  })

  const componentKind = ref(COMPONENT_KIND_SIMPLE)

  const componentStylePresets = computed<ComponentStylePreset[]>(() => {
    void stylePresetsVersion.value
    return getAllComponentPresets()
  })

  const addComponent = () => {
    bound.formError.value = null
    const name = bound.name.value.trim()
    if (!name) {
      bound.formError.value = t('notations.enterComponentName')
      return
    }

    const version = bound.version.value.trim()
    if (!version) {
      bound.formError.value = t('notations.enterComponentVersion')
      return
    }

    let nodeTypeId = bound.typeSelection.value
    if (nodeTypeId === COMPONENT_WITHOUT_TYPE_VALUE) {
      nodeTypeId = addType(state.value.nodeTypes, UNTYPED_NODE_TYPE_NAME, state.value.ownerId) || ''
    }
    if (nodeTypeId === NEW_TYPE_VALUE) {
      nodeTypeId =
        addType(state.value.nodeTypes, bound.newTypeName.value, state.value.ownerId) || ''
      if (!nodeTypeId) {
        bound.formError.value = t('notations.enterNewNodeTypeName')
        return
      }
    }

    const nodeType = state.value.nodeTypes.find(item => item.id === nodeTypeId)
    const typeProps = nodeType?.parsedAttrs.customProperties ?? []
    const stylePreset = applyComponentStylePreset(bound.stylePreset.value)
    const initialStyle =
      componentKind.value === COMPONENT_KIND_COMPOSITE
        ? {
            ...stylePreset,
            nodeShape: 'composite',
            compositeContent: stylePreset.compositeContent ?? createDefaultCompositeContent(),
          }
        : {
            ...stylePreset,
            ...(stylePreset.nodeShape === 'composite'
              ? {
                  nodeShape: 'rectangle',
                  compositeContent: undefined,
                  stylePropertyBindings: undefined,
                }
              : {}),
          }

    const component: EditorComponent = {
      id: createId(),
      name,
      version,
      notationId: state.value.notationId,
      ownerId: state.value.ownerId,
      nodeTypeId,
      parsedAttrs: {
        tags: parseTagsInput(bound.tags.value),
        customProperties: copyTypeProperties(typeProps),
        diagramStyle: initialStyle,
      },
      _isNew: true,
    }

    bound.prependEntity(component)
    bound.resetFormFields({ typeSelection: COMPONENT_WITHOUT_TYPE_VALUE })
    componentKind.value = COMPONENT_KIND_SIMPLE
    bound.selectEntity(component.id)
    bound.showModal.value = false
  }

  const openComponentModal = () => {
    bound.openModal({ typeSelection: COMPONENT_WITHOUT_TYPE_VALUE })
    componentKind.value = COMPONENT_KIND_SIMPLE
  }

  return {
    showComponentModal: bound.showModal,
    componentName: bound.name,
    componentTags: bound.tags,
    componentVersion: bound.version,
    componentTypeSelection: bound.typeSelection,
    componentNewTypeName: bound.newTypeName,
    componentKind,
    componentStylePreset: bound.stylePreset,
    componentFormError: bound.formError,
    componentTagSuggestions: bound.tagSuggestions,
    componentStylePresets,
    selectComponent: bound.selectEntity,
    addComponent,
    removeComponent: bound.removeEntity,
    markComponentDirty: bound.markDirty,
    openComponentModal,
    closeComponentModal: bound.closeModal,
  }
}

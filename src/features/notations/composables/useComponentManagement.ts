import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { createId, type CustomProperty } from '../notationAttrs'
import type { EditorNodeType, EditorComponent, NotationEditorState } from '../types'
import {
  getAllComponentPresets,
  applyComponentStylePreset,
  getDefaultComponentStylePresetName,
  type ComponentStylePreset,
} from '../styles/stylePresets'
import type { SelectedEntity } from './useNotationEntity'

export const NEW_TYPE_VALUE = '__new__'
export const COMPONENT_WITHOUT_TYPE_VALUE = '__without_type__'
const UNTYPED_NODE_TYPE_NAME = 'Diagram only'

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

const addNodeType = (list: EditorNodeType[], name: string, ownerId: string): string | null => {
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = list.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) return existing.id
  const newType: EditorNodeType = {
    id: createId(),
    name: trimmed,
    ownerId,
    parsedAttrs: {},
    _isNew: true,
  }
  list.push(newType)
  return newType.id
}

export interface ComponentManagementOptions {
  state: Ref<NotationEditorState>
  selectedEntity: Ref<SelectedEntity>
  availableTags: ComputedRef<string[]>
  stylePresetsVersion: Ref<number>
}

export function useComponentManagement(options: ComponentManagementOptions) {
  const { state, selectedEntity, availableTags, stylePresetsVersion } = options

  const showComponentModal = ref(false)
  const componentName = ref('')
  const componentTags = ref('')
  const componentVersion = ref('1.0.0')
  const componentTypeSelection = ref(COMPONENT_WITHOUT_TYPE_VALUE)
  const componentNewTypeName = ref('')
  const componentStylePreset = ref(getDefaultComponentStylePresetName())
  const componentFormError = ref<string | null>(null)

  const componentTagSuggestions = computed(() => {
    const { prefix, query } = getTagQuery(componentTags.value)
    const lowerQuery = query.toLowerCase()
    return availableTags.value
      .filter((tag) => !prefix.includes(tag))
      .filter((tag) => (lowerQuery ? tag.toLowerCase().includes(lowerQuery) : true))
      .slice(0, 6)
  })

  const componentStylePresets = computed<ComponentStylePreset[]>(() => {
    void stylePresetsVersion.value
    return getAllComponentPresets()
  })

  const selectComponent = (id: string) => {
    selectedEntity.value = { kind: 'component', id }
  }

  const addComponent = () => {
    componentFormError.value = null
    const name = componentName.value.trim()
    if (!name) {
      componentFormError.value = 'Введите название компонента'
      return
    }

    const version = componentVersion.value.trim()
    if (!version) {
      componentFormError.value = 'Введите версию компонента'
      return
    }

    let nodeTypeId = componentTypeSelection.value
    if (nodeTypeId === COMPONENT_WITHOUT_TYPE_VALUE) {
      nodeTypeId = addNodeType(state.value.nodeTypes, UNTYPED_NODE_TYPE_NAME, state.value.ownerId) || ''
    }
    if (nodeTypeId === NEW_TYPE_VALUE) {
      nodeTypeId =
        addNodeType(state.value.nodeTypes, componentNewTypeName.value, state.value.ownerId) || ''
      if (!nodeTypeId) {
        componentFormError.value = 'Введите название нового типа узла'
        return
      }
    }

    const nodeType = state.value.nodeTypes.find((t) => t.id === nodeTypeId)
    const typeProps = nodeType?.parsedAttrs.customProperties ?? []
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
        diagramStyle: initialStyle,
      },
      _isNew: true,
    }

    state.value.components = [component, ...state.value.components]
    componentName.value = ''
    componentTags.value = ''
    componentVersion.value = '1.0.0'
    componentNewTypeName.value = ''
    componentStylePreset.value = getDefaultComponentStylePresetName()
    componentTypeSelection.value = COMPONENT_WITHOUT_TYPE_VALUE
    selectComponent(component.id)
    showComponentModal.value = false
  }

  const removeComponent = (id: string) => {
    const component = state.value.components.find((c) => c.id === id)
    if (!component) return
    if (component._isNew) {
      state.value.components = state.value.components.filter((c) => c.id !== id)
    } else {
      component._isDeleted = true
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

  const openComponentModal = () => {
    componentFormError.value = null
    componentName.value = ''
    componentTags.value = ''
    componentVersion.value = '1.0.0'
    componentTypeSelection.value = COMPONENT_WITHOUT_TYPE_VALUE
    componentNewTypeName.value = ''
    componentStylePreset.value = getDefaultComponentStylePresetName()
    showComponentModal.value = true
  }

  const closeComponentModal = () => {
    showComponentModal.value = false
    componentFormError.value = null
  }

  return {
    showComponentModal,
    componentName,
    componentTags,
    componentVersion,
    componentTypeSelection,
    componentNewTypeName,
    componentStylePreset,
    componentFormError,
    componentTagSuggestions,
    componentStylePresets,
    selectComponent,
    addComponent,
    removeComponent,
    markComponentDirty,
    openComponentModal,
    closeComponentModal,
  }
}

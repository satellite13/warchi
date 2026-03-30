import { computed, ref } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NotationEditorState } from '../types'
import type { SelectedEntity } from './useNotationEntity'

vi.mock('../styles/stylePresets', () => ({
  getAllComponentPresets: () => [],
  applyComponentStylePreset: (presetName: string) => {
    if (presetName === 'composite-preset') {
      return {
        nodeShape: 'composite',
        compositeContent: {
          type: 'container',
          direction: 'column',
          children: [],
        },
      }
    }
    return {
      nodeShape: 'rectangle',
    }
  },
  getDefaultComponentStylePresetName: () => 'default',
}))

import {
  COMPONENT_KIND_COMPOSITE,
  COMPONENT_KIND_SIMPLE,
  COMPONENT_WITHOUT_TYPE_VALUE,
  useComponentManagement,
} from './useComponentManagement'

function createOptions() {
  const state = ref<NotationEditorState>({
    notationId: 'notation-1',
    ownerId: 'owner-1',
    nodeTypes: [
      {
        id: 'type-1',
        name: 'TestType',
        ownerId: 'owner-1',
        parsedAttrs: {},
        _isNew: false,
      },
    ],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
    diagramLayer: { version: 1, nodes: [], edges: [] },
  })
  const selectedEntity = ref<SelectedEntity>(null)
  const availableTags = computed(() => [] as string[])
  const stylePresetsVersion = ref(0)
  return { state, selectedEntity, availableTags, stylePresetsVersion }
}

describe('useComponentManagement', () => {
  let options: ReturnType<typeof createOptions>

  beforeEach(() => {
    options = createOptions()
  })

  describe('selectComponent', () => {
    it('sets selectedEntity to component kind with given id', () => {
      const { selectComponent } = useComponentManagement(options)
      selectComponent('comp-1')
      expect(options.selectedEntity.value).toEqual({ kind: 'component', id: 'comp-1' })
    })
  })

  describe('addComponent', () => {
    it('shows error when name is empty', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = ''
      cm.componentVersion.value = '1.0.0'
      cm.addComponent()
      expect(cm.componentFormError.value).toBe('Введите название компонента')
      expect(options.state.value.components).toHaveLength(0)
    })

    it('shows error when version is empty', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'MyComponent'
      cm.componentVersion.value = ''
      cm.addComponent()
      expect(cm.componentFormError.value).toBe('Введите версию компонента')
      expect(options.state.value.components).toHaveLength(0)
    })

    it('shows error when new type name is empty and new type is selected', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'MyComponent'
      cm.componentVersion.value = '1.0.0'
      cm.componentTypeSelection.value = '__new__'
      cm.componentNewTypeName.value = ''
      cm.addComponent()
      expect(cm.componentFormError.value).toBe('Введите название нового типа узла')
      expect(options.state.value.components).toHaveLength(0)
    })

    it('creates component with existing type, prepends to state, selects it, closes modal', () => {
      const cm = useComponentManagement(options)
      cm.showComponentModal.value = true
      cm.componentName.value = 'MyComponent'
      cm.componentVersion.value = '2.0.0'
      cm.componentTypeSelection.value = 'type-1'
      cm.addComponent()

      expect(cm.componentFormError.value).toBeNull()
      expect(options.state.value.components).toHaveLength(1)

      const added = options.state.value.components[0]
      expect(added.name).toBe('MyComponent')
      expect(added.version).toBe('2.0.0')
      expect(added.nodeTypeId).toBe('type-1')
      expect(added._isNew).toBe(true)
      expect(added.notationId).toBe('notation-1')
      expect(added.ownerId).toBe('owner-1')

      // should select the new component
      expect(options.selectedEntity.value).toEqual({ kind: 'component', id: added.id })

      // modal should be closed
      expect(cm.showComponentModal.value).toBe(false)
    })

    it('creates component without explicit type selection', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'NoTypeComponent'
      cm.componentVersion.value = '1.0.0'
      cm.componentTypeSelection.value = COMPONENT_WITHOUT_TYPE_VALUE
      cm.addComponent()

      expect(options.state.value.components).toHaveLength(1)
      const added = options.state.value.components[0]
      expect(added.name).toBe('NoTypeComponent')
      expect(typeof added.nodeTypeId).toBe('string')
      expect(added.nodeTypeId.length).toBeGreaterThan(0)
      const attachedType = options.state.value.nodeTypes.find((t) => t.id === added.nodeTypeId)
      expect(attachedType?.name).toBe('Diagram only')
    })

    it('creates a new node type when __new__ is selected with a name', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'Comp'
      cm.componentVersion.value = '1.0.0'
      cm.componentTypeSelection.value = '__new__'
      cm.componentNewTypeName.value = 'BrandNewType'
      cm.addComponent()

      expect(options.state.value.components).toHaveLength(1)
      // A new node type should have been added
      expect(options.state.value.nodeTypes).toHaveLength(2)
      const newType = options.state.value.nodeTypes[1]
      expect(newType.name).toBe('BrandNewType')
      expect(newType._isNew).toBe(true)
    })

    it('resets form fields after successful add', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'Test'
      cm.componentVersion.value = '3.0.0'
      cm.componentTags.value = 'a,b'
      cm.componentTypeSelection.value = 'type-1'
      cm.componentKind.value = COMPONENT_KIND_COMPOSITE
      cm.addComponent()

      expect(cm.componentName.value).toBe('')
      expect(cm.componentTags.value).toBe('')
      expect(cm.componentVersion.value).toBe('1.0.0')
      expect(cm.componentNewTypeName.value).toBe('')
      expect(cm.componentKind.value).toBe(COMPONENT_KIND_SIMPLE)
    })

    it('creates composite component style when composite kind is selected', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'Composite component'
      cm.componentVersion.value = '1.0.0'
      cm.componentTypeSelection.value = 'type-1'
      cm.componentKind.value = COMPONENT_KIND_COMPOSITE
      cm.addComponent()

      const added = options.state.value.components[0]
      expect(added.parsedAttrs.diagramStyle?.nodeShape).toBe('composite')
      expect(added.parsedAttrs.diagramStyle?.compositeContent).toEqual({
        type: 'container',
        direction: 'column',
        children: [],
      })
    })

    it('normalizes simple component style when preset shape is composite', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'Simple component'
      cm.componentVersion.value = '1.0.0'
      cm.componentTypeSelection.value = 'type-1'
      cm.componentKind.value = COMPONENT_KIND_SIMPLE
      cm.componentStylePreset.value = 'composite-preset'
      cm.addComponent()

      const added = options.state.value.components[0]
      expect(added.parsedAttrs.diagramStyle?.nodeShape).toBe('rectangle')
      expect(added.parsedAttrs.diagramStyle?.compositeContent).toBeUndefined()
    })
  })

  describe('removeComponent', () => {
    it('filters out _isNew component from state', () => {
      options.state.value.components = [
        {
          id: 'new-comp',
          name: 'New',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          nodeTypeId: 'type-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      const cm = useComponentManagement(options)
      cm.removeComponent('new-comp')
      expect(options.state.value.components).toHaveLength(0)
    })

    it('sets _isDeleted=true on existing component', () => {
      options.state.value.components = [
        {
          id: 'existing-comp',
          name: 'Existing',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          nodeTypeId: 'type-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: false,
        },
      ]
      const cm = useComponentManagement(options)
      cm.removeComponent('existing-comp')
      expect(options.state.value.components).toHaveLength(1)
      expect(options.state.value.components[0]._isDeleted).toBe(true)
    })

    it('clears selection if removed item was selected', () => {
      options.state.value.components = [
        {
          id: 'comp-1',
          name: 'C1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          nodeTypeId: 'type-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      options.selectedEntity.value = { kind: 'component', id: 'comp-1' }
      const cm = useComponentManagement(options)
      cm.removeComponent('comp-1')
      expect(options.selectedEntity.value).toBeNull()
    })

    it('does not clear selection if another item was selected', () => {
      options.state.value.components = [
        {
          id: 'comp-1',
          name: 'C1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          nodeTypeId: 'type-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      options.selectedEntity.value = { kind: 'component', id: 'comp-other' }
      const cm = useComponentManagement(options)
      cm.removeComponent('comp-1')
      expect(options.selectedEntity.value).toEqual({ kind: 'component', id: 'comp-other' })
    })

    it('does nothing for non-existent id', () => {
      const cm = useComponentManagement(options)
      cm.removeComponent('does-not-exist')
      expect(options.state.value.components).toHaveLength(0)
    })
  })

  describe('markComponentDirty', () => {
    it('sets _isDirty=true on existing (not _isNew) component', () => {
      options.state.value.components = [
        {
          id: 'comp-1',
          name: 'C1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          nodeTypeId: 'type-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: false,
        },
      ]
      const cm = useComponentManagement(options)
      cm.markComponentDirty('comp-1')
      expect(options.state.value.components[0]._isDirty).toBe(true)
    })

    it('does not set _isDirty on _isNew component', () => {
      options.state.value.components = [
        {
          id: 'comp-1',
          name: 'C1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          nodeTypeId: 'type-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      const cm = useComponentManagement(options)
      cm.markComponentDirty('comp-1')
      expect(options.state.value.components[0]._isDirty).toBeUndefined()
    })
  })

  describe('openComponentModal', () => {
    it('resets form fields and opens modal', () => {
      const cm = useComponentManagement(options)
      cm.componentName.value = 'leftover'
      cm.componentFormError.value = 'some error'
      cm.componentKind.value = COMPONENT_KIND_COMPOSITE
      cm.openComponentModal()

      expect(cm.showComponentModal.value).toBe(true)
      expect(cm.componentName.value).toBe('')
      expect(cm.componentTags.value).toBe('')
      expect(cm.componentVersion.value).toBe('1.0.0')
      expect(cm.componentNewTypeName.value).toBe('')
      expect(cm.componentTypeSelection.value).toBe(COMPONENT_WITHOUT_TYPE_VALUE)
      expect(cm.componentKind.value).toBe(COMPONENT_KIND_SIMPLE)
      expect(cm.componentFormError.value).toBeNull()
    })
  })

  describe('closeComponentModal', () => {
    it('closes modal and clears error', () => {
      const cm = useComponentManagement(options)
      cm.showComponentModal.value = true
      cm.componentFormError.value = 'error'
      cm.closeComponentModal()

      expect(cm.showComponentModal.value).toBe(false)
      expect(cm.componentFormError.value).toBeNull()
    })
  })
})

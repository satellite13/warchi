import { computed, ref } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NotationEditorState } from '../types'
import type { SelectedEntity } from './useNotationEntity'

vi.mock('../styles/stylePresets', () => ({
  getAllRelationPresets: () => [],
  applyRelationStylePreset: () => ({}),
  getDefaultRelationStylePresetName: () => 'default',
}))

import { useRelationManagement } from './useRelationManagement'

function createOptions() {
  const state = ref<NotationEditorState>({
    notationId: 'notation-1',
    ownerId: 'owner-1',
    nodeTypes: [],
    linkTypes: [
      {
        id: 'ltype-1',
        name: 'TestLinkType',
        ownerId: 'owner-1',
        parsedAttrs: {},
        _isNew: false,
      },
    ],
    components: [],
    relations: [],
    relationRules: [],
  })
  const selectedEntity = ref<SelectedEntity>(null)
  const availableTags = computed(() => [] as string[])
  const stylePresetsVersion = ref(0)
  return { state, selectedEntity, availableTags, stylePresetsVersion }
}

describe('useRelationManagement', () => {
  let options: ReturnType<typeof createOptions>

  beforeEach(() => {
    options = createOptions()
  })

  describe('selectRelation', () => {
    it('sets selectedEntity to relation kind with given id', () => {
      const { selectRelation } = useRelationManagement(options)
      selectRelation('rel-1')
      expect(options.selectedEntity.value).toEqual({ kind: 'relation', id: 'rel-1' })
    })
  })

  describe('addRelation', () => {
    it('shows error when name is empty', () => {
      const rm = useRelationManagement(options)
      rm.relationName.value = ''
      rm.relationVersion.value = '1.0.0'
      rm.addRelation()
      expect(rm.relationFormError.value).toBe('Введите название отношения')
      expect(options.state.value.relations).toHaveLength(0)
    })

    it('shows error when version is empty', () => {
      const rm = useRelationManagement(options)
      rm.relationName.value = 'MyRelation'
      rm.relationVersion.value = ''
      rm.addRelation()
      expect(rm.relationFormError.value).toBe('Введите версию отношения')
      expect(options.state.value.relations).toHaveLength(0)
    })

    it('shows error when new type name is empty and new type is selected', () => {
      const rm = useRelationManagement(options)
      rm.relationName.value = 'MyRelation'
      rm.relationVersion.value = '1.0.0'
      rm.relationTypeSelection.value = '__new__'
      rm.relationNewTypeName.value = ''
      rm.addRelation()
      expect(rm.relationFormError.value).toBe('Введите название нового типа связи')
      expect(options.state.value.relations).toHaveLength(0)
    })

    it('creates relation with existing type, prepends to state, selects it, closes modal', () => {
      const rm = useRelationManagement(options)
      rm.showRelationModal.value = true
      rm.relationName.value = 'MyRelation'
      rm.relationVersion.value = '2.0.0'
      rm.relationTypeSelection.value = 'ltype-1'
      rm.addRelation()

      expect(rm.relationFormError.value).toBeNull()
      expect(options.state.value.relations).toHaveLength(1)

      const added = options.state.value.relations[0]
      expect(added.name).toBe('MyRelation')
      expect(added.version).toBe('2.0.0')
      expect(added.linkTypeId).toBe('ltype-1')
      expect(added._isNew).toBe(true)
      expect(added.notationId).toBe('notation-1')
      expect(added.ownerId).toBe('owner-1')

      // should select the new relation
      expect(options.selectedEntity.value).toEqual({ kind: 'relation', id: added.id })

      // modal should be closed
      expect(rm.showRelationModal.value).toBe(false)
    })

    it('creates a new link type when __new__ is selected with a name', () => {
      const rm = useRelationManagement(options)
      rm.relationName.value = 'Rel'
      rm.relationVersion.value = '1.0.0'
      rm.relationTypeSelection.value = '__new__'
      rm.relationNewTypeName.value = 'BrandNewLinkType'
      rm.addRelation()

      expect(options.state.value.relations).toHaveLength(1)
      // A new link type should have been added
      expect(options.state.value.linkTypes).toHaveLength(2)
      const newType = options.state.value.linkTypes[1]
      expect(newType.name).toBe('BrandNewLinkType')
      expect(newType._isNew).toBe(true)
    })

    it('resets form fields after successful add', () => {
      const rm = useRelationManagement(options)
      rm.relationName.value = 'Test'
      rm.relationVersion.value = '3.0.0'
      rm.relationTags.value = 'a,b'
      rm.relationTypeSelection.value = 'ltype-1'
      rm.addRelation()

      expect(rm.relationName.value).toBe('')
      expect(rm.relationTags.value).toBe('')
      expect(rm.relationVersion.value).toBe('1.0.0')
      expect(rm.relationNewTypeName.value).toBe('')
    })
  })

  describe('removeRelation', () => {
    it('filters out _isNew relation from state', () => {
      options.state.value.relations = [
        {
          id: 'new-rel',
          name: 'New',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          linkTypeId: 'ltype-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      const rm = useRelationManagement(options)
      rm.removeRelation('new-rel')
      expect(options.state.value.relations).toHaveLength(0)
    })

    it('sets _isDeleted=true on existing relation', () => {
      options.state.value.relations = [
        {
          id: 'existing-rel',
          name: 'Existing',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          linkTypeId: 'ltype-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: false,
        },
      ]
      const rm = useRelationManagement(options)
      rm.removeRelation('existing-rel')
      expect(options.state.value.relations).toHaveLength(1)
      expect(options.state.value.relations[0]._isDeleted).toBe(true)
    })

    it('clears selection if removed item was selected', () => {
      options.state.value.relations = [
        {
          id: 'rel-1',
          name: 'R1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          linkTypeId: 'ltype-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      options.selectedEntity.value = { kind: 'relation', id: 'rel-1' }
      const rm = useRelationManagement(options)
      rm.removeRelation('rel-1')
      expect(options.selectedEntity.value).toBeNull()
    })

    it('does not clear selection if another item was selected', () => {
      options.state.value.relations = [
        {
          id: 'rel-1',
          name: 'R1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          linkTypeId: 'ltype-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      options.selectedEntity.value = { kind: 'relation', id: 'rel-other' }
      const rm = useRelationManagement(options)
      rm.removeRelation('rel-1')
      expect(options.selectedEntity.value).toEqual({ kind: 'relation', id: 'rel-other' })
    })

    it('does nothing for non-existent id', () => {
      const rm = useRelationManagement(options)
      rm.removeRelation('does-not-exist')
      expect(options.state.value.relations).toHaveLength(0)
    })
  })

  describe('markRelationDirty', () => {
    it('sets _isDirty=true on existing (not _isNew) relation', () => {
      options.state.value.relations = [
        {
          id: 'rel-1',
          name: 'R1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          linkTypeId: 'ltype-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: false,
        },
      ]
      const rm = useRelationManagement(options)
      rm.markRelationDirty('rel-1')
      expect(options.state.value.relations[0]._isDirty).toBe(true)
    })

    it('does not set _isDirty on _isNew relation', () => {
      options.state.value.relations = [
        {
          id: 'rel-1',
          name: 'R1',
          version: '1.0.0',
          notationId: 'notation-1',
          ownerId: 'owner-1',
          linkTypeId: 'ltype-1',
          parsedAttrs: { tags: [], customProperties: [] },
          _isNew: true,
        },
      ]
      const rm = useRelationManagement(options)
      rm.markRelationDirty('rel-1')
      expect(options.state.value.relations[0]._isDirty).toBeUndefined()
    })
  })

  describe('openRelationModal', () => {
    it('resets form fields and opens modal', () => {
      const rm = useRelationManagement(options)
      rm.relationName.value = 'leftover'
      rm.relationFormError.value = 'some error'
      rm.openRelationModal()

      expect(rm.showRelationModal.value).toBe(true)
      expect(rm.relationName.value).toBe('')
      expect(rm.relationTags.value).toBe('')
      expect(rm.relationVersion.value).toBe('1.0.0')
      expect(rm.relationNewTypeName.value).toBe('')
      expect(rm.relationFormError.value).toBeNull()
    })
  })

  describe('closeRelationModal', () => {
    it('closes modal and clears error', () => {
      const rm = useRelationManagement(options)
      rm.showRelationModal.value = true
      rm.relationFormError.value = 'error'
      rm.closeRelationModal()

      expect(rm.showRelationModal.value).toBe(false)
      expect(rm.relationFormError.value).toBeNull()
    })
  })
})

import { computed, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorDiagram, ModelEditorState } from '../types'
import { useDiagramNotationMigration } from './useDiagramNotationMigration'

vi.mock('./modelNotationComponentsApi', () => ({
  fetchAllComponentsByNotationId: vi.fn(),
}))

vi.mock('./modelNotationRelationsApi', () => ({
  fetchAllRelationsByNotationId: vi.fn(),
}))

import { fetchAllComponentsByNotationId } from './modelNotationComponentsApi'
import { fetchAllRelationsByNotationId } from './modelNotationRelationsApi'

function createState(): ModelEditorState {
  return {
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodes: [
      {
        id: 'node-1',
        name: 'N1',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'nt-1',
        parentNodeId: null,
        parsedAttrs: {
          ...parseNodeAttrs(null),
          notationComponents: { 'not-old': { componentId: 'cmp-old' } },
        },
      },
    ],
    links: [],
    diagrams: [],
    notations: [
      { id: 'not-old', name: 'ArchiMate', version: '1.0.0', ownerId: 'owner-1', attrs: null },
    ],
    nodeTypes: [],
    linkTypes: [],
    components: [
      {
        id: 'cmp-old',
        name: 'Application Component',
        version: '1.0.0',
        ownerId: 'owner-1',
        notationId: 'not-old',
        nodeTypeId: 'nt-1',
        attrs: null,
      } as never,
    ],
    relations: [],
    relationRules: [],
  }
}

function createDiagram(): EditorDiagram {
  return {
    id: 'diagram-1',
    name: 'D',
    version: '1.0.0',
    notationId: 'not-old',
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeId: null,
    parsedAttrs: {
      ...parseDiagramAttrs(null),
      instances: {
        nodes: [
          {
            id: 'inst-1',
            modelNodeId: 'node-1',
            x: 0,
            y: 0,
            attrs: { notationComponentId: 'cmp-old' },
          },
        ],
        edges: [],
      },
    },
  }
}

describe('useDiagramNotationMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchAllComponentsByNotationId).mockImplementation(async notationId => {
      if (notationId === 'not-old') {
        return [
          {
            id: 'cmp-old',
            name: 'Application Component',
            notationId: 'not-old',
            nodeTypeId: 'nt-1',
          } as never,
        ]
      }
      return [
        {
          id: 'cmp-new',
          name: 'Application Component',
          notationId: 'not-new',
          nodeTypeId: 'nt-1',
        } as never,
        {
          id: 'cmp-added',
          name: 'Application Service',
          notationId: 'not-new',
          nodeTypeId: 'nt-2',
        } as never,
      ]
    })
    vi.mocked(fetchAllRelationsByNotationId).mockResolvedValue([])
  })

  it('puts a component added only in the new notation into the editor catalog', async () => {
    const state = ref(createState())
    const diagram = ref(createDiagram())
    state.value.diagrams = [diagram.value]
    const ensureNotationImportCatalog = vi.fn(async () => undefined)
    const { openMigrateModal, confirmMigrateNotation } = useDiagramNotationMigration({
      state,
      activeDiagram: computed(() => diagram.value),
      isDiagramReadOnly: computed(() => false),
      newerNotationVersions: ref([
        {
          id: 'not-new',
          name: 'ArchiMate',
          version: '1.1.0',
          ownerId: 'owner-1',
        } as never,
      ]),
      t: key => key,
      setUiError: vi.fn(),
      markDiagramDirty: vi.fn(),
      markNodeDirty: vi.fn(),
      markLinkDirty: vi.fn(),
      ensureNotationRelationsAndRules: vi.fn(async () => undefined),
      ensureNotationImportCatalog,
    })

    openMigrateModal()
    await confirmMigrateNotation()
    await nextTick()

    expect(diagram.value.notationId).toBe('not-new')
    expect(state.value.components.map(item => item.id).sort()).toEqual([
      'cmp-added',
      'cmp-new',
      'cmp-old',
    ])
    expect(ensureNotationImportCatalog).toHaveBeenCalledWith('not-new', { force: true })
  })
})

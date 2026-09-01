import { computed, effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs } from '../modelAttrs'
import { createEmptyModelEditorState, type ModelEditorState } from '../types'
import { useModelEditorElementStyle } from './useModelEditorElementStyle'

describe('useModelEditorElementStyle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applyNodeInstanceStyleSnapshot updates instance geometry and attrs', () => {
    const scope = effectScope()
    scope.run(() => {
      const parsedAttrs = parseDiagramAttrs(null)
      parsedAttrs.instances.nodes.push({
        id: 'inst-1',
        modelNodeId: 'n-1',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        attrs: { fill: 'red' },
      })
      const diagram = {
        id: 'd-1',
        name: 'Diagram',
        version: '1.0.0',
        notationId: 'notation-1',
        modelId: 'm-1',
        ownerId: 'o-1',
        nodeId: null,
        parsedAttrs,
      }
      const state = ref({
        ...createEmptyModelEditorState(),
        diagrams: [diagram],
      })
      const markDiagramDirty = vi.fn()

      const api = useModelEditorElementStyle({
        state,
        activeDiagram: computed(() => diagram),
        activeNotationId: computed(() => 'notation-1'),
        selectedCanvasElementId: ref('instance-inst-1'),
        selectedModelNodeIds: ref([]),
        selectedModelLinkId: ref(null),
        recordDiagramHistory: vi.fn(),
        commitDiagramHistory: vi.fn(),
        markDiagramDirty,
        isNoteInstance: () => false,
        setUiError: vi.fn(),
        t: key => key,
      })

      api.applyNodeInstanceStyleSnapshot('d-1', 'inst-1', {
        width: 200,
        height: 120,
        attrs: { fill: 'blue' },
      })

      const instance = state.value.diagrams[0]!.parsedAttrs.instances.nodes[0]!
      expect(instance.width).toBe(200)
      expect(instance.height).toBe(120)
      expect(instance.attrs).toEqual({ fill: 'blue' })
      expect(markDiagramDirty).toHaveBeenCalledWith('d-1')
    })
    scope.stop()
  })

  it('restoreStyleFromNotation clears node instance diagramStyle override', () => {
    const scope = effectScope()
    scope.run(() => {
      const parsedAttrs = parseDiagramAttrs(null)
      parsedAttrs.instances.nodes.push({
        id: 'inst-1',
        modelNodeId: 'n-1',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        attrs: { diagramStyle: { fill: '#fff' } },
      })
      const diagram = {
        id: 'd-1',
        name: 'Diagram',
        version: '1.0.0',
        notationId: 'notation-1',
        modelId: 'm-1',
        ownerId: 'o-1',
        nodeId: null,
        parsedAttrs,
      }
      const state = ref<ModelEditorState>({
        ...createEmptyModelEditorState(),
        modelId: 'm-1',
        nodes: [
          {
            id: 'n-1',
            name: 'Node',
            modelId: 'm-1',
            ownerId: 'o-1',
            nodeTypeId: 'nt-1',
            parentNodeId: null,
            parsedAttrs: {
              treeOrder: 0,
              notationComponents: { 'notation-1': { componentId: 'comp-1' } },
              componentProperties: {},
              typeProperties: {},
            },
          },
        ],
        components: [
          {
            id: 'comp-1',
            notationId: 'notation-1',
            nodeTypeId: 'nt-1',
            name: 'Box',
            version: '1.0.0',
            ownerId: 'o-1',
            attrs: null,
          },
        ],
        diagrams: [diagram],
      })
      const commitDiagramHistory = vi.fn()
      const markDiagramDirty = vi.fn()

      const api = useModelEditorElementStyle({
        state,
        activeDiagram: computed(() => diagram),
        activeNotationId: computed(() => 'notation-1'),
        selectedCanvasElementId: ref('instance-inst-1'),
        selectedModelNodeIds: ref([]),
        selectedModelLinkId: ref(null),
        recordDiagramHistory: vi.fn(),
        commitDiagramHistory,
        markDiagramDirty,
        isNoteInstance: () => false,
        setUiError: vi.fn(),
        t: key => key,
      })

      api.restoreStyleFromNotation()

      const instance = state.value.diagrams[0]!.parsedAttrs.instances.nodes[0]!
      expect(instance.attrs).toBeUndefined()
      expect(markDiagramDirty).toHaveBeenCalledWith('d-1')
      expect(commitDiagramHistory).toHaveBeenCalledWith(
        expect.objectContaining({ execute: expect.any(Function), undo: expect.any(Function) })
      )
    })
    scope.stop()
  })
})

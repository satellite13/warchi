import { computed, effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import {
  toEditorDiagram,
  toEditorLink,
  toEditorNode,
  useComparisonDiff,
  type ComparisonDataSet,
} from './useComparisonDiff'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function createNode(overrides: Partial<NodeResponse> = {}): NodeResponse {
  return {
    id: 'node-1',
    name: 'Node',
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'node-type-1',
    attrs: '{"typeProperties":{"code":"A"}}',
    ...overrides,
  }
}

function createLink(overrides: Partial<LinkResponse> = {}): LinkResponse {
  return {
    id: 'link-1',
    sourceId: 'node-1',
    targetId: 'node-2',
    modelId: 'model-1',
    ownerId: 'owner-1',
    linkTypeId: 'link-type-1',
    attrs: '{"relationProperties":{"notation-1":{"relation-1":{"weight":2}}}}',
    ...overrides,
  }
}

function createDiagram(overrides: Partial<DiagramResponse> = {}): DiagramResponse {
  return {
    id: 'diagram-1',
    name: 'Diagram',
    version: '1.0.0',
    ownerId: 'owner-1',
    modelId: 'model-1',
    notationId: 'notation-1',
    attrs: '{"instances":{"nodes":[],"edges":[]}}',
    ...overrides,
  }
}

function emptyData(): ComparisonDataSet {
  return { nodes: [], links: [], diagrams: [] }
}

describe('useComparisonDiff', () => {
  it('maps API node, link and diagram responses into editor entities', () => {
    expect(toEditorNode(createNode()).parsedAttrs.typeProperties).toEqual({ code: 'A' })
    expect(toEditorLink(createLink()).parsedAttrs.relationProperties).toEqual({
      'notation-1': { 'relation-1': { weight: 2 } },
    })
    expect(toEditorDiagram(createDiagram()).parsedAttrs.instances).toEqual({
      nodes: [],
      edges: [],
    })
  })

  it('returns empty editor entity arrays for empty comparison data', () => {
    const scope = effectScope()
    scope.run(() => {
      const diff = useComparisonDiff({
        leftData: ref(emptyData()),
        rightData: ref(emptyData()),
        leftDiagram: computed(() => null),
        rightDiagram: computed(() => null),
        sharedData: ref(null),
        baseSide: ref('left'),
        selectedElement: ref(null),
      })

      expect(diff.leftEditorNodes.value).toEqual([])
      expect(diff.leftEditorLinks.value).toEqual([])
      expect(diff.rightEditorNodes.value).toEqual([])
      expect(diff.rightEditorLinks.value).toEqual([])
    })
    scope.stop()
  })

  it('maps one node on each side into editor node arrays', () => {
    const scope = effectScope()
    scope.run(() => {
      const diff = useComparisonDiff({
        leftData: ref({ ...emptyData(), nodes: [createNode({ id: 'left-node' })] }),
        rightData: ref({ ...emptyData(), nodes: [createNode({ id: 'right-node' })] }),
        leftDiagram: computed(() => null),
        rightDiagram: computed(() => null),
        sharedData: ref(null),
        baseSide: ref('left'),
        selectedElement: ref(null),
      })

      expect(diff.leftEditorNodes.value).toHaveLength(1)
      expect(diff.rightEditorNodes.value).toHaveLength(1)
    })
    scope.stop()
  })

  it('does not mark copied-model edges as modified when only modelLinkId remapped', () => {
    // ModelCopyService remaps modelLinkId/modelNodeId but keeps edge/node instance ids and stableIds.
    const leftNodes = [
      createNode({ id: 'ln-a', name: 'A', stableId: 'stable-a' }),
      createNode({ id: 'ln-b', name: 'B', stableId: 'stable-b' }),
    ]
    const rightNodes = [
      createNode({ id: 'rn-a', name: 'A', stableId: 'stable-a', modelId: 'model-2' }),
      createNode({ id: 'rn-b', name: 'B', stableId: 'stable-b', modelId: 'model-2' }),
    ]
    const leftLink = createLink({
      id: 'll-1',
      sourceId: 'ln-a',
      targetId: 'ln-b',
      stableId: 'stable-link',
      attrs: '{"relationProperties":{"notation-1":{"relation-1":{"status":"new"}}}}',
    })
    const rightLink = createLink({
      id: 'rl-1',
      sourceId: 'rn-a',
      targetId: 'rn-b',
      modelId: 'model-2',
      stableId: 'stable-link',
      attrs: '{"relationProperties":{"notation-1":{"relation-1":{"status":"new"}}}}',
    })

    const diagramAttrs = (modelLinkId: string, modelNodeA: string, modelNodeB: string) =>
      JSON.stringify({
        instances: {
          nodes: [
            { id: 'ni-a', modelNodeId: modelNodeA, x: 0, y: 0, width: 100, height: 40 },
            { id: 'ni-b', modelNodeId: modelNodeB, x: 200, y: 0, width: 100, height: 40 },
          ],
          edges: [
            {
              id: 'edge-inst-1',
              modelLinkId,
              sourceInstanceId: 'ni-a',
              targetInstanceId: 'ni-b',
              attrs: { fromPortId: 'left', toPortId: 'right' },
            },
          ],
        },
      })

    const leftDiagram = toEditorDiagram(
      createDiagram({
        id: 'ld-1',
        modelId: 'model-1',
        attrs: diagramAttrs('ll-1', 'ln-a', 'ln-b'),
      }),
    )
    const rightDiagram = toEditorDiagram(
      createDiagram({
        id: 'rd-1',
        modelId: 'model-2',
        attrs: diagramAttrs('rl-1', 'rn-a', 'rn-b'),
      }),
    )

    const scope = effectScope()
    scope.run(() => {
      const diff = useComparisonDiff({
        leftData: ref({
          nodes: leftNodes,
          links: [leftLink],
          diagrams: [leftDiagram as unknown as DiagramResponse],
        }),
        rightData: ref({
          nodes: rightNodes,
          links: [rightLink],
          diagrams: [rightDiagram as unknown as DiagramResponse],
        }),
        leftDiagram: computed(() => leftDiagram),
        rightDiagram: computed(() => rightDiagram),
        sharedData: ref(null),
        baseSide: ref('left'),
        selectedElement: ref(null),
      })

      expect(diff.leftCanvasDiffState.value.diffStateByEdgeInstanceId['edge-inst-1']).toBeUndefined()
      expect(diff.rightCanvasDiffState.value.diffStateByEdgeInstanceId['edge-inst-1']).toBeUndefined()
      expect(diff.leftCanvasDiffState.value.diffStateByModelLinkId['ll-1']).toBeUndefined()
      expect(diff.rightCanvasDiffState.value.diffStateByModelLinkId['rl-1']).toBeUndefined()
    })
    scope.stop()
  })

  it('still marks edge as modified when attachment ports differ across copied models', () => {
    const leftNodes = [
      createNode({ id: 'ln-a', name: 'A', stableId: 'stable-a' }),
      createNode({ id: 'ln-b', name: 'B', stableId: 'stable-b' }),
    ]
    const rightNodes = [
      createNode({ id: 'rn-a', name: 'A', stableId: 'stable-a', modelId: 'model-2' }),
      createNode({ id: 'rn-b', name: 'B', stableId: 'stable-b', modelId: 'model-2' }),
    ]
    const leftLink = createLink({
      id: 'll-1',
      sourceId: 'ln-a',
      targetId: 'ln-b',
      stableId: 'stable-link',
    })
    const rightLink = createLink({
      id: 'rl-1',
      sourceId: 'rn-a',
      targetId: 'rn-b',
      modelId: 'model-2',
      stableId: 'stable-link',
    })

    const diagramAttrs = (
      modelLinkId: string,
      modelNodeA: string,
      modelNodeB: string,
      fromPort: string,
      toPort: string,
    ) =>
      JSON.stringify({
        instances: {
          nodes: [
            { id: 'ni-a', modelNodeId: modelNodeA, x: 0, y: 0, width: 100, height: 40 },
            { id: 'ni-b', modelNodeId: modelNodeB, x: 200, y: 0, width: 100, height: 40 },
          ],
          edges: [
            {
              id: 'edge-inst-1',
              modelLinkId,
              sourceInstanceId: 'ni-a',
              targetInstanceId: 'ni-b',
              attrs: { fromPortId: fromPort, toPortId: toPort },
            },
          ],
        },
      })

    const leftDiagram = toEditorDiagram(
      createDiagram({
        id: 'ld-1',
        attrs: diagramAttrs('ll-1', 'ln-a', 'ln-b', 'left', 'right'),
      }),
    )
    const rightDiagram = toEditorDiagram(
      createDiagram({
        id: 'rd-1',
        modelId: 'model-2',
        attrs: diagramAttrs('rl-1', 'rn-a', 'rn-b', 'top', 'bottom'),
      }),
    )

    const scope = effectScope()
    scope.run(() => {
      const diff = useComparisonDiff({
        leftData: ref({
          nodes: leftNodes,
          links: [leftLink],
          diagrams: [leftDiagram as unknown as DiagramResponse],
        }),
        rightData: ref({
          nodes: rightNodes,
          links: [rightLink],
          diagrams: [rightDiagram as unknown as DiagramResponse],
        }),
        leftDiagram: computed(() => leftDiagram),
        rightDiagram: computed(() => rightDiagram),
        sharedData: ref(null),
        baseSide: ref('left'),
        selectedElement: ref(null),
      })

      expect(diff.leftCanvasDiffState.value.diffStateByEdgeInstanceId['edge-inst-1']).toBe('modified')
      expect(diff.rightCanvasDiffState.value.diffStateByEdgeInstanceId['edge-inst-1']).toBe(
        'modified',
      )
    })
    scope.stop()
  })
})

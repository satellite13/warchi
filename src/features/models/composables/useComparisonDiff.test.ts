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
})

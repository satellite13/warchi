import { describe, expect, it, vi } from 'vitest'
import { parseLinkAttrs, type DiagramAttrs } from '../modelAttrs'
import type { EditorLink } from '../types'
import { syncLinkEndpointsFromDiagram } from './syncLinkEndpointsFromDiagram'

function createLink(params: {
  id: string
  sourceId: string
  targetId: string
  deleted?: boolean
}): EditorLink {
  return {
    id: params.id,
    sourceId: params.sourceId,
    targetId: params.targetId,
    modelId: 'model-1',
    ownerId: 'owner-1',
    linkTypeId: 'link-type-1',
    createdAt: null,
    updatedAt: null,
    parsedAttrs: parseLinkAttrs(null),
    _isDeleted: params.deleted,
  }
}

function createDiagramAttrs(): DiagramAttrs {
  return {
    instances: {
      nodes: [
        { id: 'inst-a', modelNodeId: 'node-a', x: 0, y: 0 },
        { id: 'inst-b', modelNodeId: 'node-b', x: 0, y: 0 },
        { id: 'inst-c', modelNodeId: 'node-c', x: 0, y: 0 },
      ],
      edges: [{ id: 'edge-1', modelLinkId: 'link-1', sourceInstanceId: 'inst-a', targetInstanceId: 'inst-b' }],
    },
  }
}

describe('syncLinkEndpointsFromDiagram', () => {
  it('updates link endpoints when edge endpoint instances changed', () => {
    const prev = createDiagramAttrs()
    const next = createDiagramAttrs()
    next.instances.edges[0]!.targetInstanceId = 'inst-c'

    const links = [createLink({ id: 'link-1', sourceId: 'node-a', targetId: 'node-b' })]
    const markLinkDirty = vi.fn()

    syncLinkEndpointsFromDiagram({
      prevDiagramAttrs: prev,
      nextDiagramAttrs: next,
      links,
      markLinkDirty,
      isDiagramOnlyEdgeModelLinkId: () => false,
    })

    expect(links[0]?.sourceId).toBe('node-a')
    expect(links[0]?.targetId).toBe('node-c')
    expect(markLinkDirty).toHaveBeenCalledTimes(1)
    expect(markLinkDirty).toHaveBeenCalledWith('link-1')
  })

  it('does not update diagram-only edges', () => {
    const prev = createDiagramAttrs()
    const next = createDiagramAttrs()
    next.instances.edges[0] = {
      ...next.instances.edges[0]!,
      modelLinkId: 'note-edge-1',
      targetInstanceId: 'inst-c',
    }

    const links = [createLink({ id: 'link-1', sourceId: 'node-a', targetId: 'node-b' })]
    const markLinkDirty = vi.fn()

    syncLinkEndpointsFromDiagram({
      prevDiagramAttrs: prev,
      nextDiagramAttrs: next,
      links,
      markLinkDirty,
      isDiagramOnlyEdgeModelLinkId: modelLinkId => modelLinkId.startsWith('note-edge-'),
    })

    expect(links[0]?.targetId).toBe('node-b')
    expect(markLinkDirty).not.toHaveBeenCalled()
  })

  it('does not update when endpoints are unchanged', () => {
    const prev = createDiagramAttrs()
    const next = createDiagramAttrs()

    const links = [createLink({ id: 'link-1', sourceId: 'node-a', targetId: 'node-b' })]
    const markLinkDirty = vi.fn()

    syncLinkEndpointsFromDiagram({
      prevDiagramAttrs: prev,
      nextDiagramAttrs: next,
      links,
      markLinkDirty,
      isDiagramOnlyEdgeModelLinkId: () => false,
    })

    expect(links[0]?.sourceId).toBe('node-a')
    expect(links[0]?.targetId).toBe('node-b')
    expect(markLinkDirty).not.toHaveBeenCalled()
  })
})

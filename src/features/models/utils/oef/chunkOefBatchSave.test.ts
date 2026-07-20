import { describe, expect, it, vi } from 'vitest'
import type { BatchSaveRequest, BatchSaveResponse } from '@/features/models/composables/useModelBatchSave'
import {
  applyOefBatchSaveChunks,
  planOefBatchSaveChunks,
  remapDiagramAttrsTempIds,
} from './chunkOefBatchSave'

function sampleRequest(counts: {
  nodes: number
  links: number
  diagrams: number
}): BatchSaveRequest {
  return {
    nodes: {
      create: Array.from({ length: counts.nodes }, (_, i) => ({
        tempId: `oef-node-${i}`,
        name: `N${i}`,
        nodeTypeId: 'nt',
        parentNodeId: null,
        attrs: null,
      })),
      update: [],
      delete: [],
    },
    links: {
      create: Array.from({ length: counts.links }, (_, i) => ({
        tempId: `oef-link-${i}`,
        sourceId: `oef-node-${i % Math.max(counts.nodes, 1)}`,
        targetId: `oef-node-${(i + 1) % Math.max(counts.nodes, 1)}`,
        linkTypeId: 'lt',
        attrs: null,
      })),
      update: [],
      delete: [],
    },
    diagrams: {
      create: Array.from({ length: counts.diagrams }, (_, i) => ({
        tempId: `oef-diagram-${i}`,
        name: `D${i}`,
        version: '1.0.0',
        notationId: 'not',
        nodeId: null,
        attrs: JSON.stringify({
          instances: {
            nodes: [{ id: 'dn1', modelNodeId: 'oef-node-0' }],
            edges: [{ id: 'de1', modelLinkId: 'oef-link-0' }],
          },
        }),
      })),
      update: [],
      delete: [],
    },
  }
}

describe('chunkOefBatchSave', () => {
  it('plans node/link/diagram chunks with configured sizes', () => {
    const chunks = planOefBatchSaveChunks(sampleRequest({ nodes: 5, links: 3, diagrams: 2 }), {
      nodeChunkSize: 2,
      linkChunkSize: 2,
    })
    expect(chunks.filter(c => c.kind === 'nodes')).toHaveLength(3)
    expect(chunks.filter(c => c.kind === 'links')).toHaveLength(2)
    expect(chunks.filter(c => c.kind === 'diagrams')).toHaveLength(2)
    expect(chunks.every(c => c.kind !== 'diagrams' || c.request.diagrams.create.length === 1)).toBe(
      true
    )
  })

  it('remaps diagram attrs temp ids', () => {
    const attrs = JSON.stringify({
      instances: {
        nodes: [{ modelNodeId: 'oef-node-1' }],
        edges: [
          {
            modelLinkId: 'oef-link-1',
            sourceModelNodeId: 'oef-node-1',
            targetModelNodeId: 'oef-node-2',
          },
        ],
      },
    })
    const remapped = remapDiagramAttrsTempIds(
      attrs,
      { 'oef-node-1': 'uuid-n1', 'oef-node-2': 'uuid-n2' },
      { 'oef-link-1': 'uuid-l1' }
    )
    expect(JSON.parse(remapped!)).toEqual({
      instances: {
        nodes: [{ modelNodeId: 'uuid-n1' }],
        edges: [
          {
            modelLinkId: 'uuid-l1',
            sourceModelNodeId: 'uuid-n1',
            targetModelNodeId: 'uuid-n2',
          },
        ],
      },
    })
  })

  it('applies chunks and remaps link/diagram refs across responses', async () => {
    const calls: BatchSaveRequest[] = []
    const batchSave = vi.fn(async (_modelId: string, request: BatchSaveRequest) => {
      calls.push(structuredClone(request))
      const response: BatchSaveResponse = {
        nodeIdMap: Object.fromEntries(
          request.nodes.create.map(n => [n.tempId, `real-${n.tempId}`])
        ),
        linkIdMap: Object.fromEntries(
          request.links.create.map(l => [l.tempId, `real-${l.tempId}`])
        ),
        diagramIdMap: Object.fromEntries(
          request.diagrams.create.map(d => [d.tempId, `real-${d.tempId}`])
        ),
      }
      return { success: true as const, data: response }
    })

    const result = await applyOefBatchSaveChunks({
      modelId: 'model-1',
      request: sampleRequest({ nodes: 3, links: 2, diagrams: 1 }),
      batchSave,
      nodeChunkSize: 2,
      linkChunkSize: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.nodesCreated).toBe(3)
    expect(result.data.linksCreated).toBe(2)
    expect(result.data.diagramsCreated).toBe(1)
    expect(batchSave).toHaveBeenCalledTimes(4)

    const linkChunk = calls.find(c => c.links.create.length > 0)!
    expect(linkChunk.links.create[0]!.sourceId).toMatch(/^real-oef-node-/)
    expect(linkChunk.links.create[0]!.targetId).toMatch(/^real-oef-node-/)

    const diagramChunk = calls.find(c => c.diagrams.create.length > 0)!
    const attrs = JSON.parse(diagramChunk.diagrams.create[0]!.attrs!)
    expect(attrs.instances.nodes[0].modelNodeId).toBe('real-oef-node-0')
    expect(attrs.instances.edges[0].modelLinkId).toBe('real-oef-link-0')
  })

  it('stops on first failed chunk and reports progress in message', async () => {
    let call = 0
    const batchSave = vi.fn(async () => {
      call += 1
      if (call === 2) {
        return {
          success: false as const,
          error: { status: 500, message: 'boom' },
        }
      }
      return {
        success: true as const,
        data: { nodeIdMap: { 'oef-node-0': 'n0' }, linkIdMap: {}, diagramIdMap: {} },
      }
    })

    const result = await applyOefBatchSaveChunks({
      modelId: 'model-1',
      request: sampleRequest({ nodes: 3, links: 0, diagrams: 0 }),
      batchSave,
      nodeChunkSize: 2,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.message).toContain('chunk nodes 2/2')
    expect(result.error.message).toContain('nodes=2')
  })
})

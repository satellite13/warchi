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

  it('fails diagram chunk when oef-node temp ids remain after remap', async () => {
    const batchSave = vi.fn(async () => ({
      success: true as const,
      data: {
        nodeIdMap: {},
        linkIdMap: {},
        diagramIdMap: {},
        nodesCreated: 0,
        nodesUpdated: 0,
        nodesDeleted: 0,
        linksCreated: 0,
        linksUpdated: 0,
        linksDeleted: 0,
        diagramsCreated: 0,
        diagramsUpdated: 0,
        diagramsDeleted: 0,
      },
    }))
    const result = await applyOefBatchSaveChunks({
      modelId: 'm1',
      batchSave,
      request: {
        force: false,
        nodes: { create: [], update: [], delete: [] },
        links: { create: [], update: [], delete: [] },
        diagrams: {
          create: [
            {
              tempId: 'oef-diagram-1',
              name: 'V',
              version: '1.0.0',
              notationId: 'n1',
              nodeId: null,
              attrs: JSON.stringify({
                instances: {
                  nodes: [{ id: 'i1', modelNodeId: 'oef-node-missing', x: 0, y: 0 }],
                  edges: [],
                },
              }),
            },
          ],
          update: [],
          delete: [],
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toMatch(/unresolved oef-node/)
    }
    expect(batchSave).not.toHaveBeenCalled()
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

  it('remaps parentNodeId for node creates across earlier node chunks', async () => {
    const calls: BatchSaveRequest[] = []
    const batchSave = vi.fn(async (_modelId: string, request: BatchSaveRequest) => {
      calls.push(structuredClone(request))
      return {
        success: true as const,
        data: {
          nodeIdMap: Object.fromEntries(
            request.nodes.create.map(n => [n.tempId, `real-${n.tempId}`])
          ),
          linkIdMap: {},
          diagramIdMap: {},
        },
      }
    })

    const request: BatchSaveRequest = {
      nodes: {
        create: [
          {
            tempId: 'dir-parent',
            name: 'Parent',
            nodeTypeId: 'nt-dir',
            parentNodeId: null,
            attrs: null,
          },
          {
            tempId: 'dir-child',
            name: 'Child',
            nodeTypeId: 'nt-dir',
            parentNodeId: 'dir-parent',
            attrs: null,
          },
          {
            tempId: 'oef-node-1',
            name: 'Leaf',
            nodeTypeId: 'nt',
            parentNodeId: 'dir-child',
            attrs: null,
          },
        ],
        update: [],
        delete: [],
      },
      links: { create: [], update: [], delete: [] },
      diagrams: { create: [], update: [], delete: [] },
    }

    const result = await applyOefBatchSaveChunks({
      modelId: 'model-1',
      request,
      batchSave,
      nodeChunkSize: 1,
    })

    expect(result.success).toBe(true)
    expect(calls).toHaveLength(3)
    expect(calls[1]!.nodes.create[0]!.parentNodeId).toBe('real-dir-parent')
    expect(calls[2]!.nodes.create[0]!.parentNodeId).toBe('real-dir-child')
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

  it('plans node update chunks after creates', () => {
    const request = sampleRequest({ nodes: 2, links: 0, diagrams: 0 })
    request.nodes.update = [
      {
        id: 'existing-1',
        name: 'A',
        nodeTypeId: 'nt',
        parentNodeId: null,
        attrs: null,
        baseUpdatedAt: 't1',
      },
      {
        id: 'existing-2',
        name: 'B',
        nodeTypeId: 'nt',
        parentNodeId: null,
        attrs: null,
        baseUpdatedAt: 't2',
      },
    ]
    const chunks = planOefBatchSaveChunks(request, { nodeChunkSize: 2 })
    const nodeChunks = chunks.filter(c => c.kind === 'nodes')
    expect(nodeChunks).toHaveLength(2)
    expect(nodeChunks[0]!.request.nodes.create).toHaveLength(2)
    expect(nodeChunks[0]!.request.nodes.update).toHaveLength(0)
    expect(nodeChunks[1]!.request.nodes.create).toHaveLength(0)
    expect(nodeChunks[1]!.request.nodes.update).toHaveLength(2)
    expect(nodeChunks[1]!.totalOfKind).toBe(2)
  })

  it('leaves real reused ids intact when remapping link creates', async () => {
    const calls: BatchSaveRequest[] = []
    const batchSave = vi.fn(async (_modelId: string, request: BatchSaveRequest) => {
      calls.push(request)
      const data: BatchSaveResponse = {
        nodeIdMap: Object.fromEntries(
          request.nodes.create.map(node => [node.tempId, `real-${node.tempId}`])
        ),
        linkIdMap: Object.fromEntries(
          request.links.create.map(link => [link.tempId, `real-${link.tempId}`])
        ),
        diagramIdMap: {},
      }
      return { success: true as const, data }
    })

    const request: BatchSaveRequest = {
      nodes: {
        create: [
          {
            tempId: 'oef-node-new',
            name: 'New',
            nodeTypeId: 'nt',
            parentNodeId: null,
            attrs: null,
          },
        ],
        update: [],
        delete: [],
      },
      links: {
        create: [
          {
            tempId: 'oef-link-1',
            sourceId: 'existing-node-uuid',
            targetId: 'oef-node-new',
            linkTypeId: 'lt',
            attrs: null,
          },
        ],
        update: [],
        delete: [],
      },
      diagrams: { create: [], update: [], delete: [] },
    }

    const result = await applyOefBatchSaveChunks({
      modelId: 'model-1',
      request,
      batchSave,
    })
    expect(result.success).toBe(true)
    const linkChunk = calls.find(call => call.links.create.length > 0)
    expect(linkChunk?.links.create[0]!.sourceId).toBe('existing-node-uuid')
    expect(linkChunk?.links.create[0]!.targetId).toBe('real-oef-node-new')
  })
})

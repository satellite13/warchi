import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'
import {
  applyBatchRemapping,
  batchSave,
  buildBatchSaveRequest,
  findBlankNamedBatchNodes,
  hasBatchChanges,
  parseBatchSaveConflictDetails,
  refreshBatchSavedEntityTimestamps,
} from './useModelBatchSave'
import { apiGet, apiPost } from '@/composables/useApi'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

function createNode(overrides: Partial<EditorNode> = {}): EditorNode {
  return {
    id: 'node-1',
    name: 'Node',
    modelId: 'model-1',
    ownerId: 'owner-1',
    nodeTypeId: 'node-type-1',
    parentNodeId: null,
    parsedAttrs: parseNodeAttrs(null),
    ...overrides,
  }
}

function createLink(overrides: Partial<EditorLink> = {}): EditorLink {
  return {
    id: 'link-1',
    modelId: 'model-1',
    ownerId: 'owner-1',
    sourceId: 'node-1',
    targetId: 'node-2',
    linkTypeId: 'link-type-1',
    parsedAttrs: parseLinkAttrs(null),
    ...overrides,
  }
}

function createDiagram(overrides: Partial<EditorDiagram> = {}): EditorDiagram {
  return {
    id: 'diagram-1',
    name: 'Diagram',
    version: '1.0.0',
    modelId: 'model-1',
    ownerId: 'owner-1',
    notationId: 'notation-1',
    nodeId: null,
    parsedAttrs: parseDiagramAttrs(null),
    ...overrides,
  }
}

describe('useModelBatchSave', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset()
  })

  it('builds create, update and delete envelopes from editor flags', () => {
    const request = buildBatchSaveRequest(
      [
        createNode({ id: 'node-new', _isNew: true }),
        createNode({ id: 'node-update', _isDirty: true, updatedAt: '2026-01-01T00:00:00.000Z' }),
        createNode({ id: 'node-delete', _isDeleted: true }),
        createNode({ id: 'node-new-deleted', _isNew: true, _isDeleted: true }),
      ],
      [
        createLink({ id: 'link-new', _isNew: true }),
        createLink({ id: 'link-update', _isDirty: true, updatedAt: '2026-01-02T00:00:00.000Z' }),
        createLink({ id: 'link-delete', _isDeleted: true }),
      ],
      [
        createDiagram({ id: 'diagram-new', _isNew: true }),
        createDiagram({
          id: 'diagram-update',
          _isDirty: true,
          updatedAt: '2026-01-03T00:00:00.000Z',
        }),
        createDiagram({ id: 'diagram-delete', _isDeleted: true }),
      ],
      { force: true }
    )

    expect(request.force).toBe(true)
    expect(request.nodes.create).toHaveLength(1)
    expect(request.nodes.update).toMatchObject([
      { id: 'node-update', baseUpdatedAt: '2026-01-01T00:00:00.000Z' },
    ])
    expect(request.nodes.delete).toEqual(['node-delete'])
    expect(request.links.create).toHaveLength(1)
    expect(request.links.update).toMatchObject([
      { id: 'link-update', baseUpdatedAt: '2026-01-02T00:00:00.000Z' },
    ])
    expect(request.links.delete).toEqual(['link-delete'])
    expect(request.diagrams.create).toHaveLength(1)
    expect(request.diagrams.update).toMatchObject([
      { id: 'diagram-update', baseUpdatedAt: '2026-01-03T00:00:00.000Z' },
    ])
    expect(request.diagrams.delete).toEqual(['diagram-delete'])
  })

  it('deletes incident links when an endpoint node is deleted instead of updating them', () => {
    const request = buildBatchSaveRequest(
      [createNode({ id: 'gone', _isDeleted: true })],
      [
        createLink({
          id: 'incident-dirty',
          sourceId: 'gone',
          targetId: 'keep',
          _isDirty: true,
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
        createLink({
          id: 'incident-clean',
          sourceId: 'keep',
          targetId: 'gone',
        }),
        createLink({
          id: 'unrelated-dirty',
          sourceId: 'keep',
          targetId: 'other',
          _isDirty: true,
          updatedAt: '2026-01-03T00:00:00.000Z',
        }),
      ],
      []
    )

    expect(request.links.delete).toEqual(['incident-dirty', 'incident-clean'])
    expect(request.links.update).toMatchObject([{ id: 'unrelated-dirty' }])
    expect(request.links.create).toEqual([])
  })

  it('omits canvas attrs when a dirty diagram is still pending hydration', () => {
    const request = buildBatchSaveRequest(
      [],
      [],
      [
        createDiagram({
          id: 'diagram-moved',
          nodeId: 'folder-1',
          _isDirty: true,
          _attrsPending: true,
          updatedAt: '2026-01-03T00:00:00.000Z',
        }),
      ]
    )

    expect(request.diagrams.update).toEqual([
      expect.objectContaining({
        id: 'diagram-moved',
        nodeId: 'folder-1',
        attrs: null,
      }),
    ])
  })

  it('never deletes remote ids that are absent from the materialized arrays', () => {
    const request = buildBatchSaveRequest(
      [createNode({ id: 'loaded-clean' }), createNode({ id: 'loaded-dirty', _isDirty: true })],
      [createLink({ id: 'loaded-link' })],
      [createDiagram({ id: 'loaded-diagram' })]
    )

    expect(request.nodes.delete).toEqual([])
    expect(request.links.delete).toEqual([])
    expect(request.diagrams.delete).toEqual([])
    expect(request.nodes.update.map(row => row.id)).toEqual(['loaded-dirty'])
    expect(request.nodes.create).toEqual([])
    expect(request.links.create).toEqual([])
    expect(request.links.update).toEqual([])
    expect(request.diagrams.create).toEqual([])
    expect(request.diagrams.update).toEqual([])
    expect([...request.nodes.create, ...request.nodes.update, ...request.nodes.delete]).not.toContain(
      'unloaded-remote-node'
    )
    expect([...request.links.create, ...request.links.update, ...request.links.delete]).not.toContain(
      'unloaded-remote-link'
    )
  })

  it('sends only the one dirty materialized row', () => {
    const request = buildBatchSaveRequest(
      [
        createNode({ id: 'clean-a' }),
        createNode({ id: 'dirty', _isDirty: true, updatedAt: '2026-01-01T00:00:00.000Z' }),
        createNode({ id: 'clean-b' }),
      ],
      [createLink({ id: 'clean-link' })],
      [createDiagram({ id: 'clean-diagram' })]
    )

    expect(request.nodes.create).toEqual([])
    expect(request.nodes.delete).toEqual([])
    expect(request.nodes.update).toEqual([
      expect.objectContaining({ id: 'dirty', baseUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(request.links.create).toEqual([])
    expect(request.links.update).toEqual([])
    expect(request.links.delete).toEqual([])
    expect(request.diagrams.create).toEqual([])
    expect(request.diagrams.update).toEqual([])
    expect(request.diagrams.delete).toEqual([])
  })

  it('detects whether a batch request contains changes', () => {
    const emptyRequest = buildBatchSaveRequest([], [], [])
    const changedRequest = buildBatchSaveRequest([createNode({ _isNew: true })], [], [])

    expect(hasBatchChanges(emptyRequest)).toBe(false)
    expect(hasBatchChanges(changedRequest)).toBe(true)
  })

  it('finds create/update nodes with blank names that would fail server validation', () => {
    const blank = findBlankNamedBatchNodes([
      createNode({ id: 'ok-new', name: 'A', _isNew: true }),
      createNode({ id: 'blank-new', name: '   ', _isNew: true }),
      createNode({ id: 'blank-update', name: '', _isDirty: true }),
      createNode({ id: 'ok-clean', name: '', _isDirty: false }),
      createNode({ id: 'blank-deleted', name: '', _isDirty: true, _isDeleted: true }),
    ])
    expect(blank.map(n => n.id).sort()).toEqual(['blank-new', 'blank-update'])
  })

  it('parses valid conflict details and ignores malformed conflict rows', () => {
    expect(
      parseBatchSaveConflictDetails({
        conflicts: [
          {
            kind: 'node',
            id: 'node-1',
            serverUpdatedAt: '2026-01-01T00:00:00.000Z',
            clientBaseUpdatedAt: '2025-12-31T00:00:00.000Z',
          },
          { kind: 'link' },
        ],
      })
    ).toEqual([
      {
        kind: 'node',
        id: 'node-1',
        serverUpdatedAt: '2026-01-01T00:00:00.000Z',
        clientBaseUpdatedAt: '2025-12-31T00:00:00.000Z',
      },
    ])
    expect(parseBatchSaveConflictDetails({ conflicts: [{ kind: 'node' }] })).toBeNull()
  })

  it('posts batch saves to the encoded model endpoint', async () => {
    const apiResult = {
      success: true as const,
      data: { nodeIdMap: {}, linkIdMap: {}, diagramIdMap: {} },
    }
    vi.mocked(apiPost).mockResolvedValue(apiResult)
    const request = buildBatchSaveRequest([], [], [])

    await expect(batchSave('model/with space', request)).resolves.toBe(apiResult)
    expect(apiPost).toHaveBeenCalledWith('/models/model%2Fwith%20space/batch-save', request)
  })

  it('remaps temporary node, link and diagram ids after successful batch save', () => {
    const nodes = [createNode({ id: 'tmp-node', _isNew: true, _isDirty: true })]
    const links = [
      createLink({
        id: 'tmp-link',
        sourceId: 'tmp-node',
        targetId: 'node-existing',
        _isNew: true,
        _isDirty: true,
      }),
    ]
    const diagramAttrs = parseDiagramAttrs(null)
    diagramAttrs.instances.nodes = [{ id: 'instance-1', modelNodeId: 'tmp-node', x: 1, y: 2 }]
    diagramAttrs.instances.edges = [
      {
        id: 'edge-1',
        modelLinkId: 'tmp-link',
        sourceInstanceId: 'instance-1',
        targetInstanceId: 'instance-2',
      },
    ]
    const diagrams = [
      createDiagram({
        id: 'tmp-diagram',
        nodeId: 'tmp-node',
        parsedAttrs: diagramAttrs,
        _isNew: true,
        _isDirty: true,
      }),
    ]
    const request = buildBatchSaveRequest(nodes, links, diagrams)

    applyBatchRemapping(
      {
        nodeIdMap: { 'tmp-node': 'node-real' },
        linkIdMap: { 'tmp-link': 'link-real' },
        diagramIdMap: { 'tmp-diagram': 'diagram-real' },
      },
      nodes,
      links,
      diagrams,
      request
    )

    expect(nodes[0]).toMatchObject({ id: 'node-real', _isNew: false, _isDirty: false })
    expect(links[0]).toMatchObject({
      id: 'link-real',
      sourceId: 'node-real',
      targetId: 'node-existing',
      _isNew: false,
      _isDirty: false,
    })
    expect(diagrams[0]).toMatchObject({
      id: 'diagram-real',
      nodeId: 'node-real',
      _isNew: false,
      _isDirty: false,
    })
    expect(diagrams[0]?.parsedAttrs.instances.nodes[0]?.modelNodeId).toBe('node-real')
    expect(diagrams[0]?.parsedAttrs.instances.edges[0]?.modelLinkId).toBe('link-real')
  })

  it('refreshes updatedAt after batch save so the next save does not false-409', async () => {
    const nodes = [createNode({ id: 'node-1', updatedAt: '2026-01-01T00:00:00.000Z', _isDirty: true })]
    const links = [
      createLink({ id: 'link-1', updatedAt: '2026-01-02T00:00:00.000Z', _isDirty: true }),
    ]
    const diagrams = [
      createDiagram({ id: 'diagram-1', updatedAt: '2026-01-03T00:00:00.000Z', _isDirty: true }),
    ]
    const request = buildBatchSaveRequest(nodes, links, diagrams)
    vi.mocked(apiGet)
      .mockResolvedValueOnce({
        success: true,
        data: { ...nodes[0]!, updatedAt: '2026-01-01T01:00:00.000Z', attrs: null },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ...links[0]!, updatedAt: '2026-01-02T01:00:00.000Z', attrs: null },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ...diagrams[0]!, updatedAt: '2026-01-03T01:00:00.000Z', attrs: null },
      })

    await refreshBatchSavedEntityTimestamps(
      { nodes, links, diagrams },
      request,
      { nodeIdMap: {}, linkIdMap: {}, diagramIdMap: {} }
    )

    expect(apiGet).toHaveBeenCalledWith('/nodes/node-1')
    expect(apiGet).toHaveBeenCalledWith('/links/link-1')
    expect(apiGet).toHaveBeenCalledWith('/diagrams/diagram-1')
    expect(nodes[0]?.updatedAt).toBe('2026-01-01T01:00:00.000Z')
    expect(links[0]?.updatedAt).toBe('2026-01-02T01:00:00.000Z')
    expect(diagrams[0]?.updatedAt).toBe('2026-01-03T01:00:00.000Z')
  })
})

import { describe, expect, it } from 'vitest'
import { parseLinkAttrs, parseNodeAttrs } from '../modelAttrs'
import type { EditorLink, EditorNode } from '../types'
import { applyLocalModelDelta } from './applyLocalModelDelta'

const node = (
  id: string,
  flags: { _isNew?: boolean; _isDirty?: boolean; _isDeleted?: boolean; name?: string } = {}
): EditorNode => ({
  id,
  name: flags.name ?? id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  nodeTypeId: 'type-1',
  parentNodeId: null,
  parsedAttrs: parseNodeAttrs(null),
  ...flags,
})

const link = (
  id: string,
  sourceId: string,
  targetId: string,
  flags: { _isNew?: boolean; _isDirty?: boolean; _isDeleted?: boolean } = {}
): EditorLink => ({
  id,
  modelId: 'model-1',
  ownerId: 'owner-1',
  linkTypeId: 'type-1',
  sourceId,
  targetId,
  parsedAttrs: parseLinkAttrs(null),
  ...flags,
})

describe('applyLocalModelDelta', () => {
  it('upserts dirty and new local rows over the server snapshot', () => {
    const remoteNodes = [node('clean'), node('dirty', { name: 'server' })]
    const localNodes = [
      node('clean'),
      node('dirty', { name: 'local', _isDirty: true }),
      node('created', { _isNew: true }),
    ]

    const result = applyLocalModelDelta({
      nodes: remoteNodes,
      links: [],
    }, {
      nodes: localNodes,
      links: [],
    })

    expect(result.nodes.map(row => [row.id, row.name])).toEqual([
      ['clean', 'clean'],
      ['dirty', 'local'],
      ['created', 'created'],
    ])
  })

  it('removes locally deleted rows from the snapshot', () => {
    const result = applyLocalModelDelta({
      nodes: [node('keep'), node('gone')],
      links: [link('keep-link', 'keep', 'gone'), link('gone-link', 'gone', 'keep')],
    }, {
      nodes: [node('gone', { _isDeleted: true })],
      links: [link('gone-link', 'gone', 'keep', { _isDeleted: true })],
    })

    expect(result.nodes.map(row => row.id)).toEqual(['keep'])
    expect(result.links.map(row => row.id)).toEqual(['keep-link'])
  })

  it('does not duplicate untouched materialized rows that already exist on the server', () => {
    const remote = node('same', { name: 'server' })
    const localClean = node('same', { name: 'materialized' })

    const result = applyLocalModelDelta({
      nodes: [remote],
      links: [],
    }, {
      nodes: [localClean, node('also-clean')],
      links: [],
    })

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toBe(remote)
    expect(result.nodes[0]?.name).toBe('server')
  })

  it('keeps snapshot links whose endpoints are not in the materialized nodeById', () => {
    const materializedNodeById = new Map([['visible', node('visible')]])
    const dangling = link('dangling', 'missing-source', 'missing-target')

    const result = applyLocalModelDelta({
      nodes: [node('visible')],
      links: [dangling, link('local-only', 'visible', 'visible')],
    }, {
      nodes: [node('visible')],
      links: [],
    })

    expect(result.links.map(row => row.id)).toEqual(['dangling', 'local-only'])
    expect(materializedNodeById.has(result.links[0]!.sourceId)).toBe(false)
  })

  it('leaves editor arrays unchanged', () => {
    const remoteNodes = [node('a')]
    const localNodes = [node('a', { name: 'dirty', _isDirty: true }), node('new', { _isNew: true })]
    const remoteLinks = [link('l1', 'a', 'missing')]
    const localLinks = [link('l1', 'a', 'missing', { _isDeleted: true })]
    const remoteNodesCopy = [...remoteNodes]
    const localNodesCopy = [...localNodes]

    const result = applyLocalModelDelta({
      nodes: remoteNodes,
      links: remoteLinks,
    }, {
      nodes: localNodes,
      links: localLinks,
    })

    expect(remoteNodes).toEqual(remoteNodesCopy)
    expect(localNodes).toEqual(localNodesCopy)
    expect(remoteNodes[0]?.name).toBe('a')
    expect(localNodes).toHaveLength(2)
    expect(result.nodes.map(row => row.id)).toEqual(['a', 'new'])
    expect(result.links).toEqual([])
  })
})

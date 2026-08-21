import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { EditorLink, EditorNode, TreeParentScope } from '../types'
import { ModelPartialStore } from './modelPartialStore'

const root: TreeParentScope = { kind: 'root' }
const childScope = (nodeId: string): TreeParentScope => ({ kind: 'node', nodeId })

const node = (
  id: string,
  parentNodeId: string | null = null,
  overrides: Partial<EditorNode> = {}
): EditorNode => ({
  id,
  name: id,
  modelId: 'm',
  ownerId: 'o',
  nodeTypeId: 'nt',
  parentNodeId,
  parsedAttrs: {
    treeOrder: 0,
    notationComponents: {},
    componentProperties: {},
    typeProperties: {},
  },
  ...overrides,
})

const link = (id: string, overrides: Partial<EditorLink> = {}): EditorLink => ({
  id,
  sourceId: 'n1',
  targetId: 'n2',
  modelId: 'm',
  ownerId: 'o',
  linkTypeId: 'lt',
  parsedAttrs: {
    notationRelations: {},
    relationProperties: {},
    typeProperties: {},
  },
  ...overrides,
})

describe('ModelPartialStore tree scopes', () => {
  it('keeps earlier children pages and marks a contiguous complete scope', () => {
    const store = new ModelPartialStore()
    const request = store.beginChildrenRequest(root)

    expect(
      store.mergeNodes(
        [node('n1'), node('n2')],
        { kind: 'childrenPage', scope: root, page: 0, total: 3, last: false, token: request.token },
        request
      )
    ).toBe(true)
    expect(
      store.mergeNodes(
        [node('n3')],
        { kind: 'childrenPage', scope: root, page: 1, total: 3, last: true, token: request.token },
        request
      )
    ).toBe(true)

    expect(store.nodes.map(item => item.id)).toEqual(['n1', 'n2', 'n3'])
    expect(store.childrenByParent.get(store.scopeKey(root))).toEqual(['n1', 'n2', 'n3'])
    expect(store.childrenPages.get(store.scopeKey(root))).toMatchObject({
      nextPage: null,
      totalElements: 3,
    })
    expect(store.childrenPages.get(store.scopeKey(root))?.loadedPages).toEqual(new Set([0, 1]))
    expect(store.loadedChildrenFor.has(store.scopeKey(root))).toBe(true)
  })

  it('reconciles missing clean children only after the scope is complete', () => {
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        node('keep', 'folder'),
        node('stale', 'folder'),
        node('dirty', 'folder', { _isDirty: true, name: 'local dirty' }),
      ],
      { kind: 'partial' }
    )
    const request = store.beginChildrenRequest(childScope('folder'))
    store.mergeNodes(
      [node('keep', 'folder', { name: 'remote keep' })],
      {
        kind: 'childrenPage',
        scope: childScope('folder'),
        page: 0,
        total: 1,
        last: false,
        token: request.token,
      },
      request
    )

    expect(
      store.mergeNodes(
        [node('keep', 'folder')],
        { kind: 'childrenScope', scope: childScope('folder'), token: request.token },
        request
      )
    ).toBe(false)
    expect(store.nodeById.has('stale')).toBe(true)

    store.mergeNodes(
      [],
      {
        kind: 'childrenPage',
        scope: childScope('folder'),
        page: 1,
        total: 1,
        last: true,
        token: request.token,
      },
      request
    )
    expect(
      store.mergeNodes(
        [node('keep', 'folder')],
        { kind: 'childrenScope', scope: childScope('folder'), token: request.token },
        request
      )
    ).toBe(true)

    expect(store.nodeById.has('stale')).toBe(false)
    expect(store.nodeById.get('dirty')?.name).toBe('local dirty')
    expect(store.childrenByParent.get(store.scopeKey(childScope('folder')))).toEqual([
      'keep',
      'dirty',
    ])
  })

  it('keeps one protected outside winner when childrenScope returns the same id', () => {
    const store = new ModelPartialStore()
    store.mergeNodes(
      [node('moved', 'outside', { name: 'local winner', _isDirty: true })],
      { kind: 'partial' }
    )
    const request = store.beginChildrenRequest(childScope('inside'))
    store.mergeNodes(
      [],
      {
        kind: 'childrenPage',
        scope: childScope('inside'),
        page: 0,
        total: 0,
        last: true,
        token: request.token,
      },
      request
    )

    store.mergeNodes(
      [node('moved', 'inside')],
      { kind: 'childrenScope', scope: childScope('inside'), token: request.token },
      request
    )

    expect(store.nodes.filter(item => item.id === 'moved')).toHaveLength(1)
    expect(store.nodeById.get('moved')?.name).toBe('local winner')
    expect(store.childrenByParent.get(store.scopeKey(childScope('outside')))).toEqual(['moved'])
    expect(store.childrenByParent.get(store.scopeKey(childScope('inside')))).toBeUndefined()
  })

  it('preserves explicit root provenance when a root child receives a partial update', () => {
    const store = new ModelPartialStore()
    const request = store.beginChildrenRequest(root)
    store.mergeNodes(
      [node('root-child', 'hidden-root')],
      {
        kind: 'childrenPage',
        scope: root,
        page: 0,
        total: 1,
        last: true,
        token: request.token,
      },
      request
    )

    store.mergeNodes([node('root-child', 'hidden-root', { name: 'updated' })], { kind: 'partial' })

    expect(store.childrenByParent.get(store.scopeKey(root))).toEqual(['root-child'])
    expect(store.childrenByParent.get(store.scopeKey(childScope('hidden-root')))).toBeUndefined()
  })

  it('records childrenPage provenance through a reactive store proxy', () => {
    const store = reactive(new ModelPartialStore())
    const request = store.beginChildrenRequest(root)
    const row = node('reactive-root-child', 'hidden-root')

    store.mergeNodes(
      [row],
      {
        kind: 'childrenPage',
        scope: root,
        page: 0,
        total: 1,
        last: true,
        token: request.token,
      },
      request
    )

    expect(store.childrenByParent.get(store.scopeKey(root))).toEqual(['reactive-root-child'])
    expect(store.childrenByParent.get(store.scopeKey(childScope('hidden-root')))).toBeUndefined()
  })

  it('indexes protected childrenPage winners by their local parent provenance', () => {
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        node('dirty', 'local-parent', { _isDirty: true }),
        node('new', 'local-parent', { _isNew: true }),
        node('deleted', 'local-parent', { _isDeleted: true }),
      ],
      { kind: 'partial' }
    )
    const request = store.beginChildrenRequest(childScope('remote-parent'))

    store.mergeNodes(
      [
        node('dirty', 'remote-parent'),
        node('new', 'remote-parent'),
        node('deleted', 'remote-parent'),
      ],
      {
        kind: 'childrenPage',
        scope: childScope('remote-parent'),
        page: 0,
        total: 3,
        last: true,
        token: request.token,
      },
      request
    )

    expect(store.childrenByParent.get(store.scopeKey(childScope('local-parent')))).toEqual([
      'dirty',
      'new',
      'deleted',
    ])
    expect(store.childrenByParent.get(store.scopeKey(childScope('remote-parent')))).toBeUndefined()
  })

  it('resets scoped page completeness and totals when a full node snapshot replaces state', () => {
    const store = new ModelPartialStore()
    const request = store.beginChildrenRequest(root)
    store.mergeNodes(
      [node('old-root-child', 'hidden-root')],
      {
        kind: 'childrenPage',
        scope: root,
        page: 0,
        total: 1,
        last: true,
        token: request.token,
      },
      request
    )

    store.mergeNodes([node('full-child', 'folder')], { kind: 'full' })

    expect(
      store.mergeNodes(
        [node('stale-page', 'hidden-root')],
        {
          kind: 'childrenPage',
          scope: root,
          page: 1,
          total: 2,
          last: true,
          token: request.token,
        },
        request
      )
    ).toBe(false)
    expect(store.childrenPages.size).toBe(0)
    expect(store.loadedChildrenFor.size).toBe(0)
    expect(store.childrenByParent.get(store.scopeKey(childScope('folder')))).toEqual(['full-child'])
    expect(store.childrenByParent.get(store.scopeKey(root))).toBeUndefined()
  })

  it('ignores stale scope tokens and generations', () => {
    const store = new ModelPartialStore()
    const staleToken = store.beginChildrenRequest(root)
    store.beginChildrenRequest(root)

    expect(
      store.mergeNodes(
        [node('stale-token')],
        {
          kind: 'childrenPage',
          scope: root,
          page: 0,
          total: 1,
          last: true,
          token: staleToken.token,
        },
        staleToken
      )
    ).toBe(false)

    const staleGeneration = store.beginRequest('diagram:d1')
    store.reset()
    expect(store.mergeNodes([node('stale-generation')], { kind: 'partial' }, staleGeneration)).toBe(
      false
    )
    expect(store.nodes).toEqual([])
  })
})

describe('ModelPartialStore entity merges', () => {
  it('preserves local dirty/new/deleted rows in partial and full merges', () => {
    const store = new ModelPartialStore()
    store.mergeNodes(
      [
        node('dirty', null, { name: 'local dirty', _isDirty: true }),
        node('new', null, { _isNew: true }),
        node('deleted', null, { _isDeleted: true }),
        node('clean'),
      ],
      { kind: 'partial' }
    )

    store.mergeNodes(
      [
        node('dirty', null, { name: 'remote dirty' }),
        node('deleted', null, { name: 'remote deleted' }),
        node('remote'),
      ],
      { kind: 'full' }
    )

    expect(store.nodes.map(item => item.id)).toEqual(['dirty', 'deleted', 'remote', 'new'])
    expect(store.nodeById.get('dirty')?.name).toBe('local dirty')
    expect(store.nodeById.get('deleted')?._isDeleted).toBe(true)
    expect(store.nodeById.has('clean')).toBe(false)
  })

  it('maintains node/link indexes and moves a node between parent indexes', () => {
    const store = new ModelPartialStore()
    store.mergeNodes([node('n1', 'a'), node('n2', 'a')], { kind: 'partial' })
    store.mergeLinks([link('l1')], { kind: 'partial' })
    store.mergeNodes([node('n1', 'b')], { kind: 'partial' })

    expect(store.nodeById.get('n1')?.parentNodeId).toBe('b')
    expect(store.linkById.get('l1')?.sourceId).toBe('n1')
    expect(store.childrenByParent.get(store.scopeKey(childScope('a')))).toEqual(['n2'])
    expect(store.childrenByParent.get(store.scopeKey(childScope('b')))).toEqual(['n1'])
  })

  it('records remote tombstones, removes clean rows, and blocks resurrection', () => {
    const store = new ModelPartialStore()
    store.mergeNodes([node('gone'), node('dirty', null, { _isDirty: true })], { kind: 'partial' })
    store.mergeLinks([link('gone-link')], { kind: 'partial' })

    store.deleteRemoteNode('gone')
    store.deleteRemoteNode('dirty')
    store.deleteRemoteLink('gone-link')
    store.mergeNodes([node('gone'), node('dirty', null, { name: 'remote' })], { kind: 'partial' })
    store.mergeLinks([link('gone-link')], { kind: 'partial' })

    expect(store.remoteDeletedNodeIds).toEqual(new Set(['gone', 'dirty']))
    expect(store.remoteDeletedLinkIds).toEqual(new Set(['gone-link']))
    expect(store.nodeById.has('gone')).toBe(false)
    expect(store.nodeById.get('dirty')?._isDirty).toBe(true)
    expect(store.linkById.has('gone-link')).toBe(false)
  })
})

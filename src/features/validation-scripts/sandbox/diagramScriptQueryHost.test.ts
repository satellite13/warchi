import { describe, expect, it, vi } from 'vitest'
import { createDiagramScriptQueryHost } from './diagramScriptQueryHost'
import type { GraphNeighborResponse, LinkResponse, ModelSearchHit } from '@/types/api'

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

describe('createDiagramScriptQueryHost', () => {
  it('neighbors forwards linkType and page', async () => {
    const fetchNeighbors = vi.fn().mockResolvedValue(
      ok({ content: [], last: true })
    )
    const search = vi.fn()
    const resolveLinks = vi.fn()
    const host = createDiagramScriptQueryHost({
      modelId: 'm',
      fetchNeighbors,
      search,
      resolveLinks,
    })
    await host.handle({
      method: 'neighbors',
      args: { nodeId: 'n1', direction: 'outgoing', linkType: 'lt', page: 0 },
    })
    expect(fetchNeighbors).toHaveBeenCalledWith(
      'm',
      'n1',
      expect.objectContaining({
        direction: 'outgoing',
        linkTypeId: 'lt',
        page: 0,
      })
    )
  })

  it('neighbors returns items and last from the page', async () => {
    const item = { link: { id: 'l1' }, node: { id: 'n2' } } as GraphNeighborResponse
    const fetchNeighbors = vi.fn().mockResolvedValue(ok({ content: [item], last: false }))
    const host = createDiagramScriptQueryHost({
      modelId: 'm',
      fetchNeighbors,
      search: vi.fn(),
      resolveLinks: vi.fn(),
    })
    const result = await host.handle({
      method: 'neighbors',
      args: { nodeId: 'n1', direction: 'outgoing' },
    })
    expect(result).toEqual({ data: { items: [item], last: false } })
  })

  it('linksBetween uses resolveModelLinks with two endpoint ids', async () => {
    const resolveLinks = vi.fn().mockResolvedValue(ok({ links: [], missingLinkIds: [] }))
    const host = createDiagramScriptQueryHost({
      modelId: 'm',
      fetchNeighbors: vi.fn(),
      search: vi.fn(),
      resolveLinks,
    })
    await host.handle({ method: 'linksBetween', args: { a: 'a', b: 'b', linkType: 'lt' } })
    expect(resolveLinks).toHaveBeenCalledWith('m', { endpointNodeIds: ['a', 'b'], linkIds: [] })
  })

  it('linksBetween keeps both directions and filters by type', async () => {
    const links: LinkResponse[] = [
      { id: 'ab', sourceId: 'a', targetId: 'b', linkTypeId: 'lt' } as LinkResponse,
      { id: 'ba', sourceId: 'b', targetId: 'a', linkTypeId: 'lt' } as LinkResponse,
      { id: 'other-type', sourceId: 'a', targetId: 'b', linkTypeId: 'other' } as LinkResponse,
      { id: 'outside', sourceId: 'a', targetId: 'c', linkTypeId: 'lt' } as LinkResponse,
    ]
    const host = createDiagramScriptQueryHost({
      modelId: 'm',
      fetchNeighbors: vi.fn(),
      search: vi.fn(),
      resolveLinks: vi.fn().mockResolvedValue(ok({ links, missingLinkIds: [] })),
    })
    const result = await host.handle({
      method: 'linksBetween',
      args: { a: 'a', b: 'b', linkType: 'lt' },
    })
    expect(result).toEqual({
      data: [
        expect.objectContaining({ id: 'ab' }),
        expect.objectContaining({ id: 'ba' }),
      ],
    })
  })

  it('searchNodes rejects empty q and type', async () => {
    const search = vi.fn()
    const host = createDiagramScriptQueryHost({
      modelId: 'm',
      fetchNeighbors: vi.fn(),
      search,
      resolveLinks: vi.fn(),
    })
    const result = await host.handle({ method: 'searchNodes', args: {} })
    expect(result).toEqual({ error: 'q or type required' })
    expect(search).not.toHaveBeenCalled()
  })

  it('searchNodes uses q or type and filters by type', async () => {
    const hits: ModelSearchHit[] = [
      { kind: 'node', id: 'n1', nodeTypeId: 'nt-app', typeName: 'App' },
      { kind: 'node', id: 'n2', nodeTypeId: 'nt-db', typeName: 'Db' },
    ]
    const search = vi.fn().mockResolvedValue(ok({ hits }))
    const host = createDiagramScriptQueryHost({
      modelId: 'm',
      fetchNeighbors: vi.fn(),
      search,
      resolveLinks: vi.fn(),
    })
    const result = await host.handle({
      method: 'searchNodes',
      args: { type: 'App', limit: 80 },
    })
    expect(search).toHaveBeenCalledWith(
      'm',
      'App',
      expect.objectContaining({ kinds: ['nodes'], limit: 50 })
    )
    expect(result).toEqual({ data: [hits[0]] })
  })
})

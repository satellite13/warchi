import { describe, expect, it, vi } from 'vitest'
import { loadAllDiagramReferences } from './useAllDiagramReferences'

describe('loadAllDiagramReferences', () => {
  it('pages until last', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ success: true, data: { content: [{ id: 'd1', name: 'A' }], last: false } })
      .mockResolvedValueOnce({ success: true, data: { content: [{ id: 'd2', name: 'B' }], last: true } })
    const rows = await loadAllDiagramReferences('m', { nodeId: 'n' }, fetch)
    expect(rows.map(r => r.id)).toEqual(['d1', 'd2'])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws the API error message', async () => {
    const fetch = vi.fn().mockResolvedValue({
      success: false,
      error: { status: 500, message: 'diagram refs failed' },
    })

    await expect(loadAllDiagramReferences('m', { linkId: 'l' }, fetch)).rejects.toThrow(
      'diagram refs failed'
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops on Spring page wrappers without last flag', async () => {
    const fetch = vi.fn().mockResolvedValue({
      success: true,
      data: {
        content: [{ id: 'd1', name: 'A' }],
        page: { totalPages: 1 },
      },
    })

    const rows = await loadAllDiagramReferences('m', { nodeId: 'n' }, fetch)
    expect(rows.map(r => r.id)).toEqual(['d1'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

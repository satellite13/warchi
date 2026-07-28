import { describe, it, expect, vi } from 'vitest'
import { persistPendingShapes } from './persistPendingShapes'

describe('persistPendingShapes', () => {
  it('creates with unique names and returns id map', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'n1' })
      .mockResolvedValueOnce({ id: 'n2' })
    const remove = vi.fn()
    const map = await persistPendingShapes({
      shapes: [
        { id: 'o1', name: 'Hex', outline: '[]' },
        { id: 'o2', name: 'Hex', outline: '[]' },
      ],
      existingNames: ['Hex'],
      create: async (req) => create(req),
      remove: async (id) => {
        remove(id)
        return true
      },
    })
    expect(map.get('o1')).toBe('n1')
    expect(map.get('o2')).toBe('n2')
    expect(create.mock.calls[0]?.[0].name).toBe('Hex (2)')
    expect(create.mock.calls[1]?.[0].name).toBe('Hex (3)')
  })

  it('deletes earlier creates when a later create fails', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'n1' })
      .mockResolvedValueOnce(null)
    const remove = vi.fn().mockResolvedValue(true)
    await expect(
      persistPendingShapes({
        shapes: [
          { id: 'o1', name: 'A', outline: '[]' },
          { id: 'o2', name: 'B', outline: '[]' },
        ],
        existingNames: [],
        create: async (req) => create(req),
        remove,
      })
    ).rejects.toThrow()
    expect(remove).toHaveBeenCalledWith('n1')
  })
})

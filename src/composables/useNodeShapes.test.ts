import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('./useApi', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}))

import { useNodeShapes } from './useNodeShapes'

function mockShape(id = 'shape-1', name = 'Rectangle', version = '1.0.0') {
  return { id, name, version, ownerId: 'owner-1' }
}

function mockPaginated(
  content: unknown[],
  page = 0,
  totalPages = 1,
  totalElements = content.length
) {
  return {
    content,
    page: { totalPages, totalElements, number: page },
    totalPages,
    totalElements,
    last: true,
  }
}

describe('useNodeShapes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty list, zero total, not loading, no error', () => {
      const { list, totalElements, isLoading, error } = useNodeShapes()

      expect(list.value).toEqual([])
      expect(totalElements.value).toBe(0)
      expect(isLoading.value).toBe(false)
      expect(error.value).toBeNull()
    })
  })

  describe('fetchList', () => {
    it('fetches successfully and populates list and total', async () => {
      const shapes = [mockShape('1', 'Rect', '1.0.0'), mockShape('2', 'Circle', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated(shapes) })

      const { fetchList, list, totalElements, isLoading, error } = useNodeShapes()
      const result = await fetchList()

      expect(result).toBe(true)
      expect(mockApiGet).toHaveBeenCalledWith('/node-shapes?page=0&size=50')
      expect(list.value).toEqual(shapes)
      expect(totalElements.value).toBe(2)
      expect(isLoading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('applies pagination params', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { fetchList } = useNodeShapes()
      await fetchList({ page: 2, size: 25 })

      expect(mockApiGet).toHaveBeenCalledWith('/node-shapes?page=2&size=25')
    })

    it('applies ownerId filter', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { fetchList } = useNodeShapes()
      await fetchList({ ownerId: 'owner-42' })

      expect(mockApiGet).toHaveBeenCalledWith('/node-shapes?page=0&size=50&ownerId=owner-42')
    })

    it('applies both ownerId and pagination', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { fetchList } = useNodeShapes()
      await fetchList({ ownerId: 'owner-42', page: 1, size: 10 })

      expect(mockApiGet).toHaveBeenCalledWith('/node-shapes?page=1&size=10&ownerId=owner-42')
    })

    it('sets error on API failure', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 500, message: 'Server error' },
      })

      const { fetchList, error, isLoading } = useNodeShapes()
      const result = await fetchList()

      expect(result).toBe(false)
      expect(error.value).toBe('Server error')
      expect(isLoading.value).toBe(false)
    })

    it('handles empty content gracefully', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated([]) })

      const { fetchList, list, totalElements } = useNodeShapes()
      await fetchList()

      expect(list.value).toEqual([])
      expect(totalElements.value).toBe(0)
    })

    it('handles null content gracefully', async () => {
      mockApiGet.mockResolvedValue({ success: true, data: { content: null, totalElements: 0 } })

      const { fetchList, list } = useNodeShapes()
      const result = await fetchList()

      expect(result).toBe(true)
      expect(list.value).toEqual([])
    })
  })

  describe('fetchList with beforeUpdate', () => {
    it('gates update when beforeUpdate returns false', async () => {
      const shapes = [mockShape('1', 'Rect', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated(shapes) })

      const { fetchList, list } = useNodeShapes({ beforeUpdate: () => false })
      const result = await fetchList()

      expect(result).toBe(false)
      expect(list.value).toEqual([])
    })

    it('updates list when beforeUpdate returns true', async () => {
      const shapes = [mockShape('1', 'Rect', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated(shapes) })

      const { fetchList, list } = useNodeShapes({ beforeUpdate: () => true })
      const result = await fetchList()

      expect(result).toBe(true)
      expect(list.value).toEqual(shapes)
    })
  })

  describe('fetchById', () => {
    it('returns shape on success', async () => {
      const shape = mockShape('s-1', 'Diamond', '2.0.0')
      mockApiGet.mockResolvedValue({ success: true, data: shape })

      const { fetchById, error } = useNodeShapes()
      const result = await fetchById('s-1')

      expect(mockApiGet).toHaveBeenCalledWith('/node-shapes/s-1')
      expect(result).toEqual(shape)
      expect(error.value).toBeNull()
    })

    it('returns null and sets error on failure', async () => {
      mockApiGet.mockResolvedValue({
        success: false,
        error: { status: 404, message: 'Shape not found' },
      })

      const { fetchById, error } = useNodeShapes()
      const result = await fetchById('nonexistent')

      expect(result).toBeNull()
      expect(error.value).toBe('Shape not found')
    })
  })

  describe('create', () => {
    it('returns created shape on success', async () => {
      const created = mockShape('new-1', 'Hexagon', '1.0.0')
      const request = { name: 'Hexagon' }
      mockApiPost.mockResolvedValue({ success: true, data: created })

      const { create, error } = useNodeShapes()
      const result = await create(request)

      expect(mockApiPost).toHaveBeenCalledWith('/node-shapes', request)
      expect(result).toEqual(created)
      expect(error.value).toBeNull()
    })

    it('returns null and sets error on failure', async () => {
      mockApiPost.mockResolvedValue({
        success: false,
        error: { status: 409, message: 'Conflict' },
      })

      const { create, error } = useNodeShapes()
      const result = await create({ name: 'Dup' })

      expect(result).toBeNull()
      expect(error.value).toBe('Conflict')
    })
  })

  describe('update', () => {
    it('returns updated shape on success', async () => {
      const updated = mockShape('s-1', 'UpdatedRect', '1.1.0')
      const request = { name: 'UpdatedRect' }
      mockApiPut.mockResolvedValue({ success: true, data: updated })

      const { update, error } = useNodeShapes()
      const result = await update('s-1', request)

      expect(mockApiPut).toHaveBeenCalledWith('/node-shapes/s-1', request)
      expect(result).toEqual(updated)
      expect(error.value).toBeNull()
    })

    it('returns null and sets error on failure', async () => {
      mockApiPut.mockResolvedValue({
        success: false,
        error: { status: 422, message: 'Validation error' },
      })

      const { update, error } = useNodeShapes()
      const result = await update('s-2', { name: '' })

      expect(result).toBeNull()
      expect(error.value).toBe('Validation error')
    })
  })

  describe('remove', () => {
    it('returns true on success', async () => {
      mockApiDelete.mockResolvedValue({ success: true })

      const { remove, error } = useNodeShapes()
      const result = await remove('s-3')

      expect(mockApiDelete).toHaveBeenCalledWith('/node-shapes/s-3')
      expect(result).toBe(true)
      expect(error.value).toBeNull()
    })

    it('returns false and sets error on failure', async () => {
      mockApiDelete.mockResolvedValue({
        success: false,
        error: { status: 403, message: 'Forbidden' },
      })

      const { remove, error } = useNodeShapes()
      const result = await remove('s-3')

      expect(result).toBe(false)
      expect(error.value).toBe('Forbidden')
    })
  })

  describe('beforeUpdate gating in options', () => {
    it('beforeUpdate is called after response but before list mutation on fetchList', async () => {
      const beforeUpdateFn = vi.fn(() => true)
      const shapes = [mockShape('1', 'A', '1.0.0')]
      mockApiGet.mockResolvedValue({ success: true, data: mockPaginated(shapes) })

      const { fetchList, list } = useNodeShapes({ beforeUpdate: beforeUpdateFn })
      await fetchList()

      expect(beforeUpdateFn).toHaveBeenCalled()
      expect(list.value).toEqual(shapes)
    })
  })
})

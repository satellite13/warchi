import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiPost } from '@/api/apiClient'
import { uploadNotationExportJson } from './uploadNotationExport'

vi.mock('@/api/apiClient', () => ({
  apiPost: vi.fn(),
}))

describe('uploadNotationExportJson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts parsed JSON and returns notationId', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: {
        notationId: 'new-id',
        nodeTypeIdMap: {},
        linkTypeIdMap: {},
        componentIdMap: {},
        relationIdMap: {},
      },
    })
    const file = new File(
      [
        JSON.stringify({
          format: 'warchi-notation-export',
          version: 2,
          notation: { name: 'A', version: '1.0.0' },
          state: {},
          shapes: [],
        }),
      ],
      'a-export.json',
      { type: 'application/json' }
    )
    const result = await uploadNotationExportJson(file)
    expect(result).toEqual({ ok: true, notationId: 'new-id' })
    expect(apiPost).toHaveBeenCalledWith(
      '/notations/import',
      expect.objectContaining({ format: 'warchi-notation-export', version: 2 })
    )
  })

  it('maps 409 to CONFLICT', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'exists' },
    })
    const file = new File(['{"format":"warchi-notation-export","version":2}'], 'x.json', {
      type: 'application/json',
    })
    const result = await uploadNotationExportJson(file)
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: 'CONFLICT',
      message: 'exists',
    })
  })

  it('rejects invalid JSON before posting', async () => {
    const file = new File(['not-json'], 'x.json', { type: 'application/json' })
    const result = await uploadNotationExportJson(file)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('BAD_REQUEST')
    }
    expect(apiPost).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiFetchText = vi.fn()

vi.mock('./apiClient', () => ({
  apiFetchText: (...args: unknown[]) => mockApiFetchText(...args),
}))

import { fetchFileContent } from './fileApi'

describe('fetchFileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns file content on successful fetch', async () => {
    mockApiFetchText.mockResolvedValue({ success: true, data: '# Hello World' })

    const result = await fetchFileContent('file-123')

    expect(mockApiFetchText).toHaveBeenCalledWith('/files/file-123')
    expect(result).toBe('# Hello World')
  })

  it('returns null when apiFetchText fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockApiFetchText.mockResolvedValue({
      success: false,
      error: { status: 404, message: 'Not found' },
    })

    const result = await fetchFileContent('missing-file')

    expect(result).toBeNull()
    expect(mockApiFetchText).toHaveBeenCalledWith('/files/missing-file')
    expect(warnSpy).toHaveBeenCalledWith('[fileApi] Failed to fetch file missing-file: Not found')
    warnSpy.mockRestore()
  })

  it('returns null when apiFetchText returns error with empty message', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockApiFetchText.mockResolvedValue({
      success: false,
      error: { status: 500, message: '' },
    })

    const result = await fetchFileContent('file-456')

    expect(result).toBeNull()
    warnSpy.mockRestore()
  })

  it('handles empty string content as valid data', async () => {
    mockApiFetchText.mockResolvedValue({ success: true, data: '' })

    const result = await fetchFileContent('empty-file')

    expect(result).toBe('')
  })

  it('handles special characters in fileId', async () => {
    mockApiFetchText.mockResolvedValue({ success: true, data: 'content' })

    await fetchFileContent('file-with-dashes_and_underscores')

    expect(mockApiFetchText).toHaveBeenCalledWith('/files/file-with-dashes_and_underscores')
  })
})

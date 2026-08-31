import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/apiClient', () => ({
  apiDownload: vi.fn(),
}))

import { apiDownload } from '@/api/apiClient'
import { downloadNotationExport } from './notationExportDownload'

describe('downloadNotationExport', () => {
  const createObjectURL = vi.fn(() => 'blob:mock')
  const revokeObjectURL = vi.fn()
  const click = vi.fn()

  beforeEach(() => {
    vi.mocked(apiDownload).mockReset()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    click.mockClear()

    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(node => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(node => node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads notation export JSON', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' })
    vi.mocked(apiDownload).mockResolvedValue({
      success: true,
      data: { blob, fileName: 'notation-export.json' },
    })

    await downloadNotationExport('notation-1')

    expect(apiDownload).toHaveBeenCalledWith('/notations/notation-1/export')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalled()
  })
})

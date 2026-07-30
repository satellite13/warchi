import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/apiClient', () => ({
  apiUpload: vi.fn(),
  apiDownload: vi.fn(),
}))

import { apiDownload, apiUpload } from '@/api/apiClient'
import {
  downloadModelPackage,
  downloadNotationExport,
  uploadModelPackage,
} from './useModelPackage'

describe('uploadModelPackage', () => {
  beforeEach(() => {
    vi.mocked(apiUpload).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns modelId on success', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: true,
      data: {
        modelId: 'new-model-id',
        modelName: 'Imported',
        modelVersion: '1.0.0',
        warnings: ['skipped ref'],
      },
    })

    const file = new File(['zip'], 'package.zip', { type: 'application/zip' })
    const result = await uploadModelPackage(file)

    expect(result).toEqual({
      ok: true,
      modelId: 'new-model-id',
      modelName: 'Imported',
      modelVersion: '1.0.0',
      warnings: ['skipped ref'],
    })
    expect(apiUpload).toHaveBeenCalledWith(
      '/models/package',
      expect.any(FormData),
      expect.objectContaining({ onProgress: expect.any(Function) })
    )
    const formData = vi.mocked(apiUpload).mock.calls[0]?.[1] as FormData
    expect(formData.get('file')).toBe(file)
  })

  it('forwards upload progress as percent', async () => {
    const percents: number[] = []
    vi.mocked(apiUpload).mockImplementation(async (_path, _body, options) => {
      options?.onProgress?.({ loaded: 50, total: 100, percent: 50 })
      options?.onProgress?.({ loaded: 100, total: 100, percent: 100 })
      return {
        success: true,
        data: {
          modelId: 'id',
          modelName: 'M',
          modelVersion: '1.0.0',
          warnings: [],
        },
      }
    })

    const file = new File(['zip'], 'package.zip', { type: 'application/zip' })
    await uploadModelPackage(file, pct => percents.push(pct))

    expect(percents).toEqual([50, 100])
  })

  it('maps 409 to CONFLICT', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'Model already exists' },
    })

    const result = await uploadModelPackage(new File([], 'p.zip'))

    expect(result).toEqual({
      ok: false,
      status: 409,
      message: 'Model already exists',
      code: 'CONFLICT',
    })
  })

  it('maps 413 to PAYLOAD_TOO_LARGE', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: false,
      error: { status: 413, message: 'ZIP too large' },
    })

    const result = await uploadModelPackage(new File([], 'p.zip'))

    expect(result).toEqual({
      ok: false,
      status: 413,
      message: 'ZIP too large',
      code: 'PAYLOAD_TOO_LARGE',
    })
  })

  it('maps 400 to BAD_REQUEST', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: false,
      error: { status: 400, message: 'Invalid package' },
    })

    const result = await uploadModelPackage(new File([], 'p.zip'))

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid package',
      code: 'BAD_REQUEST',
    })
  })

  it('maps other errors without code', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: false,
      error: { status: 503, message: 'Storage unavailable' },
    })

    const result = await uploadModelPackage(new File([], 'p.zip'))

    expect(result).toEqual({
      ok: false,
      status: 503,
      message: 'Storage unavailable',
    })
  })
})

describe('downloadModelPackage', () => {
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

  it('downloads model package blob with provided file name', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' })
    vi.mocked(apiDownload).mockResolvedValue({
      success: true,
      data: { blob, fileName: 'server-name.zip' },
    })

    await downloadModelPackage('model-1', 'custom.zip')

    expect(apiDownload).toHaveBeenCalledWith('/models/model-1/package')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('throws when download fails', async () => {
    vi.mocked(apiDownload).mockResolvedValue({
      success: false,
      error: { status: 403, message: 'Forbidden' },
    })

    await expect(downloadModelPackage('model-1')).rejects.toThrow('Forbidden')
  })
})

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

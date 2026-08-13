import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/apiClient', () => ({
  apiUpload: vi.fn(),
  apiDownload: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

import { apiDownload, apiGet, apiPost, apiUpload } from '@/api/apiClient'
import {
  downloadModelPackage,
  downloadNotationExport,
  retryModelPackageImport,
  uploadModelPackage,
  type ModelPackageImportProgress,
} from './useModelPackage'

describe('uploadModelPackage', () => {
  beforeEach(() => {
    vi.mocked(apiUpload).mockReset()
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('returns modelId after async job succeeds', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: true,
      data: { jobId: 'job-1', status: 'QUEUED' },
    })
    vi.mocked(apiGet)
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-1',
          status: 'RUNNING',
          stage: 'IMPORTING_NOTATIONS',
          progress: 30,
          message: 'Importing notation 1/1',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          jobId: 'job-1',
          status: 'SUCCEEDED',
          stage: 'DONE',
          progress: 100,
          result: {
            modelId: 'new-model-id',
            modelName: 'Imported',
            modelVersion: '1.0.0',
            warnings: ['skipped ref'],
          },
        },
      })

    const file = new File(['zip'], 'package.zip', { type: 'application/zip' })
    const progressEvents: ModelPackageImportProgress[] = []
    const promise = uploadModelPackage(file, p => progressEvents.push(p), {
      pollIntervalMs: 10,
      pollTimeoutMs: 5_000,
    })
    await vi.runAllTimersAsync()
    const result = await promise

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
    expect(apiGet).toHaveBeenCalledWith('/models/package/jobs/job-1')
    expect(progressEvents.some(p => p.phase === 'processing' && p.stage === 'IMPORTING_NOTATIONS')).toBe(
      true
    )
    const formData = vi.mocked(apiUpload).mock.calls[0]?.[1] as FormData
    expect(formData.get('file')).toBe(file)
  })

  it('forwards upload progress while uploading bytes', async () => {
    const events: ModelPackageImportProgress[] = []
    vi.mocked(apiUpload).mockImplementation(async (_path, _body, options) => {
      options?.onProgress?.({ loaded: 50, total: 100, percent: 50 })
      options?.onProgress?.({ loaded: 100, total: 100, percent: 100 })
      return {
        success: true,
        data: { jobId: 'job-2', status: 'QUEUED' },
      }
    })
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-2',
        status: 'SUCCEEDED',
        stage: 'DONE',
        progress: 100,
        result: {
          modelId: 'id',
          modelName: 'M',
          modelVersion: '1.0.0',
          warnings: [],
        },
      },
    })

    const file = new File(['zip'], 'package.zip', { type: 'application/zip' })
    const promise = uploadModelPackage(file, p => events.push(p), {
      pollIntervalMs: 10,
      pollTimeoutMs: 5_000,
    })
    await vi.runAllTimersAsync()
    await promise

    expect(events.filter(e => e.phase === 'uploading').map(e => e.percent)).toEqual([50, 100])
  })

  it('maps failed job MODEL_EXISTS with conflict and jobId', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: true,
      data: { jobId: 'job-conflict', status: 'QUEUED' },
    })
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-conflict',
        status: 'FAILED',
        stage: 'CREATING_MODEL',
        progress: 75,
        error: {
          status: 409,
          message: "Model with name 'M' and version '1.0.0' already exists",
          code: 'MODEL_EXISTS',
          conflict: {
            entity: 'model',
            name: 'M',
            version: '1.0.0',
            suggestedVersion: '1.1.0',
          },
        },
      },
    })

    const promise = uploadModelPackage(new File([], 'p.zip'), undefined, {
      pollIntervalMs: 10,
      pollTimeoutMs: 5_000,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({
      ok: false,
      status: 409,
      message: "Model with name 'M' and version '1.0.0' already exists",
      code: 'MODEL_EXISTS',
      jobId: 'job-conflict',
      conflict: {
        entity: 'model',
        name: 'M',
        version: '1.0.0',
        suggestedVersion: '1.1.0',
        details: [],
      },
    })
  })

  it('retries MODEL_EXISTS job with overrides', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { jobId: 'job-conflict', status: 'QUEUED' },
    })
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-conflict',
        status: 'SUCCEEDED',
        stage: 'DONE',
        progress: 100,
        result: {
          modelId: 'new-id',
          modelName: 'M Copy',
          modelVersion: '1.0.0',
          warnings: ["Reused notation 'N' v1.0.0"],
        },
      },
    })

    const promise = retryModelPackageImport(
      'job-conflict',
      { targetModelName: 'M Copy', targetModelVersion: '1.0.0' },
      undefined,
      { pollIntervalMs: 10, pollTimeoutMs: 5_000 }
    )
    await vi.runAllTimersAsync()
    const result = await promise

    expect(apiPost).toHaveBeenCalledWith('/models/package/jobs/job-conflict/retry', {
      targetModelName: 'M Copy',
      targetModelVersion: '1.0.0',
    })
    expect(result).toEqual({
      ok: true,
      modelId: 'new-id',
      modelName: 'M Copy',
      modelVersion: '1.0.0',
      warnings: ["Reused notation 'N' v1.0.0"],
    })
  })

  it('maps upload 413 to PAYLOAD_TOO_LARGE', async () => {
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

  it('maps failed job BAD_REQUEST', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: true,
      data: { jobId: 'job-bad', status: 'QUEUED' },
    })
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-bad',
        status: 'FAILED',
        stage: 'VALIDATING',
        progress: 5,
        error: { status: 400, message: 'Invalid package', code: 'BAD_REQUEST' },
      },
    })

    const promise = uploadModelPackage(new File([], 'p.zip'), undefined, {
      pollIntervalMs: 10,
      pollTimeoutMs: 5_000,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid package',
      code: 'BAD_REQUEST',
    })
  })

  it('maps other upload errors without code', async () => {
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

  it('sanitizes nginx HTML gateway timeout responses on upload', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: false,
      error: {
        status: 504,
        message: '<html><head><title>504 Gateway Time-out</title></head></html>',
      },
    })

    const result = await uploadModelPackage(new File([], 'p.zip'))

    expect(result).toEqual({
      ok: false,
      status: 504,
      message: 'Gateway timeout',
      code: 'TIMEOUT',
    })
  })

  it('times out when job never finishes', async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      success: true,
      data: { jobId: 'job-slow', status: 'QUEUED' },
    })
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        jobId: 'job-slow',
        status: 'RUNNING',
        stage: 'IMPORTING_FILES',
        progress: 55,
        message: 'Importing files',
      },
    })

    const promise = uploadModelPackage(new File([], 'p.zip'), undefined, {
      pollIntervalMs: 50,
      pollTimeoutMs: 120,
    })
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise

    expect(result).toEqual({
      ok: false,
      status: 504,
      message: 'Import job timed out',
      code: 'TIMEOUT',
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

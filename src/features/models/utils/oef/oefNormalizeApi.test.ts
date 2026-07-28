import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { formatUploadBytes, normalizeOefFile, toOefParsedModel } from './oefNormalizeApi'
import type { OefNormalizeResponse } from './oefNormalizeApi'

vi.mock('@/api/apiClient', () => ({
  apiUpload: vi.fn(),
}))

import { apiUpload } from '@/api/apiClient'

describe('toOefParsedModel', () => {
  it('preserves properties on elements and relationships from normalize response', () => {
    const response: OefNormalizeResponse = {
      model: { id: 'm1', name: 'Model' },
      elements: [
        {
          id: 'e1',
          type: 'ApplicationComponent',
          name: 'App',
          properties: { documentation: 'Node doc' },
        },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'Association',
          name: 'Rel',
          sourceElementId: 'e1',
          targetElementId: 'e2',
          properties: { documentation: 'Link doc' },
        },
      ],
      views: [],
      issues: [],
    }

    const parsed = toOefParsedModel(response)

    expect(parsed.elements[0]?.properties).toEqual({ documentation: 'Node doc' })
    expect(parsed.relationships[0]?.properties).toEqual({ documentation: 'Link doc' })
  })

  it('drops invalid properties values', () => {
    const response = {
      model: { id: 'm1', name: 'Model' },
      elements: [
        {
          id: 'e1',
          type: 'ApplicationComponent',
          name: 'App',
          properties: 'not-an-object' as unknown as Record<string, string>,
        },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'Association',
          name: 'Rel',
          sourceElementId: 'e1',
          targetElementId: 'e2',
          properties: null as unknown as Record<string, string>,
        },
      ],
      views: [],
      issues: [],
    } satisfies OefNormalizeResponse

    const parsed = toOefParsedModel(response)

    expect(parsed.elements[0]?.properties).toBeUndefined()
    expect(parsed.relationships[0]?.properties).toBeUndefined()
  })
})

describe('formatUploadBytes', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatUploadBytes(500)).toBe('500 B')
    expect(formatUploadBytes(2048)).toBe('2.0 KB')
    expect(formatUploadBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('normalizeOefFile', () => {
  beforeEach(() => {
    vi.mocked(apiUpload).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('maps upload progress to uploading/processing phases', async () => {
    const phases: string[] = []
    vi.mocked(apiUpload).mockImplementation(async (_path, _body, options) => {
      options?.onProgress?.({ loaded: 50, total: 100, percent: 50 })
      options?.onProgress?.({ loaded: 100, total: 100, percent: 100 })
      return {
        success: true,
        data: {
          model: { id: 'm', name: 'M' },
          elements: [],
          relationships: [],
          views: [],
          issues: [],
        },
      }
    })

    const file = new File(['<model/>'], 'model.xml', { type: 'application/xml' })
    await normalizeOefFile('model-1', file, progress => {
      phases.push(`${progress.phase}:${progress.percent}`)
    })

    expect(phases).toEqual(['uploading:50', 'processing:100'])
    expect(apiUpload).toHaveBeenCalledWith(
      '/models/model-1/oef/normalize',
      expect.any(FormData),
      expect.objectContaining({ onProgress: expect.any(Function) })
    )
  })
})

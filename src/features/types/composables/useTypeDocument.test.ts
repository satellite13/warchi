import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

vi.mock('@/composables/useApi', () => ({
  apiFetch,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('@/api/config', () => ({
  buildApiUrl: (path: string) => path,
}))

vi.mock('@/api/fileApi', () => ({
  fetchFileContent: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import { useTypeDocument } from './useTypeDocument'

describe('useTypeDocument loadVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unwraps arepos ListResponse.items', async () => {
    apiFetch.mockResolvedValue({
      success: true,
      data: {
        items: [
          { versionNumber: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: 'u1', size: 10 },
          { versionNumber: 2, createdAt: '2026-01-02T00:00:00Z', createdBy: 'u1', size: 20 },
        ],
        total: 2,
        page: 0,
        size: 2,
      },
    })

    const scope = effectScope()
    const { loadVersions, docVersions } = scope.run(() => useTypeDocument())!

    await loadVersions('file-1')

    expect(docVersions.value.map((v) => v.versionNumber)).toEqual([2, 1])
    scope.stop()
  })

  it('accepts a bare array response', async () => {
    apiFetch.mockResolvedValue({
      success: true,
      data: [
        { versionNumber: 3, createdAt: '2026-01-03T00:00:00Z', createdBy: 'u1', size: 30 },
      ],
    })

    const scope = effectScope()
    const { loadVersions, docVersions } = scope.run(() => useTypeDocument())!

    await loadVersions('file-1')

    expect(docVersions.value).toHaveLength(1)
    expect(docVersions.value[0]?.versionNumber).toBe(3)
    scope.stop()
  })
})

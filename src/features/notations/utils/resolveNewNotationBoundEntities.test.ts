import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/composables/useApi'
import { resolveNewNotationBoundEntities } from './resolveNewNotationBoundEntities'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/utils/formatEntityError', () => ({
  formatEntitySaveError: vi.fn(
    (_context: string, _operation: string, entity: string, _status: number, message: string) =>
      `${entity}: ${message}`
  ),
}))

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, string>) =>
        `${key}:${params?.entity ?? ''}:${params?.name ?? ''}:${params?.version ?? ''}`,
    },
  },
}))

describe('resolveNewNotationBoundEntities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses existing component with same notation name+version', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        content: [
          {
            id: 'existing-comp',
            name: 'Application Component',
            version: '1.0.0',
          },
        ],
      },
    })

    const entity = {
      id: 'temp-1',
      name: 'Application Component',
      version: '1.0.0',
      _isNew: true as boolean | undefined,
    }
    const remaps: Array<[string, string]> = []

    await resolveNewNotationBoundEntities({
      entities: [entity],
      notationId: 'notation-1',
      ownerId: 'owner-1',
      apiEndpoint: '/components',
      entityTypeName: 'компонента',
      buildCreateRequest: () => ({ name: entity.name }),
      onRemapId: (oldId, newId) => remaps.push([oldId, newId]),
      onProgress: vi.fn(),
    })

    expect(apiPost).not.toHaveBeenCalled()
    expect(entity.id).toBe('existing-comp')
    expect(entity._isNew).toBe(false)
    expect(remaps).toEqual([['temp-1', 'existing-comp']])
  })

  it('on 409 refreshes list and reuses matching entity', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ success: true, data: { content: [] } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          content: [{ id: 'race-comp', name: 'Business Actor', version: '1.0.0' }],
        },
      })
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'Operation conflicts with existing data' },
    })

    const entity = {
      id: 'temp-2',
      name: 'Business Actor',
      version: '1.0.0',
      _isNew: true as boolean | undefined,
    }

    await resolveNewNotationBoundEntities({
      entities: [entity],
      notationId: 'notation-1',
      ownerId: 'owner-1',
      apiEndpoint: '/components',
      entityTypeName: 'компонента',
      buildCreateRequest: () => ({ name: entity.name }),
      onRemapId: vi.fn(),
      onProgress: vi.fn(),
    })

    expect(entity.id).toBe('race-comp')
    expect(entity._isNew).toBe(false)
  })

  it('rejects two new local entities with the same name+version instead of merging ids', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, data: { content: [] } })
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { id: 'created-1', name: 'Actor', version: '1.0.0' },
    })

    const first = {
      id: 'temp-a',
      name: 'Actor',
      version: '1.0.0',
      _isNew: true as boolean | undefined,
    }
    const second = {
      id: 'temp-b',
      name: 'Actor',
      version: '1.0.0',
      _isNew: true as boolean | undefined,
    }

    await expect(
      resolveNewNotationBoundEntities({
        entities: [first, second],
        notationId: 'notation-1',
        ownerId: 'owner-1',
        apiEndpoint: '/components',
        entityTypeName: 'компонента',
        buildCreateRequest: entity => ({ name: entity.name }),
        onRemapId: vi.fn(),
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/Actor/)

    expect(first.id).toBe('created-1')
    expect(second.id).toBe('temp-b')
  })
})

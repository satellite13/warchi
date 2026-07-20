import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/composables/useApi'
import { resolveNewTypes } from './resolveNewTypes'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, unknown>) =>
        `${key}:${params?.name ?? ''}:${params?.entity ?? ''}`,
    },
  },
}))

type TestType = {
  id: string
  name: string
  _isNew?: boolean
  parsedAttrs: Record<string, unknown>
}

type TestEntity = {
  id: string
  typeId: string
}

describe('resolveNewTypes', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
  })

  it('creates a new type when name is free', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { content: [], page: { number: 0, size: 1000, totalElements: 0, totalPages: 0 } },
    })
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { id: 'created-1', name: 'Application Function', attrs: null },
    })

    const types: TestType[] = [
      { id: 'temp-1', name: 'Application Function', _isNew: true, parsedAttrs: {} },
    ]
    const entities: TestEntity[] = [{ id: 'c1', typeId: 'temp-1' }]

    await resolveNewTypes({
      types,
      entities,
      typeOwnerId: 'owner-1',
      apiEndpoint: '/node-types',
      entityTypeName: 'типа узла',
      getTypeId: e => e.typeId,
      setTypeId: (e, id) => {
        e.typeId = id
      },
      parseAttrs: () => ({}),
      serializeAttrs: () => null,
      onProgress: () => undefined,
    })

    expect(types[0]?.id).toBe('created-1')
    expect(types[0]?._isNew).toBe(false)
    expect(entities[0]?.typeId).toBe('created-1')
  })

  it('on 409 refreshes list and reuses same-owner type', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce({
        success: true,
        data: { content: [], page: { number: 0, size: 1000, totalElements: 0, totalPages: 0 } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          content: [{ id: 'existing-1', name: 'Application Function', attrs: '{"a":1}' }],
          page: { number: 0, size: 1000, totalElements: 1, totalPages: 1 },
        },
      })
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'conflict' },
    })

    const types: TestType[] = [
      { id: 'temp-1', name: 'Application Function', _isNew: true, parsedAttrs: {} },
    ]
    const entities: TestEntity[] = [{ id: 'c1', typeId: 'temp-1' }]

    await resolveNewTypes({
      types,
      entities,
      typeOwnerId: 'owner-1',
      apiEndpoint: '/node-types',
      entityTypeName: 'типа узла',
      getTypeId: e => e.typeId,
      setTypeId: (e, id) => {
        e.typeId = id
      },
      parseAttrs: attrs => (attrs ? JSON.parse(attrs) : {}),
      serializeAttrs: () => null,
      onProgress: () => undefined,
    })

    expect(types[0]?.id).toBe('existing-1')
    expect(types[0]?.parsedAttrs).toEqual({ a: 1 })
    expect(entities[0]?.typeId).toBe('existing-1')
  })

  it('on 409 without reusable type throws clear conflict message', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { content: [], page: { number: 0, size: 1000, totalElements: 0, totalPages: 0 } },
    })
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'conflict' },
    })

    const types: TestType[] = [
      { id: 'temp-1', name: 'Application Function', _isNew: true, parsedAttrs: {} },
    ]

    await expect(
      resolveNewTypes({
        types,
        entities: [],
        typeOwnerId: 'owner-1',
        apiEndpoint: '/node-types',
        entityTypeName: 'типа узла',
        getTypeId: () => '',
        setTypeId: () => undefined,
        parseAttrs: () => ({}),
        serializeAttrs: () => null,
        onProgress: () => undefined,
      })
    ).rejects.toThrow('notations.typeNameConflict:Application Function:типа узла')
  })
})

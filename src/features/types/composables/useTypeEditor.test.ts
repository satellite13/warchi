import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDelete, apiGet, apiPost, apiPut } from '@/composables/useApi'
import { useTypeEditor, type TypeItem } from './useTypeEditor'

vi.mock('vue-i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (!params) return key
        return Object.entries(params).reduce(
          (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
          key,
        )
      },
    }),
  }
})

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    currentUser: { value: { id: 'owner-1', email: 'owner@test.local' } },
  }),
}))

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/api/queryHelpers', () => ({
  listParams: vi.fn(() => new URLSearchParams({ size: '1000' })),
}))

vi.mock('@/utils/resolveOwnerNames', () => ({
  normalizeOwnerId: (id: string | null | undefined) => (id ?? '').trim().toLowerCase(),
  resolveOwnerDisplayNames: vi.fn(async () => new Map([['owner-1', 'Owner']])),
  resolveOwnerLabel: vi.fn(() => 'Owner'),
}))

const ok = <T>(data: T) => ({ success: true as const, data })
const page = <T>(content: T[]) => ({ content })

function existingType(overrides: Partial<TypeItem> = {}): TypeItem {
  return {
    id: 'type-1',
    name: 'Type',
    ownerId: 'owner-1',
    kind: 'node',
    parsedAttrs: {},
    ...overrides,
  }
}

describe('useTypeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiGet).mockResolvedValue(ok(page([])))
  })

  it('addType creates a new selected item and marks the editor dirty', () => {
    const editor = useTypeEditor()

    editor.addType('node')

    expect(editor.nodeTypes.value).toHaveLength(1)
    expect(editor.selectedType.value).toMatchObject({ _isNew: true, kind: 'node' })
    expect(editor.isDirty.value).toBe(true)
  })

  it('markTypeDirty marks existing types dirty without snapshot comparison', () => {
    const editor = useTypeEditor()
    editor.nodeTypes.value = [existingType()]

    editor.selectType('type-1')
    expect(editor.isDirty.value).toBe(false)

    editor.selectedType.value!.name = 'Renamed'
    expect(editor.isDirty.value).toBe(false)

    editor.markTypeDirty(editor.selectedType.value!)
    expect(editor.selectedType.value?._isDirty).toBe(true)
    expect(editor.isDirty.value).toBe(true)
  })

  it('addCustomProperty and removeCustomProperty mark existing types dirty', () => {
    const editor = useTypeEditor()
    const item = existingType({ parsedAttrs: { customProperties: [] } })
    editor.nodeTypes.value = [item]
    editor.selectType('type-1')

    editor.addCustomProperty(item)

    expect(item.parsedAttrs.customProperties).toHaveLength(1)
    expect(item._isDirty).toBe(true)
    expect(editor.isDirty.value).toBe(true)

    item._isDirty = false
    const propertyId = item.parsedAttrs.customProperties![0]!.id
    editor.removeCustomProperty(item, propertyId)

    expect(item.parsedAttrs.customProperties).toEqual([])
    expect(item._isDirty).toBe(true)
  })

  it('saveType posts new node types and replaces the local item', async () => {
    const editor = useTypeEditor()
    editor.addType('node')
    const item = editor.selectedType.value!
    item.name = 'Created'
    vi.mocked(apiPost).mockResolvedValue(
      ok({ id: 'type-real', name: 'Created', ownerId: 'owner-1', attrs: '{"width":120}' })
    )

    await expect(editor.saveType(item)).resolves.toBe(true)

    expect(apiPost).toHaveBeenCalledWith('/node-types', {
      name: 'Created',
      ownerId: 'owner-1',
      attrs: '{}',
    })
    expect(editor.selectedTypeId.value).toBe('type-real')
    expect(editor.nodeTypes.value[0]?.id).toBe('type-real')
    expect('_isNew' in editor.nodeTypes.value[0]!).toBe(false)
    expect(editor.nodeTypes.value[0]?._isDirty).toBeUndefined()
    expect(editor.saveSuccess.value).toBe(true)
  })

  it('saveType clears dirty flags after successful updates', async () => {
    const editor = useTypeEditor()
    const item = existingType({ name: 'Renamed', _isDirty: true })
    editor.nodeTypes.value = [item]
    editor.selectType('type-1')
    vi.mocked(apiPut).mockResolvedValue(
      ok({ id: 'type-1', name: 'Renamed', ownerId: 'owner-1', attrs: '{}' })
    )

    await expect(editor.saveType(item)).resolves.toBe(true)

    expect(apiPut).toHaveBeenCalledWith('/node-types/type-1', {
      name: 'Renamed',
      attrs: '{}',
    })
    expect(editor.nodeTypes.value[0]?._isDirty).toBeUndefined()
    expect(editor.nodeTypes.value[0]?._isNew).toBeUndefined()
    expect(editor.isDirty.value).toBe(false)
  })

  it('deleteType calls the API and removes existing types', async () => {
    const editor = useTypeEditor()
    const item = existingType()
    editor.nodeTypes.value = [item]
    vi.mocked(apiDelete).mockResolvedValue(ok(undefined))

    await expect(editor.deleteType(item)).resolves.toBe(true)

    expect(apiDelete).toHaveBeenCalledWith('/node-types/type-1')
    expect(editor.nodeTypes.value).toEqual([])
  })

  it('loadUsages fetches notations and matching elements', async () => {
    const editor = useTypeEditor()
    const item = existingType()
    vi.mocked(apiGet)
      .mockResolvedValueOnce(ok(page([{ id: 'notation-1', name: 'Notation', version: '1.0.0', ownerId: 'owner-1' }])))
      .mockResolvedValueOnce(
        ok(page([{ id: 'component-1', name: 'Component', version: '1.0.0', notationId: 'notation-1', ownerId: 'owner-1', nodeTypeId: 'type-1', attrs: '{"paletteMaterialIcon":"hub"}' }]))
      )

    await editor.loadUsages(item)

    expect(apiGet).toHaveBeenCalledWith('/notations?size=1000')
    expect(apiGet).toHaveBeenCalledWith('/components?size=1000')
    expect(editor.typeUsages.value).toEqual([
      {
        notationId: 'notation-1',
        notationName: 'Notation (1.0.0)',
        notationIcon: undefined,
        elements: [{ id: 'component-1', name: 'Component', version: '1.0.0', icon: 'hub' }],
      },
    ])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { apiGet } from '@/composables/useApi'
import { useNotationEditor } from './useNotationEditor'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'notation-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
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
  pagedListParams: vi.fn((page = 0, size = 50) => new URLSearchParams({
    page: String(page),
    size: String(size),
  })),
}))

vi.mock('@/composables/useSaveState', () => ({
  useSaveState: () => ({
    isSaving: { value: false },
    saveError: { value: null },
    saveSuccess: { value: false },
    saveProgress: { value: '' },
    startSave: vi.fn(),
    completeSave: vi.fn(),
    failSave: vi.fn(),
    finishSave: vi.fn(),
  }),
}))

vi.mock('@/utils/formatEntityError', () => ({
  formatEntitySaveError: vi.fn((_context: string, _operation: string, _entity: string, _status: number, message: string) => message),
}))

vi.mock('./useRelationRulesSync', () => ({
  syncRelationRulesViaApi: vi.fn(),
}))

const ok = <T>(data: T) => ({ success: true as const, data })
const page = <T>(content: T[]) => ({ content, last: true })

describe('useNotationEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiGet)
      .mockResolvedValueOnce(ok({ id: 'notation-1', name: 'Notation', version: '1.0.0', ownerId: 'owner-1', attrs: null }))
      .mockResolvedValueOnce(ok(page([{ id: 'nt-1', name: 'NodeType', ownerId: 'owner-1' }])))
      .mockResolvedValueOnce(ok(page([{ id: 'lt-1', name: 'LinkType', ownerId: 'owner-1' }])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(ok(page([])))
      .mockResolvedValueOnce(
        ok(page([{ id: 'component-1', name: 'Component', version: '1.0.0', notationId: 'notation-1', ownerId: 'owner-1', nodeTypeId: 'nt-1' }]))
      )
      .mockResolvedValueOnce(
        ok(page([{ id: 'relation-1', name: 'Relation', version: '1.0.0', notationId: 'notation-1', ownerId: 'owner-1', linkTypeId: 'lt-1' }]))
      )
      .mockResolvedValueOnce(ok(page([])))
  })

  it('has no unsaved changes after a successful load and tracks dirty components', async () => {
    const editor = useNotationEditor()

    await editor.loadNotation()
    await nextTick()

    expect(editor.errorMessage.value).toBeNull()
    expect(editor.hasUnsavedChanges.value).toBe(false)

    const component = editor.state.value.components[0]
    expect(component).toBeDefined()
    component!._isDirty = true
    await nextTick()

    expect(editor.hasUnsavedChanges.value).toBe(true)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'

const { apiGet, apiPost, apiPut, apiDelete, checkPermission } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  checkPermission: vi.fn(),
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@/composables/useApi', () => ({
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
}))

vi.mock('@/composables/usePermissions', () => ({
  usePermissions: () => ({ checkPermission }),
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    currentUser: { value: { id: 'user-1', email: 'a@b.c' } },
  }),
}))

vi.mock('@/utils/resolveOwnerNames', () => ({
  resolveOwnerDisplayNames: vi.fn(async () => new Map([['user-1', 'Me']])),
  resolveOwnerLabel: () => 'Me',
}))

import { useValidationScriptEditor } from './useValidationScriptEditor'

describe('useValidationScriptEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({
      success: true,
      data: { content: [], totalElements: 0 },
    })
    checkPermission.mockResolvedValue(true)
  })

  it('marks dirty when local name diverges from selected detail', async () => {
    const scope = effectScope()
    const editor = scope.run(() => useValidationScriptEditor())!
    await nextTick()

    editor.selectedDetail.value = {
      id: 's1',
      name: 'Script',
      description: '',
      source: '// Script\n',
      ownerId: 'user-1',
      accessPermission: 'EDIT',
      createdAt: null,
      updatedAt: null,
    } as never
    editor.localName.value = 'Script'
    editor.localDescription.value = ''
    editor.localSource.value = '// Script\n'
    expect(editor.isDirty.value).toBe(false)

    editor.localName.value = 'Renamed'
    expect(editor.isDirty.value).toBe(true)
    scope.stop()
  })
})

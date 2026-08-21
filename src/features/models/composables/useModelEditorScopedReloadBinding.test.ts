import { effectScope } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseNodeAttrs } from '../modelAttrs'
import { useModelEditor } from './useModelEditor'

const { discardUnsavedModelChangesMock, loadModelEditorShellMock, loadModelEditorCatalogMock } =
  vi.hoisted(() => ({
    discardUnsavedModelChangesMock: vi.fn(),
    loadModelEditorShellMock: vi.fn(),
    loadModelEditorCatalogMock: vi.fn(),
  }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'model-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./discardUnsavedModelChanges', () => ({
  discardUnsavedModelChanges: discardUnsavedModelChangesMock,
}))

vi.mock('./modelEditorLoadModel', async importOriginal => {
  const actual = await importOriginal<typeof import('./modelEditorLoadModel')>()
  return {
    ...actual,
    loadModelEditorShell: loadModelEditorShellMock,
    loadModelEditorCatalog: loadModelEditorCatalogMock,
  }
})

describe('useModelEditor scoped reload binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    discardUnsavedModelChangesMock.mockResolvedValue({ ok: false, error: 'point restore failed' })
    loadModelEditorShellMock.mockResolvedValue({
      model: { id: 'model-1', name: 'Model', version: '1.0.0', ownerId: 'owner-1' },
      modelCatalog: [],
      loadedNotationIds: [],
      rootChildrenPage: {
        content: [],
        page: { number: 0, size: 500, totalElements: 0, totalPages: 0 },
      },
      state: {
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodes: [],
        links: [],
        diagrams: [],
        notations: [],
        nodeTypes: [],
        linkTypes: [],
        components: [],
        relations: [],
        relationRules: [],
      },
    })
    loadModelEditorCatalogMock.mockResolvedValue({
      modelCatalog: [],
      notations: [],
      nodeTypes: [],
      linkTypes: [],
      components: [],
      relations: [],
      relationRules: [],
    })
  })

  it('keeps unsaved edits when discard fallback reload returns ok:false', async () => {
    const vueScope = effectScope()
    const editor = vueScope.run(() => useModelEditor())!
    editor.assignScopedReload({
      reload: async () => false,
      invalidate: vi.fn(),
    })
    editor.state.value.nodes = [
      {
        id: 'new-local',
        name: 'New',
        modelId: 'model-1',
        ownerId: 'owner-1',
        nodeTypeId: 'type-1',
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
        _isNew: true,
      },
    ]

    const ok = await editor.discardUnsavedChanges()

    expect(ok).toBe(false)
    expect(editor.state.value.nodes.some(row => row.id === 'new-local' && row._isNew)).toBe(true)
    vueScope.stop()
  })

  it('bumps scoped reload generation when loadModel starts', async () => {
    const vueScope = effectScope()
    const editor = vueScope.run(() => useModelEditor())!
    const invalidate = vi.fn()
    editor.assignScopedReload({
      reload: async () => true,
      invalidate,
    })

    await editor.loadModel()

    expect(invalidate).toHaveBeenCalled()
    vueScope.stop()
  })
})

import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import DiagramCopyWizard from './DiagramCopyWizard.vue'

const folderTestState = vi.hoisted(() => ({
  rootError: null as string | null,
  rootFailedPage: null as number | null,
  rootLoading: false,
  setModel: vi.fn(),
  loadRoot: vi.fn(async () => {}),
  apiGet: vi.fn(),
  wizardOpen: vi.fn(async () => {}),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    te: () => true,
  }),
}))

vi.mock('@/composables/useApi', () => ({
  apiGet: folderTestState.apiGet,
}))

vi.mock('../composables/useDiagramCopyWizard', () => ({
  isDiagramNameVersionConflict: () => false,
  useDiagramCopyWizard: () => ({
    availableModels: ref([{ id: 'target-model', name: 'Target', version: '1.0.0' }]),
    availableNotations: ref([{ id: 'notation-1', name: 'Notation', version: '1.0.0' }]),
    targetModelId: ref('target-model'),
    targetNotationId: ref('notation-1'),
    diagramName: ref('Copy'),
    diagramVersion: ref('1.0.0'),
    folderNodeId: ref<string | null>(null),
    createParentNodeId: ref<string | null>(null),
    preview: ref({
      nodes: [],
      links: [],
      blockers: [],
      warnings: [],
      notationRemap: {
        mappedComponents: 0,
        unmappedComponents: [],
        mappedRelations: 0,
        unmappedRelations: [],
      },
    }),
    loading: ref(false),
    show: ref(true),
    step: ref(1),
    sourceDiagramId: ref('source-diagram'),
    error: ref<string | null>(null),
    canFinish: computed(() => true),
    open: folderTestState.wizardOpen,
    close: vi.fn(),
    setResolution: vi.fn(),
    commit: vi.fn(async () => null),
  }),
}))

vi.mock('../composables/useLazyFolderTree', () => ({
  useLazyFolderTree: () => ({
    scopes: ref(
      new Map([
        [
          'root',
          {
            rows: [],
            nextPage: 1,
            hasMore: false,
            loading: folderTestState.rootLoading,
            error: folderTestState.rootError,
            failedPage: folderTestState.rootFailedPage,
            expanded: true,
          },
        ],
      ])
    ),
    visibleRows: ref([
      {
        node: {
          id: 'folder-a',
          name: 'Folder A',
          modelId: 'target-model',
          ownerId: 'owner-1',
          nodeTypeId: 'directory',
          parentNodeId: null,
          hasChildren: true,
        } as NodeResponse,
        depth: 0,
      },
    ]),
    setModel: folderTestState.setModel,
    loadRoot: folderTestState.loadRoot,
    toggleFolder: vi.fn(async () => {}),
    loadMore: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
  }),
}))

const modalStub = {
  template: '<section><slot /></section>',
}

const catalogResult = (path: string) => ({
  success: true,
  data: {
    content: path.startsWith('/models')
      ? [{ id: 'target-model', name: 'Target', version: '1.0.0' }]
      : [{ id: 'notation-1', name: 'Notation', version: '1.0.0' }],
  },
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('DiagramCopyWizard folder picker', () => {
  beforeEach(() => {
    folderTestState.rootError = null
    folderTestState.rootFailedPage = null
    folderTestState.rootLoading = false
    folderTestState.setModel.mockClear()
    folderTestState.loadRoot.mockClear()
    folderTestState.apiGet.mockReset()
    folderTestState.apiGet.mockImplementation(async (path: string) => catalogResult(path))
    folderTestState.wizardOpen.mockClear()
  })

  it('renders an accessible hierarchical folder choice', async () => {
    const wrapper = mount(DiagramCopyWizard, {
      props: {
        open: true,
        sourceModelId: 'source-model',
        sourceDiagramId: 'source-diagram',
      },
      global: {
        stubs: {
          BaseModal: modalStub,
          SearchableSelect: true,
          DiagramCopyFolderPicker: {
            template: '<fieldset class="diagram-copy-folder-picker"><legend>folder</legend></fieldset>',
          },
        },
      },
    })
    await nextTick()

    expect(wrapper.find('.diagram-copy-folder-picker').exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('keeps loaded root folders visible when the next root page fails', async () => {
    folderTestState.rootError = 'Next root page failed'
    folderTestState.rootFailedPage = 1
    const wrapper = mount(DiagramCopyWizard, {
      props: {
        open: true,
        sourceModelId: 'source-model',
        sourceDiagramId: 'source-diagram',
      },
      global: {
        stubs: {
          BaseModal: modalStub,
          SearchableSelect: true,
          DiagramCopyFolderPicker: {
            props: ['folderTree'],
            template: '<div class="diagram-copy-folder-picker-stub">Folder A</div>',
          },
        },
      },
    })
    await nextTick()

    expect(wrapper.text()).toContain('Folder A')
  })

  it('announces folder loading as a polite status', async () => {
    folderTestState.rootLoading = true
    const wrapper = mount(DiagramCopyWizard, {
      props: {
        open: true,
        sourceModelId: 'source-model',
        sourceDiagramId: 'source-diagram',
      },
      global: {
        stubs: {
          BaseModal: modalStub,
          SearchableSelect: true,
          DiagramCopyFolderPicker: true,
        },
      },
    })
    await nextTick()

    expect(wrapper.findComponent({ name: 'DiagramCopyFolderPicker' }).exists()).toBe(true)
  })

  it('invalidates folder requests on close and reloads the same target on reopen', async () => {
    const wrapper = mount(DiagramCopyWizard, {
      props: {
        open: true,
        sourceModelId: 'source-model',
        sourceDiagramId: 'source-diagram',
      },
      global: {
        stubs: {
          BaseModal: modalStub,
          SearchableSelect: true,
        },
      },
    })
    await nextTick()
    folderTestState.setModel.mockClear()

    await wrapper.setProps({ open: false })
    await nextTick()
    await wrapper.setProps({ open: true })
    await vi.waitFor(() => {
      expect(folderTestState.setModel.mock.calls.map(([modelId]) => modelId)).toEqual([
        '',
        'target-model',
      ])
    })
  })

  it('does not let an old initialize cancel or reopen after close and reopen', async () => {
    const oldModels = deferred<ReturnType<typeof catalogResult>>()
    const oldNotations = deferred<ReturnType<typeof catalogResult>>()
    let requestCount = 0
    folderTestState.apiGet.mockImplementation((path: string) => {
      requestCount += 1
      if (requestCount === 1) return oldModels.promise
      if (requestCount === 2) return oldNotations.promise
      return Promise.resolve(catalogResult(path))
    })
    const wrapper = mount(DiagramCopyWizard, {
      props: {
        open: true,
        sourceModelId: 'source-model',
        sourceDiagramId: 'source-diagram',
      },
      global: {
        stubs: {
          BaseModal: modalStub,
          SearchableSelect: true,
        },
      },
    })
    await vi.waitFor(() => {
      expect(folderTestState.apiGet).toHaveBeenCalledTimes(2)
    })

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await vi.waitFor(() => {
      expect(folderTestState.wizardOpen).toHaveBeenCalledTimes(1)
    })

    oldModels.resolve(catalogResult('/models'))
    oldNotations.resolve(catalogResult('/notations'))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(folderTestState.wizardOpen).toHaveBeenCalledTimes(1)
    expect(folderTestState.setModel.mock.calls.map(([modelId]) => modelId)).toEqual([
      '',
      'target-model',
    ])
  })
})

import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeResponse } from '@/types/api'
import DiagramCopyWizard from './DiagramCopyWizard.vue'

const folderTestState = vi.hoisted(() => ({
  rootError: null as string | null,
  rootFailedPage: null as number | null,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    te: () => true,
  }),
}))

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(async () => ({ success: true, data: { content: [] } })),
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
    open: vi.fn(async () => {}),
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
            loading: false,
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
    setModel: vi.fn(),
    loadRoot: vi.fn(async () => {}),
    toggleFolder: vi.fn(async () => {}),
    loadMore: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
  }),
}))

const modalStub = {
  template: '<section><slot /></section>',
}

describe('DiagramCopyWizard folder picker', () => {
  beforeEach(() => {
    folderTestState.rootError = null
    folderTestState.rootFailedPage = null
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
        },
      },
    })
    await nextTick()

    expect(wrapper.get('.diagram-copy__folder-picker legend').text()).toBe(
      'models.diagramCopy.folder'
    )
    expect(wrapper.get('.diagram-copy__folder-toggle').attributes('aria-expanded')).toBe('false')
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
        },
      },
    })
    await nextTick()

    expect(wrapper.text()).toContain('Folder A')
    expect(wrapper.text()).toContain('Next root page failed')
    expect(wrapper.text()).toContain('common.retry')
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { parseDiagramAttrs } from '../modelAttrs'
import ModelTreePalettePanel from './ModelTreePalettePanel.vue'

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

describe('ModelTreePalettePanel', () => {
  it('renders tree panel root with empty nodes', () => {
    const wrapper = mount(ModelTreePalettePanel, {
      props: {
        nodes: [],
        diagrams: [],
        nodeTypes: [],
        selectedNodeId: null,
        selectedDiagramId: null,
      },
      global: {
        stubs: {
          UiIcon: true,
        },
      },
    })

    expect(wrapper.html().length).toBeGreaterThan(0)
  })

  it('emits the selected diagram id to open the copy wizard', async () => {
    const wrapper = mount(ModelTreePalettePanel, {
      props: {
        nodes: [],
        diagrams: [
          {
            id: 'diagram-1',
            name: 'Source diagram',
            version: '1.0.0',
            notationId: 'notation-1',
            ownerId: 'owner-1',
            modelId: 'model-1',
            nodeId: null,
            parsedAttrs: parseDiagramAttrs(null),
          },
        ],
        nodeTypes: [],
        selectedNodeId: null,
        selectedDiagramId: null,
      },
      global: {
        stubs: {
          UiIcon: true,
        },
      },
    })

    await wrapper.get('button[title="models.diagramCopy.title"]').trigger('click')

    expect(wrapper.emitted('copyDiagramToModel')).toEqual([['diagram-1']])
  })
})

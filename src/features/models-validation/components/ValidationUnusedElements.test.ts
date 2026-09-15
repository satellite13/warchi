import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ValidationUnusedElements from './ValidationUnusedElements.vue'
import { deleteUnused } from '../api'

vi.mock('../api', () => ({
  deleteUnused: vi.fn(),
}))

const deleteUnusedMock = vi.mocked(deleteUnused)

const nodes = [
  { id: 'n1', name: 'Node A', parentId: null, parentName: null },
  { id: 'n2', name: 'Node B', parentId: 'p1', parentName: 'Folder' },
]
const links = [{ id: 'l1', sourceName: 'A', targetName: 'B', linkTypeName: 'Flow' }]

function mountView(): VueWrapper {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: {},
        models: {
          validationReportUnusedHint: 'hint',
          validationReportUnusedNodes: 'Unused nodes ({count})',
          validationReportUnusedLinks: 'Unused links ({count})',
          validationReportDeleteSelected: 'Delete selected ({count})',
          validationReportDeleteConfirm: 'Delete {count}?',
          validationReportDeleteError: 'Failed',
        },
      },
    },
  })
  return mount(ValidationUnusedElements, {
    props: { modelId: 'm1', nodes, links },
    global: { plugins: [i18n] },
  })
}

describe('ValidationUnusedElements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )
  })

  it('header checkbox selects all nodes and delete sends every id', async () => {
    const wrapper = mountView()
    deleteUnusedMock.mockResolvedValue({
      success: true,
      data: {
        deletedNodeIds: ['n1', 'n2'],
        deletedLinkIds: [],
        skippedNodeIds: [],
        skippedLinkIds: [],
      },
    })

    const headers = wrapper.findAll('input[type="checkbox"]')
    expect(headers).toHaveLength(5) // 2 block headers + 2 node items + 1 link item

    await headers[0].setValue(true)
    await flushPromises()

    const button = wrapper.get('.validation-unused__delete')
    expect(button.text()).toContain('Delete selected (2)')
    await button.trigger('click')
    await flushPromises()

    expect(deleteUnusedMock).toHaveBeenCalledWith('m1', {
      nodeIds: ['n1', 'n2'],
      linkIds: [],
    })
    expect(wrapper.emitted('deleted')).toBeTruthy()
  })

  it('selects both blocks and sends nodes and links together', async () => {
    const wrapper = mountView()
    deleteUnusedMock.mockResolvedValue({
      success: true,
      data: {
        deletedNodeIds: ['n1'],
        deletedLinkIds: ['l1'],
        skippedNodeIds: [],
        skippedLinkIds: [],
      },
    })

    const headers = wrapper.findAll('input[type="checkbox"]')
    await headers[0].setValue(true) // all nodes
    await headers[3].setValue(true) // all links
    await flushPromises()

    const button = wrapper.get('.validation-unused__delete')
    expect(button.text()).toContain('Delete selected (3)')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
    await button.trigger('click')
    await flushPromises()

    expect(deleteUnusedMock).toHaveBeenCalledWith('m1', {
      nodeIds: ['n1', 'n2'],
      linkIds: ['l1'],
    })
  })
})

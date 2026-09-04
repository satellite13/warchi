import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import {
  fetchMergeLinksPreview,
  fetchMergeNodesPreview,
  mergeLinks,
  mergeNodes,
} from '@/features/models-validation/api'
import ValidationMergeWizard from './ValidationMergeWizard.vue'

vi.mock('@/features/models-validation/api', () => ({
  fetchMergeNodesPreview: vi.fn(),
  fetchMergeLinksPreview: vi.fn(),
  mergeNodes: vi.fn(),
  mergeLinks: vi.fn(),
}))

const fetchNodesPreviewMock = vi.mocked(fetchMergeNodesPreview)
const fetchLinksPreviewMock = vi.mocked(fetchMergeLinksPreview)
const mergeNodesMock = vi.mocked(mergeNodes)
const mergeLinksMock = vi.mocked(mergeLinks)

const sampleNodesPreview = {
  keepId: 'a',
  dropId: 'b',
  keepTypeProperties: { owner: 'keep', shared: 'x' },
  dropTypeProperties: { owner: 'drop', shared: 'x' },
  uniqueLinks: [
    {
      id: 'l1',
      linkTypeId: 'lt1',
      linkTypeName: 'Serving',
      direction: 'out' as const,
      otherNodeId: 'n3',
      otherNodeName: 'ERP',
    },
  ],
  linksToDelete: [
    {
      id: 'l2',
      linkTypeId: 'lt2',
      linkTypeName: 'Association',
      direction: 'in' as const,
      otherNodeId: 'n4',
      otherNodeName: 'CRM',
    },
  ],
  keepDiagrams: [{ diagramId: 'd1', diagramName: 'Landscape' }],
  dropDiagrams: [
    { diagramId: 'd2', diagramName: 'Context' },
    { diagramId: 'd3', diagramName: 'Map' },
  ],
  hasChildren: false,
  hasDocuments: true,
  diagramsToReparentCount: 1,
  keepUpdatedAt: '2026-08-22T12:00:00.000Z',
  dropUpdatedAt: '2026-08-22T12:01:00.000Z',
}

const sampleLinksPreview = {
  keepId: 'a',
  dropId: 'b',
  keepTypeProperties: { note: 'keep' },
  dropTypeProperties: { note: 'drop' },
  keepDiagrams: [{ diagramId: 'd1', diagramName: 'Landscape' }],
  dropDiagrams: [],
  keepUpdatedAt: '2026-08-22T12:00:00.000Z',
  dropUpdatedAt: '2026-08-22T12:01:00.000Z',
}

const i18nMessages = {
  en: {
    common: { loading: 'Loading...', back: 'Back', forward: 'Forward' },
    models: {
      validationReportConflict: 'The report is stale. Refresh it and merge again.',
      validationReportRefresh: 'Refresh report',
      validationReportDocumentsWarning: 'Documentation of the dropped instance will be lost.',
      validationReportStepProperties: 'Properties',
      validationReportStepLinks: 'Links',
      validationReportStepConfirm: 'Confirm',
      validationReportConfirmMerge: 'Merge',
      validationReportCancel: 'Cancel',
      validationReportPropertyColumn: 'Property',
      validationReportKeepColumn: 'Kept copy',
      validationReportDropColumn: 'Removed copy',
      validationReportResultColumn: 'Which value',
      validationReportUseKeepValue: 'from kept',
      validationReportUseDropValue: 'from removed',
      validationReportPropertiesHint:
        'Compare the two copies and choose which value the surviving entity will keep.',
      validationReportTransferLink: 'Transfer link',
      validationReportLinksToDelete: 'Will be deleted',
      validationReportReparentDiagrams: 'Diagrams to reparent: {count}',
      validationReportWillKeep: 'Will keep',
      validationReportWillDrop: 'Will be deleted',
    },
  },
}

const modalStub = {
  template: '<div><slot /><slot name="footer" /></div>',
  props: ['title', 'maxWidth'],
}

function mountWizard(kind: 'node' | 'link' = 'node') {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: i18nMessages,
  })

  return mount(ValidationMergeWizard, {
    props: {
      modelId: 'm1',
      kind,
      keepId: 'a',
      dropId: 'b',
    },
    global: {
      plugins: [i18n],
      stubs: { BaseModal: modalStub },
    },
  })
}

describe('ValidationMergeWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchNodesPreviewMock.mockResolvedValue({ success: true, data: sampleNodesPreview })
    fetchLinksPreviewMock.mockResolvedValue({ success: true, data: sampleLinksPreview })
    mergeNodesMock.mockResolvedValue({ success: true, data: { keepId: 'a', dropId: 'b' } })
    mergeLinksMock.mockResolvedValue({ success: true, data: { keepId: 'a', dropId: 'b' } })
  })

  it('loads node preview and posts merge with checked unique links', async () => {
    const wrapper = mountWizard('node')
    await flushPromises()

    expect(fetchNodesPreviewMock).toHaveBeenCalledWith('m1', { keepId: 'a', dropId: 'b' })
    expect(wrapper.text()).toContain('Compare the two copies')
    expect(wrapper.text()).toContain('Kept copy')
    expect(wrapper.text()).toContain('Removed copy')
    expect(wrapper.text()).toContain('from kept')
    expect(wrapper.text()).toContain('from removed')
    expect(wrapper.text()).toContain('owner')
    expect(wrapper.text()).toContain('keep')
    expect(wrapper.text()).toContain('drop')
    expect(wrapper.find('details').text()).toContain('1')

    await wrapper.get('.validation-merge-wizard__next').trigger('click')
    expect(wrapper.text()).toContain('Transfer link')
    expect(wrapper.text()).toContain('Serving → ERP')
    expect(wrapper.text()).toContain('Will be deleted')
    expect(wrapper.text()).toContain('Association ← CRM')
    expect(wrapper.text()).toContain('Diagrams to reparent: 1')
    expect(wrapper.get('input[type="checkbox"]').element).toBeTruthy()
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)

    await wrapper.get('.validation-merge-wizard__next').trigger('click')
    expect(wrapper.text()).toContain('Will keep')
    expect(wrapper.text()).toContain('a (1)')
    expect(wrapper.text()).toContain('Will be deleted')
    expect(wrapper.text()).toContain('b (2)')
    expect(wrapper.text()).toContain('Documentation of the dropped instance will be lost.')

    await wrapper.get('.validation-merge-wizard__submit').trigger('click')
    await flushPromises()

    expect(mergeNodesMock).toHaveBeenCalledWith('m1', {
      keepId: 'a',
      dropId: 'b',
      typeProperties: { owner: 'keep', shared: 'x' },
      transferLinkIds: ['l1'],
      keepUpdatedAt: '2026-08-22T12:00:00.000Z',
      dropUpdatedAt: '2026-08-22T12:01:00.000Z',
    })
    expect(wrapper.emitted('merged')).toHaveLength(1)
  })

  it('skips the links step for link pairs and posts mergeLinks', async () => {
    const wrapper = mountWizard('link')
    await flushPromises()

    expect(fetchLinksPreviewMock).toHaveBeenCalledWith('m1', { keepId: 'a', dropId: 'b' })
    expect(wrapper.text()).not.toContain('Transfer link')

    await wrapper.get('.validation-merge-wizard__next').trigger('click')
    expect(wrapper.text()).toContain('Confirm')
    await wrapper.get('.validation-merge-wizard__submit').trigger('click')
    await flushPromises()

    expect(mergeLinksMock).toHaveBeenCalledWith('m1', {
      keepId: 'a',
      dropId: 'b',
      typeProperties: { note: 'keep' },
      keepUpdatedAt: '2026-08-22T12:00:00.000Z',
      dropUpdatedAt: '2026-08-22T12:01:00.000Z',
    })
    expect(mergeNodesMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('merged')).toHaveLength(1)
  })

  it('shows conflict on 409 and emits refresh without retrying POST', async () => {
    mergeNodesMock.mockResolvedValue({
      success: false,
      error: { status: 409, message: 'stale' },
    })

    const wrapper = mountWizard('node')
    await flushPromises()
    await wrapper.get('.validation-merge-wizard__next').trigger('click')
    await wrapper.get('.validation-merge-wizard__next').trigger('click')
    await wrapper.get('.validation-merge-wizard__submit').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('The report is stale. Refresh it and merge again.')
    expect(wrapper.emitted('merged')).toBeUndefined()

    await wrapper.get('.validation-merge-wizard__refresh').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(mergeNodesMock).toHaveBeenCalledTimes(1)
  })

  it('emits close from cancel', async () => {
    const wrapper = mountWizard('link')
    await flushPromises()
    await wrapper.get('.validation-merge-wizard__cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

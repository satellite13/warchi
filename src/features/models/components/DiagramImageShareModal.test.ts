import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DiagramImageShareModal from './DiagramImageShareModal.vue'

const createDiagramShareLink = vi.hoisted(() => vi.fn())
const waitForPublicShareUrl = vi.hoisted(() => vi.fn())

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/useApi', () => ({
  createDiagramShareLink,
}))

vi.mock('../utils/waitForPublicShareUrl', () => ({
  waitForPublicShareUrl,
}))

const modalStub = {
  template: '<section class="base-modal"><slot /></section>',
}

const ABSOLUTE_SHARE_URL =
  'https://app.warchi.ru/api/v1/diagrams/svg/public/d61d4713-7dcf-43fe-a390-490020482fe7'

function mountModal(
  overrides: Partial<{
    visible: boolean
    diagramId: string | null
    diagramName: string
    modelId: string | null
    onUploadPreview: (diagramId: string) => Promise<boolean | void>
  }> = {}
) {
  return mount(DiagramImageShareModal, {
    props: {
      visible: true,
      diagramId: 'diagram-1',
      diagramName: 'Main',
      modelId: 'model-1',
      ...overrides,
    },
    global: {
      stubs: {
        BaseModal: modalStub,
      },
    },
  })
}

describe('DiagramImageShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    waitForPublicShareUrl.mockResolvedValue(true)
    createDiagramShareLink.mockResolvedValue({
      success: true,
      data: {
        url: ABSOLUTE_SHARE_URL,
        token: 'd61d4713-7dcf-43fe-a390-490020482fe7',
        diagramId: 'diagram-1',
      },
    })
  })

  it('regression: latest-by-name link keeps absolute API url (no double /api/v1 prefix)', async () => {
    const wrapper = mountModal()

    const latestRadio = wrapper.find('input[type="radio"][value="latest"]')
    await latestRadio.setValue(true)

    await wrapper.find('.diagram-share-modal__btn--primary').trigger('click')
    await flushPromises()

    expect(createDiagramShareLink).toHaveBeenCalledWith({
      modelId: 'model-1',
      diagramName: 'Main',
      latest: true,
    })

    const shown = wrapper.find('.diagram-share-modal__url').text()
    expect(shown).toBe(ABSOLUTE_SHARE_URL)
    expect(shown).not.toContain('/api/v1/https://')
    expect(shown.match(/\/api\/v1\//g)).toHaveLength(1)
  })

  it('regression: pinned-version link also keeps absolute API url', async () => {
    const wrapper = mountModal()

    await wrapper.find('.diagram-share-modal__btn--primary').trigger('click')
    await flushPromises()

    expect(createDiagramShareLink).toHaveBeenCalledWith({ diagramId: 'diagram-1' })
    expect(wrapper.find('.diagram-share-modal__url').text()).toBe(ABSOLUTE_SHARE_URL)
  })

  it('prefixes relative /api/v1 share paths with window origin', async () => {
    createDiagramShareLink.mockResolvedValue({
      success: true,
      data: {
        url: '/api/v1/diagrams/svg/public/abc',
        token: 'abc',
        diagramId: 'diagram-1',
      },
    })

    const wrapper = mountModal()
    await wrapper.find('.diagram-share-modal__btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.find('.diagram-share-modal__url').text()).toBe(
      `${window.location.origin}/api/v1/diagrams/svg/public/abc`
    )
  })

  it('uploads preview to resolved diagramId and waits until public URL is ready', async () => {
    createDiagramShareLink.mockResolvedValue({
      success: true,
      data: {
        url: ABSOLUTE_SHARE_URL,
        token: 'd61d4713-7dcf-43fe-a390-490020482fe7',
        diagramId: 'latest-diagram-9',
      },
    })
    const onUploadPreview = vi.fn().mockResolvedValue(true)
    const wrapper = mountModal({ onUploadPreview })

    await wrapper.find('input[type="radio"][value="latest"]').setValue(true)
    await wrapper.find('.diagram-share-modal__btn--primary').trigger('click')
    await flushPromises()

    expect(onUploadPreview).toHaveBeenCalledWith('latest-diagram-9')
    expect(waitForPublicShareUrl).toHaveBeenCalledWith(ABSOLUTE_SHARE_URL)
    expect(wrapper.find('.diagram-share-modal__url').text()).toBe(ABSOLUTE_SHARE_URL)
  })

  it('does not show url when public preview is not ready yet', async () => {
    waitForPublicShareUrl.mockResolvedValue(false)
    const wrapper = mountModal()

    await wrapper.find('.diagram-share-modal__btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.find('.diagram-share-modal__url').exists()).toBe(false)
    expect(wrapper.find('.diagram-share-modal__error').text()).toBe('diagramShare.linkNotReady')
  })

  it('exposes share url as a real link and keeps modal open after copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mountModal()
    await wrapper.find('.diagram-share-modal__btn--primary').trigger('click')
    await flushPromises()

    const link = wrapper.find('a.diagram-share-modal__url')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe(ABSOLUTE_SHARE_URL)
    expect(link.attributes('target')).toBe('_blank')

    await wrapper.find('.diagram-share-modal__btn--secondary').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(ABSOLUTE_SHARE_URL)
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('.diagram-share-modal__btn--secondary').text()).toBe('diagramShare.copied')
  })
})

import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import EntityCard from './EntityCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'ru' } }),
}))

vi.mock('@/utils/gradientColors', () => ({
  getGradient: () => 'linear-gradient(135deg, #aaa, #bbb)',
}))

vi.mock('@/utils/formatDate', () => ({
  formatDate: () => '01.01.2025',
}))

const UserAvatarStub = {
  template: '<div class="user-avatar-stub">{{ label }}</div>',
  props: ['label', 'size'],
}

const defaultProps = {
  id: 'test-id-1',
  name: 'Test Model',
  version: '1.0.0',
}

const mountCard = (props = {}) =>
  mount(EntityCard, {
    props: { ...defaultProps, ...props },
    global: {
      stubs: {
        UserAvatar: UserAvatarStub,
      },
    },
  })

describe('EntityCard', () => {
  it('renders title', () => {
    const wrapper = mountCard()
    expect(wrapper.find('.model-card__title').text()).toBe('Test Model')
  })

  it('renders version badge when no versions array', () => {
    const wrapper = mountCard()
    expect(wrapper.find('.model-card__badge').text()).toBe('v1.0.0')
  })

  it('click emits click event', async () => {
    const wrapper = mountCard()
    await wrapper.find('.model-card').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('delete button emits delete', async () => {
    const wrapper = mountCard()
    await wrapper.find('.model-card__delete').trigger('click')
    expect(wrapper.emitted('delete')).toBeTruthy()
  })

  it('rename button emits rename', async () => {
    const wrapper = mountCard()
    await wrapper.find('.model-card__rename').trigger('click')
    expect(wrapper.emitted('rename')).toBeTruthy()
  })

  it('version select emits version-change', async () => {
    const wrapper = mountCard({
      versions: ['1.0.0', '2.0.0'],
    })
    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    await select.setValue('2.0.0')
    expect(wrapper.emitted('version-change')).toBeTruthy()
    expect(wrapper.emitted('version-change')![0]).toEqual(['2.0.0'])
  })

  it('shows owner email', () => {
    const wrapper = mountCard({ ownerEmail: 'user@example.com' })
    expect(wrapper.find('.owner-email').text()).toBe('user@example.com')
  })

  it('shows unknown user when ownerEmail not provided', () => {
    const wrapper = mountCard()
    expect(wrapper.find('.owner-email').text()).toBe('common.unknownUser')
  })

  it('shows access label badge when accessLabel provided', () => {
    const wrapper = mountCard({ accessLabel: 'Editor' })
    expect(wrapper.find('.model-card__access-badge').exists()).toBe(true)
    expect(wrapper.find('.model-card__access-badge').text()).toBe('Editor')
  })

  it('does not show access label badge when not provided', () => {
    const wrapper = mountCard()
    expect(wrapper.find('.model-card__access-badge').exists()).toBe(false)
  })

  it('renders version badge for single version', () => {
    const wrapper = mountCard({ versions: ['1.0.0'] })
    expect(wrapper.find('.model-card__badge').exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('renders version select for multiple versions', () => {
    const wrapper = mountCard({ versions: ['1.0.0', '2.0.0'] })
    expect(wrapper.find('.model-card__badge').exists()).toBe(false)
    expect(wrapper.find('select').exists()).toBe(true)
  })
})

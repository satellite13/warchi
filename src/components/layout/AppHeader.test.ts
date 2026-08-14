import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppHeader from './AppHeader.vue'

const authState = vi.hoisted(() => ({
  currentUser: { value: null as { firstName?: string; email?: string } | null },
  logout: vi.fn(),
}))

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => authState,
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

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: '/docs/overview' }),
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] },
}))

function mountHeader() {
  return mount(AppHeader, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        UiIcon: true,
        AppLogo: true,
        UserAvatar: true,
        NavigationMenu: true,
        LanguageSwitcher: true,
      },
    },
  })
}

describe('AppHeader', () => {
  beforeEach(() => {
    authState.currentUser.value = null
    authState.logout.mockReset()
  })

  it('does not pretend a guest is signed in', () => {
    const wrapper = mountHeader()

    expect(wrapper.find('.logout-button').exists()).toBe(false)
    expect(wrapper.find('.user-email').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'UserAvatar' }).exists()).toBe(false)

    const signIn = wrapper.getComponent(RouterLinkStub)
    expect(signIn.attributes('data-testid')).toBe('header-sign-in')
    expect(signIn.props('to')).toEqual({
      name: 'login',
      query: { redirect: '/docs/overview' },
    })
  })

  it('shows the signed-in user and logout', () => {
    authState.currentUser.value = { firstName: 'Анна', email: 'anna@example.com' }

    const wrapper = mountHeader()

    expect(wrapper.get('.user-email').text()).toContain('Анна')
    expect(wrapper.find('.logout-button').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-sign-in"]').exists()).toBe(false)
  })
})

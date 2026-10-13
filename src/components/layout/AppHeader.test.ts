import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppHeader from './AppHeader.vue'

const authState = vi.hoisted(() => {
  const currentUser = {
    value: null as {
      firstName?: string
      email?: string
      role?: string
      roleOverride?: string | null
    } | null,
  }
  return {
    currentUser,
    logout: vi.fn(),
    switchRole: vi.fn(),
    resetRole: vi.fn(),
  }
})

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => authState,
}))

vi.mock('vue-i18n', async importOriginal => {
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
    authState.switchRole.mockReset()
    authState.resetRole.mockReset()
    authState.switchRole.mockResolvedValue({ success: true })
    authState.resetRole.mockResolvedValue({ success: true })
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

  it('hides role switch controls for non-admin users', () => {
    authState.currentUser.value = { email: 'reader@example.com', role: 'reader' }

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="role-switch-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="role-switch-return"]').exists()).toBe(false)
  })

  it('lets an admin open the role menu and switch to a role', async () => {
    authState.currentUser.value = { email: 'admin@example.com', role: 'admin' }

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="role-switch-return"]').exists()).toBe(false)
    expect(wrapper.find('.role-switch__menu').exists()).toBe(false)

    await wrapper.get('[data-testid="role-switch-button"]').trigger('click')

    const items = wrapper.findAll('.role-switch__item')
    expect(items.map(item => item.text())).toEqual([
      'featureGrants.roles.architect',
      'featureGrants.roles.editor',
      'featureGrants.roles.reader',
      'featureGrants.roles.viewer',
    ])

    await items[2]!.trigger('click')
    expect(authState.switchRole).toHaveBeenCalledTimes(1)
    expect(authState.switchRole).toHaveBeenCalledWith('reader')
  })

  it('reloads the page after a successful role switch', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    authState.currentUser.value = { email: 'admin@example.com', role: 'admin' }

    const wrapper = mountHeader()

    await wrapper.get('[data-testid="role-switch-button"]').trigger('click')
    await wrapper.get('[data-testid="role-switch-item-reader"]').trigger('click')

    expect(authState.switchRole).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when the role switch failed', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    authState.switchRole.mockResolvedValue({ success: false, error: 'denied' })
    authState.currentUser.value = { email: 'admin@example.com', role: 'admin' }

    const wrapper = mountHeader()

    await wrapper.get('[data-testid="role-switch-button"]').trigger('click')
    await wrapper.get('[data-testid="role-switch-item-reader"]').trigger('click')

    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads the page after resetting the role', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    authState.currentUser.value = {
      email: 'admin@example.com',
      role: 'viewer',
      roleOverride: 'admin',
    }

    const wrapper = mountHeader()

    await wrapper.get('[data-testid="role-switch-return"]').trigger('click')

    expect(authState.resetRole).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the return button for a switched session and resets back', async () => {
    authState.currentUser.value = {
      email: 'admin@example.com',
      role: 'viewer',
      roleOverride: 'admin',
    }

    const wrapper = mountHeader()

    expect(wrapper.find('[data-testid="role-switch-button"]').exists()).toBe(false)
    expect(wrapper.find('.user-role').classes()).toContain('user-role--temporary')

    await wrapper.get('[data-testid="role-switch-return"]').trigger('click')
    expect(authState.resetRole).toHaveBeenCalledTimes(1)
    expect(authState.switchRole).not.toHaveBeenCalled()
  })

  it('renders localized role label instead of raw role id', () => {
    authState.currentUser.value = { email: 'editor@example.com', role: 'editor' }

    const wrapper = mountHeader()

    expect(wrapper.get('.user-role').text()).toBe('featureGrants.roles.editor')
  })
})

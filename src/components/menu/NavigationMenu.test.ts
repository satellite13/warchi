import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NavigationMenu from './NavigationMenu.vue'
import { canViewAdminPanel } from '../../composables/usePermissions'

const authState = vi.hoisted(() => ({
  currentUser: { value: null as { id: string } | null },
}))

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => ({
    currentUser: authState.currentUser,
  }),
}))

vi.mock('../../composables/usePermissions', () => ({
  canViewAdminPanel: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function mountMenu() {
  return mount(NavigationMenu, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        UiIcon: true,
      },
    },
  })
}

describe('NavigationMenu', () => {
  beforeEach(() => {
    authState.currentUser.value = null
    vi.mocked(canViewAdminPanel).mockReset()
  })

  it('shows only documentation to guests', () => {
    const wrapper = mountMenu()
    const destinations = wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))

    expect(destinations).toEqual(['/docs'])
  })

  it('shows the workspace links when the user is signed in', async () => {
    authState.currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)

    const wrapper = mountMenu()
    await flushPromises()

    const destinations = wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))
    expect(destinations).toContain('/models')
    expect(destinations).toContain('/docs')
    expect(destinations).toContain('/wiki')
    expect(destinations).toContain('/profile')
  })

  it('shows the admin link when policy allows viewing the admin panel', async () => {
    authState.currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(true)

    const wrapper = mountMenu()
    await flushPromises()

    expect(canViewAdminPanel).toHaveBeenCalledWith('user-1')
    expect(
      wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/admin')
    ).toBe(true)
  })

  it('hides the admin link when there is no authenticated user', async () => {
    const wrapper = mountMenu()
    await flushPromises()

    expect(canViewAdminPanel).not.toHaveBeenCalled()
    expect(
      wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/admin')
    ).toBe(false)
  })

  it('hides the admin link when policy denies viewing the admin panel', async () => {
    authState.currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)

    const wrapper = mountMenu()
    await flushPromises()

    expect(canViewAdminPanel).toHaveBeenCalledWith('user-1')
    expect(
      wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/admin')
    ).toBe(false)
  })
})

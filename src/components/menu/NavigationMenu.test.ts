import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import NavigationMenu from './NavigationMenu.vue'
import { canViewAdminPanel } from '../../composables/usePermissions'

interface NavUser {
  id: string
  role?: string
  roleOverride?: string | null
}

const currentUser = ref<NavUser | null>(null)

const grantsState = vi.hoisted(() => ({
  hasGrant: vi.fn((_key: string) => true),
}))

vi.mock('../../composables/useAuth', () => ({
  useAuth: () => ({
    currentUser,
  }),
}))

vi.mock('../../composables/useFeatureGrants', () => ({
  useFeatureGrants: () => ({
    hasGrant: grantsState.hasGrant,
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
    currentUser.value = null
    grantsState.hasGrant.mockReset()
    grantsState.hasGrant.mockImplementation(() => true)
    vi.mocked(canViewAdminPanel).mockReset()
  })

  it('shows only help to guests', () => {
    const wrapper = mountMenu()
    const destinations = wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))

    expect(destinations).toEqual(['/docs'])
  })

  it('shows the workspace links when the user is signed in', async () => {
    currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)

    const wrapper = mountMenu()
    await flushPromises()

    const destinations = wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))
    expect(destinations).toContain('/models')
    expect(destinations).toContain('/notations')
    expect(destinations).toContain('/types')
    expect(destinations).toContain('/shapes')
    expect(destinations).toContain('/validation-scripts')
    expect(destinations).toContain('/docs')
    expect(destinations).toContain('/wiki')
    expect(destinations).toContain('/profile')
  })

  it('hides catalog nav links when feature grants are missing', async () => {
    currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)
    grantsState.hasGrant.mockImplementation((key: string) => key === 'model.create')

    const wrapper = mountMenu()
    await flushPromises()

    const destinations = wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))
    expect(destinations).toContain('/models')
    expect(destinations).not.toContain('/notations')
    expect(destinations).not.toContain('/types')
    expect(destinations).not.toContain('/shapes')
    expect(destinations).not.toContain('/validation-scripts')
    expect(destinations).not.toContain('/wiki')
  })

  it('hides wiki nav when model.wiki.create grant is missing', async () => {
    currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)
    grantsState.hasGrant.mockImplementation((key: string) => key !== 'model.wiki.create')

    const wrapper = mountMenu()
    await flushPromises()

    const destinations = wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))
    expect(destinations).not.toContain('/wiki')
    expect(destinations).toContain('/models')
  })

  it('hides profile nav when profile.nav grant is missing', async () => {
    currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)
    grantsState.hasGrant.mockImplementation((key: string) => key !== 'profile.nav')

    const wrapper = mountMenu()
    await flushPromises()

    const destinations = wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))
    expect(destinations).not.toContain('/profile')
    expect(destinations).toContain('/models')
  })

  it('shows the admin link when policy allows viewing the admin panel', async () => {
    currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(true)

    const wrapper = mountMenu()
    await flushPromises()

    expect(canViewAdminPanel).toHaveBeenCalledWith('user-1')
    expect(
      wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/admin')
    ).toBe(true)
  })

  it('hides the admin link when there is no authenticated user', async () => {
    const wrapper = mountMenu()
    await flushPromises()

    expect(canViewAdminPanel).not.toHaveBeenCalled()
    expect(
      wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/admin')
    ).toBe(false)
  })

  it('hides the admin link when policy denies viewing the admin panel', async () => {
    currentUser.value = { id: 'user-1' }
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)

    const wrapper = mountMenu()
    await flushPromises()

    expect(canViewAdminPanel).toHaveBeenCalledWith('user-1')
    expect(
      wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/admin')
    ).toBe(false)
  })

  it('re-checks admin panel access when the effective role changes without reload', async () => {
    currentUser.value = {
      id: 'user-1',
      role: 'admin',
      roleOverride: null,
    } as never
    vi.mocked(canViewAdminPanel).mockResolvedValue(true)

    const wrapper = mountMenu()
    await flushPromises()
    expect(
      wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/admin')
    ).toBe(true)

    // Админ переключился на роль чтения: id тот же, роль другая.
    currentUser.value = {
      id: 'user-1',
      role: 'reader',
      roleOverride: 'admin',
    } as never
    vi.mocked(canViewAdminPanel).mockResolvedValue(false)
    await flushPromises()

    expect(canViewAdminPanel).toHaveBeenLastCalledWith('user-1')
    expect(
      wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/admin')
    ).toBe(false)

    // Возврат к роли администратора.
    currentUser.value = {
      id: 'user-1',
      role: 'admin',
      roleOverride: null,
    } as never
    vi.mocked(canViewAdminPanel).mockResolvedValue(true)
    await flushPromises()

    expect(canViewAdminPanel).toHaveBeenLastCalledWith('user-1')
    expect(
      wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/admin')
    ).toBe(true)
  })
})

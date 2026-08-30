import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: { value: false },
    currentUser: { value: null },
    loadCurrentUser: vi.fn(),
  }),
}))

vi.mock('@/composables/usePermissions', () => ({
  canViewAdminPanel: vi.fn(),
}))

import router from './index'

describe('router', () => {
  it('has a catch-all route for unknown paths', () => {
    expect(router.getRoutes().some((route) => route.path === '/:pathMatch(.*)*')).toBe(true)
  })

  it('lets guests open in-app documentation', async () => {
    await router.push('/docs/overview')
    expect(router.currentRoute.value.name).toBe('docs-section')
    expect(router.currentRoute.value.meta.requiresAuth).toBe(false)
  })

  it('sends guests to login with redirect back to the requested model diagram', async () => {
    await router.push('/models/model-1?diagramId=diagram-9')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/models/model-1?diagramId=diagram-9')
  })
})

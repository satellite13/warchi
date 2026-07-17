import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveLoginRedirect } from './resolveLoginRedirect'

vi.mock('../utils/safeRedirect', () => ({
  isSafeSiteReturnUrl: vi.fn((value: string) => value.startsWith('https://warchi-site.'))
}))

describe('resolveLoginRedirect', () => {
  const loadCurrentUser = vi.fn(async () => undefined)
  let stillAuthenticated = true

  beforeEach(() => {
    loadCurrentUser.mockReset()
    loadCurrentUser.mockResolvedValue(undefined)
    stillAuthenticated = true
  })

  it('stays on login when local state is anonymous', async () => {
    const decision = await resolveLoginRedirect({
      isAuthenticated: false,
      returnUrl: 'https://warchi-site.arch.svc.cluster.local/',
      loadCurrentUser,
      isStillAuthenticated: () => stillAuthenticated
    })

    expect(decision).toEqual({ type: 'stay' })
    expect(loadCurrentUser).not.toHaveBeenCalled()
  })

  it('stays on login when stored user is stale and /auth/me clears session', async () => {
    loadCurrentUser.mockImplementation(async () => {
      stillAuthenticated = false
    })

    const decision = await resolveLoginRedirect({
      isAuthenticated: true,
      returnUrl: 'https://warchi-site.arch.svc.cluster.local/',
      loadCurrentUser,
      isStillAuthenticated: () => stillAuthenticated
    })

    expect(loadCurrentUser).toHaveBeenCalledOnce()
    expect(decision).toEqual({ type: 'stay' })
  })

  it('returns to site when session is still valid and returnUrl is safe', async () => {
    const decision = await resolveLoginRedirect({
      isAuthenticated: true,
      returnUrl: 'https://warchi-site.arch.svc.cluster.local/feedback',
      loadCurrentUser,
      isStillAuthenticated: () => stillAuthenticated
    })

    expect(decision).toEqual({
      type: 'return',
      url: 'https://warchi-site.arch.svc.cluster.local/feedback'
    })
  })

  it('goes home when session is valid but returnUrl is missing or unsafe', async () => {
    const decision = await resolveLoginRedirect({
      isAuthenticated: true,
      returnUrl: 'https://evil.example/',
      loadCurrentUser,
      isStillAuthenticated: () => stillAuthenticated
    })

    expect(decision).toEqual({ type: 'home' })
  })
})

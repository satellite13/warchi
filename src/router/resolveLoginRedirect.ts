import { isSafeSiteReturnUrl } from '../utils/safeRedirect'

export type LoginRedirectDecision =
  | { type: 'stay' }
  | { type: 'home' }
  | { type: 'return'; url: string }

/**
 * When the login route thinks the user is already signed in, verify the session
 * before bouncing to returnUrl. Stale localStorage alone must not skip the form.
 */
export async function resolveLoginRedirect(options: {
  isAuthenticated: boolean
  returnUrl: string | null
  loadCurrentUser: () => Promise<void>
  isStillAuthenticated: () => boolean
}): Promise<LoginRedirectDecision> {
  if (!options.isAuthenticated) {
    return { type: 'stay' }
  }

  await options.loadCurrentUser()

  if (!options.isStillAuthenticated()) {
    return { type: 'stay' }
  }

  if (options.returnUrl && isSafeSiteReturnUrl(options.returnUrl)) {
    return { type: 'return', url: options.returnUrl }
  }

  return { type: 'home' }
}

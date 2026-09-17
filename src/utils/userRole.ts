import type { User, UserRole } from '../types/entities'

export type { UserRole }

export function normalizeUserRole(role?: string | null): UserRole {
  const r = (role ?? '').toLowerCase()
  if (r === 'admin' || r === 'architect' || r === 'editor' || r === 'reader' || r === 'viewer') {
    return r
  }
  if (r === 'user') return 'reader' // legacy
  return 'viewer'
}

export const normalizeUser = (user: User): User => ({
  ...user,
  role: normalizeUserRole(user.role),
  featureGrants: Array.isArray(user.featureGrants) ? user.featureGrants : [],
})

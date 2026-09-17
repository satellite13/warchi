import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { User } from '@/types/entities'

const currentUser = ref<User | null>(null)

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ currentUser }),
}))

import { useFeatureGrants } from './useFeatureGrants'

describe('useFeatureGrants', () => {
  beforeEach(() => {
    currentUser.value = null
  })

  it('hasGrant returns true for admin even with empty featureGrants', () => {
    currentUser.value = {
      id: 'u1',
      email: 'admin@example.com',
      role: 'admin',
      featureGrants: [],
    }

    const { hasGrant } = useFeatureGrants()
    expect(hasGrant('model.create')).toBe(true)
    expect(hasGrant('notation.nav')).toBe(true)
  })

  it('hasGrant returns true when grant is present for non-admin', () => {
    currentUser.value = {
      id: 'u2',
      email: 'reader@example.com',
      role: 'reader',
      featureGrants: ['model.relationMatrix'],
    }

    const { hasGrant } = useFeatureGrants()
    expect(hasGrant('model.relationMatrix')).toBe(true)
    expect(hasGrant('model.create')).toBe(false)
  })

  it('hasGrant returns false when logged out', () => {
    const { hasGrant } = useFeatureGrants()
    expect(hasGrant('model.create')).toBe(false)
  })
})

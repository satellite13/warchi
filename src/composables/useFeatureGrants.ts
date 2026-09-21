import { computed } from 'vue'
import { useAuth } from './useAuth'
import type { FeatureGrantKey } from '@/domain/featureGrants/catalog'
import { normalizeUserRole } from '@/utils/userRole'

export function useFeatureGrants() {
  const { currentUser } = useAuth()
  const grants = computed(() => new Set(currentUser.value?.featureGrants ?? []))

  function hasGrant(key: FeatureGrantKey | string): boolean {
    if (normalizeUserRole(currentUser.value?.role) === 'admin') return true
    return grants.value.has(key)
  }

  return { hasGrant, grants }
}

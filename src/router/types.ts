import 'vue-router'
import type { FeatureGrantKey } from '@/domain/featureGrants/catalog'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdminPanel?: boolean
    /** Soft-guard: redirect home when the current user lacks this feature grant. */
    requiresFeatureGrant?: FeatureGrantKey
  }
}

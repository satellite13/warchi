import { computed, type Ref } from 'vue'
import type { AccessPermission } from '@/types/entities'

export function useCanShare(
  entity: Ref<{ accessPermission?: AccessPermission | null } | null | undefined>,
  options?: { requiredGrant?: () => boolean }
) {
  const canShare = computed(() => {
    const permission = entity.value?.accessPermission ?? null
    const permissionAllows = permission === 'OWNER' || permission === 'ADMIN'
    if (!permissionAllows) return false
    if (options?.requiredGrant && !options.requiredGrant()) return false
    return true
  })
  return { canShare }
}

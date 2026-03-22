import { computed, type Ref } from "vue"
import type { AccessPermission } from "@/types/entities"

export function useCanShare(
  entity: Ref<{ accessPermission?: AccessPermission | null } | null | undefined>
) {
  const canShare = computed(() => {
    const permission = entity.value?.accessPermission ?? null
    return permission === "OWNER" || permission === "ADMIN"
  })
  return { canShare }
}

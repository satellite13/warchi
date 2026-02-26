import { computed, type Ref } from "vue"

export function useCanShare(
  entity: Ref<{ ownerId?: string } | null | undefined>,
  currentUser: Ref<{ id?: string } | null | undefined>
) {
  const canShare = computed(
    () => !!entity.value?.ownerId && !!currentUser.value?.id && entity.value.ownerId === currentUser.value.id
  )
  return { canShare }
}

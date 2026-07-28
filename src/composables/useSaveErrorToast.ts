import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

const DEFAULT_TOAST_MS = 5000

/**
 * Shows saveError in a toast for a short period without clearing the source error.
 */
export function useSaveErrorToast(saveError: Ref<string | null>, durationMs = DEFAULT_TOAST_MS) {
  const toastError = ref<string | null>(null)
  const isToastVisible = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  watch(saveError, value => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }

    if (!value) {
      isToastVisible.value = false
      toastError.value = null
      return
    }

    toastError.value = value
    isToastVisible.value = true
    toastTimer = setTimeout(() => {
      isToastVisible.value = false
    }, durationMs)
  })

  onBeforeUnmount(() => {
    if (!toastTimer) return
    clearTimeout(toastTimer)
    toastTimer = null
  })

  return {
    toastError,
    isToastVisible,
    displayedError: (): string | null => (isToastVisible.value ? toastError.value : null),
  }
}

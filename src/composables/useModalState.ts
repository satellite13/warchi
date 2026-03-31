import { ref, type Ref } from 'vue'

export interface ModalState<T> {
  show: Ref<boolean>
  item: Ref<T | null>
  isProcessing: Ref<boolean>
  error: Ref<string | null>
  open: (value: T) => void
  close: () => void
  resetError: () => void
}

export function useModalState<T>(): ModalState<T> {
  const show = ref(false)
  const item = ref<T | null>(null) as Ref<T | null>
  const isProcessing = ref(false)
  const error = ref<string | null>(null)

  const open = (value: T) => {
    item.value = value
    error.value = null
    show.value = true
  }

  const close = () => {
    show.value = false
    item.value = null
    error.value = null
    isProcessing.value = false
  }

  const resetError = () => {
    error.value = null
  }

  return { show, item, isProcessing, error, open, close, resetError }
}

import { ref, onScopeDispose } from 'vue'

export function useSaveState() {
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const saveSuccess = ref(false)
  const saveProgress = ref('')
  let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null

  onScopeDispose(() => {
    if (saveSuccessTimer !== null) {
      clearTimeout(saveSuccessTimer)
      saveSuccessTimer = null
    }
  })

  function startSave() {
    isSaving.value = true
    saveError.value = null
    saveSuccess.value = false
    saveProgress.value = ''
  }

  function completeSave(delayMs = 3000) {
    saveSuccess.value = true
    if (saveSuccessTimer !== null) clearTimeout(saveSuccessTimer)
    saveSuccessTimer = setTimeout(() => {
      saveSuccess.value = false
      saveSuccessTimer = null
    }, delayMs)
  }

  function failSave(error: string) {
    saveError.value = error
  }

  function finishSave() {
    isSaving.value = false
    saveProgress.value = ''
  }

  return {
    isSaving,
    saveError,
    saveSuccess,
    saveProgress,
    startSave,
    completeSave,
    failSave,
    finishSave,
  }
}

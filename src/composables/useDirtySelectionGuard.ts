import { ref, type Ref } from 'vue'

export type DirtySelectionGuardOptions = {
  isDirty: Ref<boolean> | (() => boolean)
}

/**
 * Guard selection changes when the current item has unsaved edits.
 * Pending tokens starting with `__add_` are reserved for "create new" flows.
 */
export function useDirtySelectionGuard(options: DirtySelectionGuardOptions) {
  const showUnsavedDialog = ref(false)
  const pendingSelectId = ref<string | null>(null)

  const dirty = (): boolean =>
    typeof options.isDirty === 'function' ? options.isDirty() : options.isDirty.value

  function requestSelect(id: string, apply: (id: string) => void): void {
    if (dirty()) {
      pendingSelectId.value = id
      showUnsavedDialog.value = true
      return
    }
    apply(id)
  }

  function requestAdd(token: string, apply: () => void): void {
    if (dirty()) {
      pendingSelectId.value = token.startsWith('__add_') ? token : `__add_${token}`
      showUnsavedDialog.value = true
      return
    }
    apply()
  }

  function discardAndContinue(handlers: {
    onSelect: (id: string) => void
    onAdd?: (token: string) => void
  }): void {
    showUnsavedDialog.value = false
    const pending = pendingSelectId.value
    pendingSelectId.value = null
    if (!pending) return
    if (pending.startsWith('__add_')) {
      handlers.onAdd?.(pending)
      return
    }
    handlers.onSelect(pending)
  }

  function cancelSwitch(): void {
    showUnsavedDialog.value = false
    pendingSelectId.value = null
  }

  return {
    showUnsavedDialog,
    pendingSelectId,
    requestSelect,
    requestAdd,
    discardAndContinue,
    cancelSwitch,
  }
}

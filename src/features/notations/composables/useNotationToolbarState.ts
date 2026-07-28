import { ref, type Ref } from 'vue'
import { usePersistedToolbarState } from '@/composables/usePersistedToolbarState'

export type ToolbarState = {
  gridVisible: boolean
  miniMapVisible: boolean
  snapEnabled: boolean
  alignEnabled: boolean
  rulersEnabled: boolean
}

const STORAGE_PREFIX = 'warchi:notation-editor:toolbar-state'

export function useNotationToolbarState(userId: Ref<string | null>) {
  const gridVisible = ref(true)
  const miniMapVisible = ref(true)
  const snapEnabled = ref(false)
  const alignEnabled = ref(true)
  const rulersEnabled = ref(true)

  usePersistedToolbarState<ToolbarState>(STORAGE_PREFIX, userId, {
    gridVisible,
    miniMapVisible,
    snapEnabled,
    alignEnabled,
    rulersEnabled,
  })

  return {
    gridVisible,
    miniMapVisible,
    snapEnabled,
    alignEnabled,
    rulersEnabled,
  }
}

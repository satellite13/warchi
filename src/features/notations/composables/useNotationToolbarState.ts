import { ref, watch, type Ref } from 'vue'
import { loadJson, saveJson } from '@/utils/localStorage'

export type ToolbarState = {
  gridVisible: boolean
  miniMapVisible: boolean
  snapEnabled: boolean
  alignEnabled: boolean
  rulersEnabled: boolean
}

const STORAGE_PREFIX = 'warchi:notation-editor:toolbar-state'

function getStorageKey(userId: string | null): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:anonymous`
}

export function useNotationToolbarState(userId: Ref<string | null>) {
  const gridVisible = ref(true)
  const miniMapVisible = ref(true)
  const snapEnabled = ref(false)
  const alignEnabled = ref(true)
  const rulersEnabled = ref(true)

  function applyState(saved: Partial<ToolbarState> | null) {
    if (!saved) return
    if (typeof saved.gridVisible === 'boolean') gridVisible.value = saved.gridVisible
    if (typeof saved.miniMapVisible === 'boolean') miniMapVisible.value = saved.miniMapVisible
    if (typeof saved.snapEnabled === 'boolean') snapEnabled.value = saved.snapEnabled
    if (typeof saved.alignEnabled === 'boolean') alignEnabled.value = saved.alignEnabled
    if (typeof saved.rulersEnabled === 'boolean') rulersEnabled.value = saved.rulersEnabled
  }

  function persistState(userIdValue: string | null) {
    const next: ToolbarState = {
      gridVisible: gridVisible.value,
      miniMapVisible: miniMapVisible.value,
      snapEnabled: snapEnabled.value,
      alignEnabled: alignEnabled.value,
      rulersEnabled: rulersEnabled.value,
    }
    saveJson(getStorageKey(userIdValue), next)
  }

  watch(userId, id => applyState(loadJson<ToolbarState>(getStorageKey(id))), {
    immediate: true,
  })

  watch(
    [gridVisible, miniMapVisible, snapEnabled, alignEnabled, rulersEnabled, userId],
    ([, , , , , id]) => {
      persistState(id as string | null)
    }
  )

  return {
    gridVisible,
    miniMapVisible,
    snapEnabled,
    alignEnabled,
    rulersEnabled,
  }
}

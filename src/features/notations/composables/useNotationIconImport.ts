import { ref } from 'vue'
import { useLibraryIcons } from '@/composables/useLibraryIcons'
import {
  analyzeImportIconGaps,
  remapIconNamesInValue,
} from '@/features/diagram/utils/analyzeImportIconGaps'

export function useNotationIconImport() {
  const { icons, ensureLoaded, refresh } = useLibraryIcons()
  const showIconResolve = ref(false)
  const missingIcons = ref<string[]>([])
  const pendingDocument = ref<unknown>(null)

  async function prepareDocument(raw: unknown): Promise<unknown | 'resolve'> {
    await ensureLoaded()
    const gaps = analyzeImportIconGaps(
      raw,
      icons.value.map((icon) => icon.name),
    )
    if (gaps.length === 0) return raw
    pendingDocument.value = raw
    missingIcons.value = gaps
    showIconResolve.value = true
    return 'resolve'
  }

  function applyRemap(remap: Record<string, string>): unknown {
    const raw = pendingDocument.value
    showIconResolve.value = false
    pendingDocument.value = null
    missingIcons.value = []
    return remapIconNamesInValue(raw, new Map(Object.entries(remap)))
  }

  function cancelResolve(): void {
    showIconResolve.value = false
    pendingDocument.value = null
    missingIcons.value = []
  }

  return {
    showIconResolve,
    missingIcons,
    prepareDocument,
    applyRemap,
    cancelResolve,
    refreshLibrary: refresh,
  }
}

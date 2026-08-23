import { computed, ref } from 'vue'
import { COMBINED_ICON_OPTIONS, type IconOption } from '@/config/iconOptions'
import { apiGet } from '@/composables/useApi'
import {
  libraryNameMap,
  normalizeIconName,
  resolveIconMarkup,
  resolveIconSrc,
  type LibraryIconRecord,
} from '@/utils/libraryIconResolve'

const icons = ref<LibraryIconRecord[]>([])
const loaded = ref(false)
let inflight: Promise<void> | null = null

async function fetchLibraryIcons(): Promise<void> {
  const result = await apiGet<LibraryIconRecord[]>('/library-icons')
  if (result.success) {
    icons.value = result.data
    loaded.value = true
  }
}

export function useLibraryIcons() {
  const byName = computed(() => libraryNameMap(icons.value))

  async function refresh(): Promise<void> {
    if (inflight) return inflight
    inflight = fetchLibraryIcons().finally(() => {
      inflight = null
    })
    return inflight
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return
    await refresh()
  }

  function srcFor(name: string): string {
    return resolveIconSrc(name, byName.value)
  }

  function markupFor(name: string): string {
    return resolveIconMarkup(name, byName.value)
  }

  function has(name: string): boolean {
    return byName.value.has(name.trim().toLowerCase())
  }

  const selectOptions = computed<IconOption[]>(() => {
    const seen = new Set<string>()
    const out: IconOption[] = []
    for (const icon of icons.value) {
      const id = normalizeIconName(icon.name) || icon.name
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, label: icon.name.replace(/_/g, ' ') })
    }
    for (const option of COMBINED_ICON_OPTIONS) {
      if (seen.has(option.id)) continue
      seen.add(option.id)
      out.push(option)
    }
    return out
  })

  return {
    icons,
    byName,
    loaded,
    refresh,
    ensureLoaded,
    srcFor,
    markupFor,
    has,
    selectOptions,
  }
}

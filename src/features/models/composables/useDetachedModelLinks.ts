import { onScopeDispose, ref, type Ref } from 'vue'
import type { EditorLink } from '../types'
import { loadModelEditorLinks } from './modelEditorLoadModel'

export function mergeDetachedModelLinks(
  remoteLinks: readonly EditorLink[],
  localLinks: readonly EditorLink[]
): EditorLink[] {
  const merged = new Map<string, EditorLink>()
  for (const link of remoteLinks) merged.set(link.id, link)
  for (const link of localLinks) {
    if (link._isDeleted) {
      merged.delete(link.id)
    } else if (link._isDirty || link._isNew) {
      merged.set(link.id, link)
    }
  }
  return [...merged.values()]
}

export function useDetachedModelLinks(modelId: Ref<string | null>) {
  const links = ref<EditorLink[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadedModelId = ref<string | null>(null)
  let generation = 0
  let inFlight: Promise<EditorLink[] | null> | null = null

  const reset = (): void => {
    generation += 1
    inFlight = null
    links.value = []
    loading.value = false
    error.value = null
    loadedModelId.value = null
  }

  const load = async (force = false): Promise<EditorLink[] | null> => {
    const requestedModelId = modelId.value
    if (!requestedModelId) {
      reset()
      return null
    }
    if (!force && loadedModelId.value === requestedModelId) return links.value
    if (!force && inFlight) return inFlight

    const requestGeneration = ++generation
    loading.value = true
    error.value = null
    const request = (async (): Promise<EditorLink[] | null> => {
      try {
        const loaded = await loadModelEditorLinks(requestedModelId, {
          isCancelled: () => requestGeneration !== generation || modelId.value !== requestedModelId,
        })
        if (requestGeneration !== generation || modelId.value !== requestedModelId) return null
        links.value = loaded
        loadedModelId.value = requestedModelId
        return loaded
      } catch (caught) {
        if (requestGeneration !== generation || modelId.value !== requestedModelId) return null
        error.value =
          caught instanceof Error ? caught.message : 'Не удалось загрузить связи модели.'
        return null
      } finally {
        if (requestGeneration === generation) {
          loading.value = false
          inFlight = null
        }
      }
    })()
    inFlight = request
    return request
  }

  onScopeDispose(reset)

  return { links, loading, error, loadedModelId, load, reset }
}

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
  const requestedModelId = ref<string | null>(null)
  let snapshotGeneration = 0
  let inFlight: Promise<EditorLink[] | null> | null = null

  const reset = (): void => {
    snapshotGeneration += 1
    inFlight = null
    links.value = []
    loading.value = false
    error.value = null
    loadedModelId.value = null
    requestedModelId.value = null
  }

  const startLoad = async (supersede: boolean): Promise<EditorLink[] | null> => {
    const targetModelId = modelId.value
    if (!targetModelId) {
      reset()
      return null
    }
    if (!supersede && inFlight && requestedModelId.value === targetModelId) return inFlight

    const requestGeneration = ++snapshotGeneration
    requestedModelId.value = targetModelId
    loading.value = true
    error.value = null
    links.value = []
    loadedModelId.value = null
    const request = (async (): Promise<EditorLink[] | null> => {
      try {
        const loaded = await loadModelEditorLinks(targetModelId, {
          isCancelled: () =>
            requestGeneration !== snapshotGeneration || modelId.value !== targetModelId,
        })
        if (
          requestGeneration !== snapshotGeneration ||
          modelId.value !== targetModelId
        ) {
          return null
        }
        links.value = loaded
        loadedModelId.value = targetModelId
        return loaded
      } catch (caught) {
        if (
          requestGeneration !== snapshotGeneration ||
          modelId.value !== targetModelId
        ) {
          return null
        }
        error.value =
          caught instanceof Error ? caught.message : 'Не удалось загрузить связи модели.'
        return null
      } finally {
        if (requestGeneration === snapshotGeneration) {
          loading.value = false
          inFlight = null
        }
      }
    })()
    inFlight = request
    return request
  }

  const load = (): Promise<EditorLink[] | null> => startLoad(false)
  const refresh = (): Promise<EditorLink[] | null> => startLoad(true)
  const refreshActiveRequest = (): Promise<EditorLink[] | null> => {
    if (requestedModelId.value !== modelId.value) return Promise.resolve(null)
    return refresh()
  }
  const refreshAfterSuccessfulSave = refreshActiveRequest
  const refreshAfterRemoteSync = refreshActiveRequest

  onScopeDispose(reset)

  return {
    links,
    loading,
    error,
    loadedModelId,
    requestedModelId,
    load,
    refresh,
    refreshAfterSuccessfulSave,
    refreshAfterRemoteSync,
    reset,
  }
}

import { onScopeDispose, ref, type Ref } from 'vue'
import { PAGE_SIZE_MODEL_NODES } from '@/api/queryHelpers'
import i18n from '@/i18n'
import type { LinkResponse, NodeResponse } from '@/types/api'
import type { EditorLink, EditorNode, ModelEditorState } from '../types'
import { applyLocalModelDelta } from '../utils/applyLocalModelDelta'
import { fetchAllByModelId } from './modelEditorLoadModel'
import { toEditorLink, toEditorNode } from './modelEditorMappers'

export type DetachedModelSnapshot = {
  nodes: EditorNode[]
  links: EditorLink[]
}

export type DetachedOverlayResult =
  | { ok: true; snapshot: DetachedModelSnapshot }
  | { ok: false; cancelled: boolean; error: string | null }

const errorMessage = (error: unknown, t: (key: string) => string): string =>
  error instanceof Error ? error.message : t('models.detachedSnapshotFailed')

export function useDetachedModelSnapshot(
  modelId: Ref<string | null>,
  options: { t?: (key: string) => string } = {}
) {
  const t = options.t ?? ((key: string) => String(i18n.global.t(key)))
  const snapshot = ref<DetachedModelSnapshot | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadedModelId = ref<string | null>(null)
  const stale = ref(false)
  let requestGeneration = 0

  const isCurrent = (generation: number, targetModelId: string): boolean =>
    generation === requestGeneration && modelId.value === targetModelId

  const reset = (): void => {
    requestGeneration += 1
    snapshot.value = null
    loading.value = false
    error.value = null
    loadedModelId.value = null
    stale.value = false
  }

  const cancel = (): void => {
    requestGeneration += 1
    loading.value = false
  }

  const release = (): void => {
    snapshot.value = null
    loadedModelId.value = null
  }

  const invalidateAfterRemoteSync = (): void => {
    requestGeneration += 1
    snapshot.value = null
    loading.value = false
    error.value = null
    loadedModelId.value = null
    stale.value = modelId.value !== null
  }

  const load = async (): Promise<DetachedModelSnapshot | null> => {
    const targetModelId = modelId.value
    if (!targetModelId) {
      reset()
      return null
    }

    const generation = ++requestGeneration
    loading.value = true
    stale.value = false
    error.value = null
    snapshot.value = null
    loadedModelId.value = null

    const cancellation = {
      isCancelled: () => !isCurrent(generation, targetModelId),
    }

    try {
      const [nodeRows, linkRows] = await Promise.all([
        fetchAllByModelId<NodeResponse>(
          '/nodes',
          targetModelId,
          PAGE_SIZE_MODEL_NODES,
          undefined,
          cancellation
        ),
        fetchAllByModelId<LinkResponse>(
          '/links',
          targetModelId,
          PAGE_SIZE_MODEL_NODES,
          undefined,
          cancellation
        ),
      ])
      if (!isCurrent(generation, targetModelId)) return null

      const loaded: DetachedModelSnapshot = {
        nodes: nodeRows.map(toEditorNode),
        links: linkRows.map(toEditorLink),
      }
      snapshot.value = loaded
      loadedModelId.value = targetModelId
      return loaded
    } catch (caught) {
      if (!isCurrent(generation, targetModelId)) return null
      error.value = errorMessage(caught, t)
      return null
    } finally {
      if (generation === requestGeneration) {
        loading.value = false
      }
    }
  }

  const loadOverlayed = async (
    local: Pick<ModelEditorState, 'nodes' | 'links'>
  ): Promise<DetachedOverlayResult> => {
    const generation = requestGeneration + 1
    const loaded = await load()
    if (requestGeneration !== generation) {
      return { ok: false, cancelled: true, error: null }
    }
    if (!loaded) {
      return { ok: false, cancelled: false, error: error.value }
    }
    return {
      ok: true,
      snapshot: applyLocalModelDelta(loaded, local),
    }
  }

  onScopeDispose(reset)

  return {
    snapshot,
    loading,
    error,
    loadedModelId,
    stale,
    load,
    loadOverlayed,
    cancel,
    release,
    invalidateAfterRemoteSync,
    reset,
  }
}

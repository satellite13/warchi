import { watch, type Ref } from 'vue'

type ModelEditorRouteNavigationOptions = {
  modelId: Ref<string>
  diagramId: Ref<string>
  loadModel: (modelId: string) => Promise<void>
  applyRouteDiagramSelection: (diagramId: string) => void
  focusRouteDiagramInTree?: (diagramId: string, isCurrent: () => boolean) => Promise<void> | void
  afterModelLoad?: () => void
}

type RouteDiagramTreeFocusOptions = {
  diagramId: string
  nodeId: string | null | undefined
  treeRootNodeId: string | null | undefined
  selectHit: (nodeId: string, isCurrent: () => boolean) => Promise<string[]>
  waitForRender: () => Promise<void>
  expandPath: (path: readonly string[]) => void
  focusDiagram: (diagramId: string, isCurrent: () => boolean) => Promise<void> | void
  isCurrent: () => boolean
}

export async function focusRouteDiagramTree(options: RouteDiagramTreeFocusOptions): Promise<void> {
  if (!options.isCurrent()) return
  if (options.nodeId && options.nodeId !== options.treeRootNodeId) {
    const path = await options.selectHit(options.nodeId, options.isCurrent)
    if (!options.isCurrent() || path.length === 0) return
    await options.waitForRender()
    if (!options.isCurrent()) return
    options.expandPath(path)
  }
  await options.waitForRender()
  if (!options.isCurrent()) return
  await options.focusDiagram(options.diagramId, options.isCurrent)
  if (!options.isCurrent()) return
}

/**
 * Keeps a reused ModelEditor synchronized with its route parameters.
 * A model change must finish loading before its requested diagram is selected.
 */
export function useModelEditorRouteNavigation(options: ModelEditorRouteNavigationOptions): {
  applyCurrentDiagramNavigation: () => void
  retryCurrentDiagramTreeFocus: () => void
} {
  let modelLoadGeneration = 0
  let diagramIntentGeneration = 0
  let loadingModelId: string | null = null

  const startDiagramNavigation = (
    requestedModelId: string,
    requestedDiagramId: string,
    navigationGeneration: number
  ): void => {
    const isCurrent = (): boolean =>
      diagramIntentGeneration === navigationGeneration &&
      options.modelId.value === requestedModelId &&
      options.diagramId.value === requestedDiagramId
    if (!isCurrent()) return
    options.applyRouteDiagramSelection(requestedDiagramId)
    void options.focusRouteDiagramInTree?.(requestedDiagramId, isCurrent)
  }

  const applyCurrentDiagramNavigation = (): void => {
    const navigationGeneration = ++diagramIntentGeneration
    startDiagramNavigation(options.modelId.value, options.diagramId.value, navigationGeneration)
  }

  const retryCurrentDiagramTreeFocus = (): void => {
    const requestedModelId = options.modelId.value
    const requestedDiagramId = options.diagramId.value
    const navigationGeneration = ++diagramIntentGeneration
    const isCurrent = (): boolean =>
      diagramIntentGeneration === navigationGeneration &&
      options.modelId.value === requestedModelId &&
      options.diagramId.value === requestedDiagramId
    void options.focusRouteDiagramInTree?.(requestedDiagramId, isCurrent)
  }

  watch(
    [options.modelId, options.diagramId],
    async ([modelId, diagramId], [previousModelId, previousDiagramId]) => {
      if (modelId !== previousModelId) {
        if (!modelId) return
        const loadGeneration = ++modelLoadGeneration
        loadingModelId = modelId
        diagramIntentGeneration += 1
        await options.loadModel(modelId)
        if (modelLoadGeneration !== loadGeneration || options.modelId.value !== modelId) return
        loadingModelId = null
        startDiagramNavigation(modelId, options.diagramId.value, ++diagramIntentGeneration)
        options.afterModelLoad?.()
        return
      }

      if (diagramId !== previousDiagramId) {
        const navigationGeneration = ++diagramIntentGeneration
        if (loadingModelId === modelId) return
        startDiagramNavigation(modelId, diagramId, navigationGeneration)
      }
    }
  )

  return { applyCurrentDiagramNavigation, retryCurrentDiagramTreeFocus }
}

import { watch, type Ref } from 'vue'

type ModelEditorRouteNavigationOptions = {
  modelId: Ref<string>
  diagramId: Ref<string>
  nodeId?: Ref<string>
  linkId?: Ref<string>
  loadModel: (modelId: string) => Promise<void>
  applyRouteDiagramSelection: (diagramId: string) => void
  focusRouteDiagramInTree?: (diagramId: string, isCurrent: () => boolean) => Promise<void> | void
  focusRouteNodeInTree?: (nodeId: string, isCurrent: () => boolean) => Promise<void> | void
  applyRouteLinkSelection?: (linkId: string) => void
  applyRouteNodeSelection?: (nodeId: string) => void
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

  const currentNodeId = (): string => options.nodeId?.value ?? ''
  const currentLinkId = (): string => options.linkId?.value ?? ''

  const applyNodeAndLinkSelection = (requestedNodeId: string, requestedLinkId: string): void => {
    if (requestedNodeId) options.applyRouteNodeSelection?.(requestedNodeId)
    if (requestedLinkId) options.applyRouteLinkSelection?.(requestedLinkId)
  }

  const startDiagramNavigation = (
    requestedModelId: string,
    requestedDiagramId: string,
    requestedNodeId: string,
    requestedLinkId: string,
    navigationGeneration: number
  ): void => {
    const isCurrent = (): boolean =>
      diagramIntentGeneration === navigationGeneration &&
      options.modelId.value === requestedModelId &&
      options.diagramId.value === requestedDiagramId &&
      currentNodeId() === requestedNodeId &&
      currentLinkId() === requestedLinkId
    if (!isCurrent()) return

    if (requestedDiagramId) {
      options.applyRouteDiagramSelection(requestedDiagramId)
      applyNodeAndLinkSelection(requestedNodeId, requestedLinkId)
      void (async () => {
        await options.focusRouteDiagramInTree?.(requestedDiagramId, isCurrent)
        if (!isCurrent()) return
        if (requestedNodeId) await options.focusRouteNodeInTree?.(requestedNodeId, isCurrent)
      })()
      return
    }

    if (requestedNodeId) {
      applyNodeAndLinkSelection(requestedNodeId, '')
      void options.focusRouteNodeInTree?.(requestedNodeId, isCurrent)
    }
  }

  const applyCurrentDiagramNavigation = (): void => {
    const navigationGeneration = ++diagramIntentGeneration
    startDiagramNavigation(
      options.modelId.value,
      options.diagramId.value,
      currentNodeId(),
      currentLinkId(),
      navigationGeneration
    )
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
    [options.modelId, options.diagramId, currentNodeId, currentLinkId],
    async (
      [modelId, diagramId, nodeId, linkId],
      [previousModelId, previousDiagramId, previousNodeId, previousLinkId]
    ) => {
      if (modelId !== previousModelId) {
        if (!modelId) return
        const loadGeneration = ++modelLoadGeneration
        loadingModelId = modelId
        diagramIntentGeneration += 1
        await options.loadModel(modelId)
        if (modelLoadGeneration !== loadGeneration || options.modelId.value !== modelId) return
        loadingModelId = null
        startDiagramNavigation(
          modelId,
          options.diagramId.value,
          currentNodeId(),
          currentLinkId(),
          ++diagramIntentGeneration
        )
        options.afterModelLoad?.()
        return
      }

      if (
        diagramId !== previousDiagramId ||
        nodeId !== previousNodeId ||
        linkId !== previousLinkId
      ) {
        const navigationGeneration = ++diagramIntentGeneration
        if (loadingModelId === modelId) return
        startDiagramNavigation(modelId, diagramId, nodeId, linkId, navigationGeneration)
      }
    }
  )

  return { applyCurrentDiagramNavigation, retryCurrentDiagramTreeFocus }
}

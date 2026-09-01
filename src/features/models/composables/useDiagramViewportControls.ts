import type { Ref } from 'vue'
import type { ViewportState } from '@ngroznykh/papirus'

export type ViewportRendererApi = {
  zoom: number
  viewport: ViewportState
  markDirty: () => void
  edges: Map<string, { lockAnchors?: boolean }>
}

export type ViewportNavigationApi = {
  setZoom: (zoom: number, center: { x: number; y: number }) => void
  fitToView: (padding: number) => void
  zoomToRect: (
    rect: { x: number; y: number; width: number; height: number },
    padding: number
  ) => void
}

export type ViewportInteractionApi = {
  navigation: ViewportNavigationApi
  drag: {
    setSnapToGrid: (enabled: boolean) => void
    setAlignmentEnabled: (enabled: boolean) => void
  }
  resize: { setSnapToGrid: (enabled: boolean) => void }
  connection: { setSnapToGrid: (enabled: boolean) => void }
}

export type OverlayToggleApi = {
  setEnabled: (enabled: boolean) => void
}

/**
 * Viewport zoom/fit/persist/restore + overlay toggles exposed to parent toolbar.
 *
 * Documents watch races:
 * - suppressViewportPersistence prevents persist-on-zoom while restoring
 * - overlay toggles mutate local refs then papirus overlays; prop watches in the
 *   host must not race a second prop→ref sync (see ModelDiagramCanvas comments).
 */
export function useDiagramViewportControls(options: {
  getRenderer: () => ViewportRendererApi | null
  getInteraction: () => ViewportInteractionApi | null
  getContainerEl: () => HTMLElement | null
  persistViewport: (diagramId: string, renderer: ViewportRendererApi) => void
  flushPersistViewport: (diagramId: string) => void
  restoreViewport: (diagramId: string, renderer: ViewportRendererApi) => boolean
  gridVisible: Ref<boolean>
  miniMapVisible: Ref<boolean>
  snapEnabled: Ref<boolean>
  alignEnabled: Ref<boolean>
  rulersEnabled: Ref<boolean>
  lockAnchorsEnabled: Ref<boolean>
  getGridOverlay: () => OverlayToggleApi | null | undefined
  getMiniMap: () => OverlayToggleApi | null | undefined
  getRulersOverlay: () => OverlayToggleApi | null | undefined
  /** Host-only side effects (e.g. clear locked ports when unlocking). */
  onLockAnchorsToggled?: (enabled: boolean) => void
}) {
  let suppressViewportPersistence = false

  const getCanvasCenter = (): { x: number; y: number } => {
    const el = options.getContainerEl()
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const safePersistViewport = (diagramId: string, r: ViewportRendererApi): void => {
    if (!suppressViewportPersistence) options.persistViewport(diagramId, r)
  }

  const flushViewport = (diagramId: string | null): void => {
    if (diagramId) options.flushPersistViewport(diagramId)
  }

  const safeRestoreViewport = (diagramId: string, r: ViewportRendererApi): boolean => {
    suppressViewportPersistence = true
    try {
      return options.restoreViewport(diagramId, r)
    } finally {
      suppressViewportPersistence = false
    }
  }

  const zoomIn = (): void => {
    const renderer = options.getRenderer()
    options.getInteraction()?.navigation.setZoom((renderer?.zoom ?? 1) * 1.2, getCanvasCenter())
  }

  const zoomOut = (): void => {
    const renderer = options.getRenderer()
    options.getInteraction()?.navigation.setZoom((renderer?.zoom ?? 1) / 1.2, getCanvasCenter())
  }

  const resetView = (): void => {
    options.getInteraction()?.navigation.setZoom(1, getCanvasCenter())
  }

  const fitToView = (): void => {
    options.getInteraction()?.navigation.fitToView(50)
  }

  const zoomToSelection = (instances: Array<{
    modelNodeId: string
    x: number
    y: number
    width?: number
    height?: number
  }>, selectedModelNodeIds: string[], getDimensions: (inst: {
    width?: number
    height?: number
  }) => { width: number; height: number }): void => {
    const interaction = options.getInteraction()
    if (!interaction || !options.getRenderer()) return
    if (selectedModelNodeIds.length === 0) return
    const selectedSet = new Set(selectedModelNodeIds)
    const selectedInstances = instances.filter(node => selectedSet.has(node.modelNodeId))
    if (selectedInstances.length === 0) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const instance of selectedInstances) {
      const dims = getDimensions(instance)
      minX = Math.min(minX, instance.x)
      minY = Math.min(minY, instance.y)
      maxX = Math.max(maxX, instance.x + dims.width)
      maxY = Math.max(maxY, instance.y + dims.height)
    }
    interaction.navigation.zoomToRect(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      64
    )
  }

  const getViewport = (): ViewportState | null => {
    const renderer = options.getRenderer()
    if (!renderer) return null
    return { ...renderer.viewport }
  }

  const setViewport = (state: ViewportState): void => {
    const renderer = options.getRenderer()
    if (!renderer) return
    suppressViewportPersistence = true
    try {
      renderer.viewport = {
        zoom: state.zoom,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
      }
    } finally {
      suppressViewportPersistence = false
    }
  }

  const toggleGrid = (): boolean => {
    options.gridVisible.value = !options.gridVisible.value
    options.getGridOverlay()?.setEnabled(options.gridVisible.value)
    options.getRenderer()?.markDirty()
    return options.gridVisible.value
  }

  const toggleMiniMap = (): boolean => {
    options.miniMapVisible.value = !options.miniMapVisible.value
    options.getMiniMap()?.setEnabled(options.miniMapVisible.value)
    options.getRenderer()?.markDirty()
    return options.miniMapVisible.value
  }

  const toggleSnap = (): boolean => {
    options.snapEnabled.value = !options.snapEnabled.value
    const interaction = options.getInteraction()
    if (interaction) {
      interaction.drag.setSnapToGrid(options.snapEnabled.value)
      interaction.resize.setSnapToGrid(options.snapEnabled.value)
      interaction.connection.setSnapToGrid(options.snapEnabled.value)
    }
    return options.snapEnabled.value
  }

  const toggleAlign = (): boolean => {
    options.alignEnabled.value = !options.alignEnabled.value
    options.getInteraction()?.drag.setAlignmentEnabled(options.alignEnabled.value)
    return options.alignEnabled.value
  }

  const toggleRulers = (): boolean => {
    options.rulersEnabled.value = !options.rulersEnabled.value
    options.getRulersOverlay()?.setEnabled(options.rulersEnabled.value)
    options.getRenderer()?.markDirty()
    return options.rulersEnabled.value
  }

  const toggleLockAnchors = (): boolean => {
    options.lockAnchorsEnabled.value = !options.lockAnchorsEnabled.value
    const enabled = options.lockAnchorsEnabled.value
    const renderer = options.getRenderer()
    if (renderer) {
      for (const [, edge] of renderer.edges) {
        edge.lockAnchors = enabled
      }
      options.onLockAnchorsToggled?.(enabled)
      renderer.markDirty()
    }
    return enabled
  }

  return {
    get suppressViewportPersistence() {
      return suppressViewportPersistence
    },
    set suppressViewportPersistence(value: boolean) {
      suppressViewportPersistence = value
    },
    getCanvasCenter,
    safePersistViewport,
    flushViewport,
    safeRestoreViewport,
    zoomIn,
    zoomOut,
    resetView,
    fitToView,
    zoomToSelection,
    getViewport,
    setViewport,
    toggleGrid,
    getGridVisible: () => options.gridVisible.value,
    toggleMiniMap,
    getMiniMapVisible: () => options.miniMapVisible.value,
    toggleSnap,
    getSnapEnabled: () => options.snapEnabled.value,
    toggleAlign,
    getAlignEnabled: () => options.alignEnabled.value,
    toggleRulers,
    getRulersEnabled: () => options.rulersEnabled.value,
    toggleLockAnchors,
    getLockAnchorsEnabled: () => options.lockAnchorsEnabled.value,
  }
}

export type DiagramViewportControls = ReturnType<typeof useDiagramViewportControls>

import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'
import {
  DiagramRenderer,
  GridOverlay,
  MiniMap,
  RulersOverlay,
  type DiagramOptions,
  type InteractionManager,
} from '@ngroznykh/papirus'

type MaybeFactory<T> = T | (() => T)

export interface DiagramRendererOverlayConfig<TOptions extends Record<string, unknown>> {
  enabled?: boolean
  options?: TOptions
}

export interface UseDiagramRendererOptions {
  canvasRef: Ref<HTMLCanvasElement | null>
  containerRef: Ref<HTMLElement | null>
  autoMount?: boolean
  backgroundColor?: MaybeFactory<string>
  rendererOptions?: MaybeFactory<Partial<DiagramOptions>>
  interactions?: Parameters<DiagramRenderer['enableInteractions']>[0] | null
  overlays?: {
    grid?: DiagramRendererOverlayConfig<ConstructorParameters<typeof GridOverlay>[0]>
    miniMap?: DiagramRendererOverlayConfig<ConstructorParameters<typeof MiniMap>[0]>
    rulers?: DiagramRendererOverlayConfig<ConstructorParameters<typeof RulersOverlay>[0]>
  }
  onReady?: (ctx: {
    renderer: DiagramRenderer
    interactionManager: InteractionManager | null
    gridOverlay: GridOverlay | null
    miniMap: MiniMap | null
    rulersOverlay: RulersOverlay | null
  }) => void
  onBeforeDestroy?: (renderer: DiagramRenderer) => void
}

const DEFAULT_BACKGROUND = '#f4f2ef'

function resolveMaybeFactory<T>(value: MaybeFactory<T> | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}

function shouldEnableOverlay(config: { enabled?: boolean } | undefined): boolean {
  return config?.enabled !== false
}

export function useDiagramRenderer(options: UseDiagramRendererOptions) {
  const rendererRef = shallowRef<DiagramRenderer | null>(null)
  const interactionManagerRef = shallowRef<InteractionManager | null>(null)
  const gridOverlayRef = shallowRef<GridOverlay | null>(null)
  const miniMapRef = shallowRef<MiniMap | null>(null)
  const rulersOverlayRef = shallowRef<RulersOverlay | null>(null)
  let resizeObserver: ResizeObserver | null = null

  function resizeToContainer(): void {
    const renderer = rendererRef.value
    const container = options.containerRef.value
    if (!renderer || !container) return
    renderer.resize(container.clientWidth, container.clientHeight)
  }

  function observeContainerResize(): void {
    resizeObserver?.disconnect()
    const container = options.containerRef.value
    if (!container || typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => resizeToContainer())
    resizeObserver.observe(container)
  }

  function createRendererOptions(width: number, height: number): DiagramOptions {
    const configured = resolveMaybeFactory(options.rendererOptions) ?? {}
    const backgroundColor =
      resolveMaybeFactory(options.backgroundColor) ?? configured.backgroundColor ?? DEFAULT_BACKGROUND
    return {
      ...configured,
      width,
      height,
      backgroundColor,
    }
  }

  function installOverlays(renderer: DiagramRenderer): void {
    if (options.overlays?.grid && shouldEnableOverlay(options.overlays.grid)) {
      const gridOverlay = new GridOverlay(options.overlays.grid.options ?? {})
      renderer.use(gridOverlay)
      gridOverlayRef.value = gridOverlay
    }

    if (options.overlays?.rulers && shouldEnableOverlay(options.overlays.rulers)) {
      const rulersOverlay = new RulersOverlay(options.overlays.rulers.options ?? {})
      renderer.use(rulersOverlay)
      rulersOverlayRef.value = rulersOverlay
    }

    if (options.overlays?.miniMap && shouldEnableOverlay(options.overlays.miniMap)) {
      const miniMap = new MiniMap(options.overlays.miniMap.options ?? {})
      renderer.use(miniMap)
      miniMapRef.value = miniMap
    }
  }

  function mountRenderer(): DiagramRenderer | null {
    if (rendererRef.value) return rendererRef.value
    const canvas = options.canvasRef.value
    const container = options.containerRef.value
    if (!canvas || !container) return null
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return null

    const renderer = new DiagramRenderer(canvas, createRendererOptions(width, height))
    rendererRef.value = renderer
    installOverlays(renderer)

    const interactionManager =
      options.interactions === null ? null : renderer.enableInteractions(options.interactions ?? {})
    interactionManagerRef.value = interactionManager
    observeContainerResize()
    options.onReady?.({
      renderer,
      interactionManager,
      gridOverlay: gridOverlayRef.value,
      miniMap: miniMapRef.value,
      rulersOverlay: rulersOverlayRef.value,
    })
    return renderer
  }

  function mountWhenReady(): void {
    if (mountRenderer()) return
    requestAnimationFrame(mountWhenReady)
  }

  function destroyRenderer(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    const renderer = rendererRef.value
    if (renderer) {
      options.onBeforeDestroy?.(renderer)
      renderer.destroy()
    }
    rendererRef.value = null
    interactionManagerRef.value = null
    gridOverlayRef.value = null
    miniMapRef.value = null
    rulersOverlayRef.value = null
  }

  if (options.autoMount !== false) {
    onMounted(mountWhenReady)
    onBeforeUnmount(destroyRenderer)
  }

  return {
    rendererRef,
    interactionManagerRef,
    gridOverlayRef,
    miniMapRef,
    rulersOverlayRef,
    mountRenderer,
    mountWhenReady,
    resizeToContainer,
    destroyRenderer,
  }
}

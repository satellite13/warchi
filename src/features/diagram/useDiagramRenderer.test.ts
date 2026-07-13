import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDiagramRenderer } from './useDiagramRenderer'

const useMock = vi.fn()
const resizeMock = vi.fn()
const destroyMock = vi.fn()
const enableInteractionsMock = vi.fn(() => ({ selection: {}, navigation: {} }))

vi.mock('@ngroznykh/papirus', () => {
  class DiagramRenderer {
    nodes = new Map()
    edges = new Map()
    use = useMock
    resize = resizeMock
    destroy = destroyMock
    enableInteractions = enableInteractionsMock

    constructor(
      public canvas: HTMLCanvasElement,
      public options: Record<string, unknown>
    ) {}
  }

  class GridOverlay {
    constructor(public options: Record<string, unknown>) {}
  }

  class MiniMap {
    constructor(public options: Record<string, unknown>) {}
  }

  class RulersOverlay {
    constructor(public options: Record<string, unknown>) {}
  }

  return { DiagramRenderer, GridOverlay, MiniMap, RulersOverlay }
})

describe('useDiagramRenderer', () => {
  it('creates renderer with enabled overlays and interactions', () => {
    const canvas = document.createElement('canvas')
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 640 })
    Object.defineProperty(container, 'clientHeight', { value: 480 })

    const diagram = useDiagramRenderer({
      canvasRef: ref(canvas),
      containerRef: ref(container),
      autoMount: false,
      backgroundColor: '#fafafa',
      overlays: {
        grid: { enabled: true, options: { gridSize: 24 } },
        miniMap: { enabled: true, options: { width: 120 } },
        rulers: { enabled: false },
      },
      interactions: { snapToGrid: true },
    })

    const renderer = diagram.mountRenderer()

    expect(renderer).toBe(diagram.rendererRef.value)
    expect(renderer?.options).toMatchObject({ width: 640, height: 480, backgroundColor: '#fafafa' })
    expect(useMock).toHaveBeenCalledTimes(2)
    expect(enableInteractionsMock).toHaveBeenCalledWith({ snapToGrid: true })
    expect(diagram.interactionManagerRef.value).toMatchObject({ selection: {}, navigation: {} })
    expect(diagram.gridOverlayRef.value).not.toBeNull()
    expect(diagram.miniMapRef.value).not.toBeNull()
    expect(diagram.rulersOverlayRef.value).toBeNull()
  })

  it('resizes to the current container and destroys renderer state', () => {
    const canvas = document.createElement('canvas')
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const diagram = useDiagramRenderer({
      canvasRef: ref(canvas),
      containerRef: ref(container),
      autoMount: false,
    })
    diagram.mountRenderer()

    diagram.resizeToContainer()
    expect(resizeMock).toHaveBeenCalledWith(800, 600)

    diagram.destroyRenderer()
    expect(destroyMock).toHaveBeenCalled()
    expect(diagram.rendererRef.value).toBeNull()
    expect(diagram.interactionManagerRef.value).toBeNull()
  })
})

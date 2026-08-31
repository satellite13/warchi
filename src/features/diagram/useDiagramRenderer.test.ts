import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDiagramRenderer } from './useDiagramRenderer'

const useMock = vi.fn()
const resizeMock = vi.fn()
const destroyMock = vi.fn()
const enableInteractionsMock = vi.fn(() => ({ selection: {}, navigation: {} }))
const constructedOptions: Record<string, unknown>[] = []

vi.mock('@ngroznykh/papirus', () => {
  class DiagramRenderer {
    nodes = new Map()
    use = useMock
    resize = resizeMock
    destroy = destroyMock
    enableInteractions = enableInteractionsMock
    canvas: HTMLCanvasElement
    options: Record<string, unknown>

    constructor(canvas: HTMLCanvasElement, options: Record<string, unknown>) {
      this.canvas = canvas
      this.options = options
      constructedOptions.push(options)
    }
  }

  class GridOverlay {
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      this.options = options
    }
  }

  class MiniMap {
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      this.options = options
    }
  }

  class RulersOverlay {
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      this.options = options
    }
  }

  return { DiagramRenderer, GridOverlay, MiniMap, RulersOverlay }
})

describe('useDiagramRenderer', () => {
  it('creates renderer with enabled overlays and interactions', () => {
    constructedOptions.length = 0
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
    expect(constructedOptions[0]).toMatchObject({
      width: 640,
      height: 480,
      backgroundColor: '#fafafa',
    })
    expect(useMock).toHaveBeenCalledTimes(2)
    expect(enableInteractionsMock).toHaveBeenCalledWith({ snapToGrid: true })
    expect(diagram.interactionManagerRef.value).toMatchObject({ selection: {}, navigation: {} })
    expect(diagram.gridOverlayRef.value).not.toBeNull()
    expect(diagram.miniMapRef.value).not.toBeNull()
    expect(diagram.rulersOverlayRef.value).toBeNull()
  })

  it('boosts pinch (ctrl+wheel) deltas before canvas-level handlers see them', () => {
    const canvas = document.createElement('canvas')
    const container = document.createElement('div')
    container.appendChild(canvas)
    Object.defineProperty(container, 'clientWidth', { value: 320 })
    Object.defineProperty(container, 'clientHeight', { value: 240 })

    const seenDeltas: number[] = []
    canvas.addEventListener('wheel', (event: WheelEvent) => {
      seenDeltas.push(event.deltaY)
    })

    const diagram = useDiagramRenderer({
      canvasRef: ref(canvas),
      containerRef: ref(container),
      autoMount: false,
      interactions: { snapToGrid: true },
    })
    diagram.mountRenderer()

    // happy-dom не выставляет ctrlKey из инициализатора WheelEvent, как делает браузер
    const pinch = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 })
    Object.defineProperty(pinch, 'ctrlKey', { value: true, configurable: true })
    canvas.dispatchEvent(pinch)
    expect(seenDeltas).toEqual([50])

    const scroll = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 })
    canvas.dispatchEvent(scroll)
    expect(seenDeltas).toEqual([50, 10])

    diagram.destroyRenderer()
    const afterDestroy = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 })
    Object.defineProperty(afterDestroy, 'ctrlKey', { value: true, configurable: true })
    canvas.dispatchEvent(afterDestroy)
    expect(seenDeltas).toEqual([50, 10, 10])
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

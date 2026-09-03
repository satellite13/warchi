import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDiagramViewportControls } from './useDiagramViewportControls'

describe('useDiagramViewportControls', () => {
  it('zooms relative to canvas center and toggles overlays', () => {
    const setZoom = vi.fn()
    const setEnabled = vi.fn()
    const markDirty = vi.fn()
    const gridVisible = ref(true)
    const controls = useDiagramViewportControls({
      getRenderer: () =>
        ({
          zoom: 1,
          viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
          markDirty,
          edges: new Map(),
        }) as never,
      getInteraction: () =>
        ({
          navigation: { setZoom, fitToView: vi.fn(), zoomToRect: vi.fn() },
          drag: { setSnapToGrid: vi.fn(), setAlignmentEnabled: vi.fn() },
          resize: { setSnapToGrid: vi.fn() },
          connection: { setSnapToGrid: vi.fn() },
        }) as never,
      getContainerEl: () =>
        ({
          getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 40 }),
        }) as HTMLElement,
      persistViewport: vi.fn(),
      flushPersistViewport: vi.fn(),
      restoreViewport: vi.fn(() => true),
      gridVisible,
      miniMapVisible: ref(true),
      snapEnabled: ref(false),
      alignEnabled: ref(true),
      rulersEnabled: ref(true),
      lockAnchorsEnabled: ref(true),
      getGridOverlay: () => ({ setEnabled }),
      getMiniMap: () => ({ setEnabled: vi.fn() }),
      getRulersOverlay: () => ({ setEnabled: vi.fn() }),
    })

    controls.zoomIn()
    expect(setZoom).toHaveBeenCalledWith(1.2, { x: 60, y: 40 })

    expect(controls.toggleGrid()).toBe(false)
    expect(gridVisible.value).toBe(false)
    expect(setEnabled).toHaveBeenCalledWith(false)
    expect(markDirty).toHaveBeenCalled()
  })

  it('suppresses persist while restoring / setting viewport', () => {
    const persistViewport = vi.fn()
    const renderer = {
      zoom: 1,
      viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
      markDirty: vi.fn(),
      edges: new Map(),
    }
    const controls = useDiagramViewportControls({
      getRenderer: () => renderer as never,
      getInteraction: () => null,
      getContainerEl: () => null,
      persistViewport,
      flushPersistViewport: vi.fn(),
      restoreViewport: () => {
        controls.safePersistViewport('d1', renderer as never)
        return true
      },
      gridVisible: ref(true),
      miniMapVisible: ref(true),
      snapEnabled: ref(false),
      alignEnabled: ref(true),
      rulersEnabled: ref(true),
      lockAnchorsEnabled: ref(true),
      getGridOverlay: () => null,
      getMiniMap: () => null,
      getRulersOverlay: () => null,
    })

    controls.safeRestoreViewport('d1', renderer as never)
    expect(persistViewport).not.toHaveBeenCalled()

    controls.safePersistViewport('d1', renderer as never)
    expect(persistViewport).toHaveBeenCalledTimes(1)
  })

  it('toggles lock anchors and notifies host callback', () => {
    const markDirty = vi.fn()
    const onLockAnchorsToggled = vi.fn()
    const edges = new Map([['e1', { lockAnchors: true }]])
    const lockAnchorsEnabled = ref(true)
    const controls = useDiagramViewportControls({
      getRenderer: () =>
        ({
          zoom: 1,
          viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
          markDirty,
          edges,
        }) as never,
      getInteraction: () => null,
      getContainerEl: () => null,
      persistViewport: vi.fn(),
      flushPersistViewport: vi.fn(),
      restoreViewport: vi.fn(() => true),
      gridVisible: ref(true),
      miniMapVisible: ref(true),
      snapEnabled: ref(false),
      alignEnabled: ref(true),
      rulersEnabled: ref(true),
      lockAnchorsEnabled,
      getGridOverlay: () => null,
      getMiniMap: () => null,
      getRulersOverlay: () => null,
      onLockAnchorsToggled,
    })

    expect(controls.toggleLockAnchors()).toBe(false)
    expect(lockAnchorsEnabled.value).toBe(false)
    expect(edges.get('e1')?.lockAnchors).toBe(false)
    expect(onLockAnchorsToggled).toHaveBeenCalledWith(false)
    expect(markDirty).toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const STORAGE_KEY = 'warchi:model-diagram-viewport:v1'

vi.mock('@/utils/localStorage', () => ({
  loadJson: vi.fn(() => null),
  saveJson: vi.fn(),
}))

import { persistDiagramViewport, restoreDiagramViewport } from './diagramViewportPersistence'
import { loadJson, saveJson } from '@/utils/localStorage'

function makeMockRenderer(zoom = 1, offsetX = 0, offsetY = 0) {
  return {
    zoom,
    offsetX,
    offsetY,
    viewport: null as unknown,
    markDirty: vi.fn(),
  }
}

describe('diagramViewportPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(Date, 'now').mockReturnValue(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('persistDiagramViewport', () => {
    it('saves viewport state for a diagram after debounce', () => {
      vi.mocked(loadJson).mockReturnValue(null)

      const renderer = makeMockRenderer(1.5, 100, 200)
      persistDiagramViewport('diagram-1', renderer as never)
      expect(saveJson).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)

      expect(saveJson).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.objectContaining({
          'diagram-1': { zoom: 1.5, offsetX: 100, offsetY: 200, updatedAt: 1000 },
        })
      )
    })

    it('coalesces rapid pan/zoom persists into one write', () => {
      vi.mocked(loadJson).mockReturnValue(null)
      const renderer = makeMockRenderer(1, 0, 0)
      persistDiagramViewport('diagram-1', renderer as never)
      renderer.offsetX = 10
      persistDiagramViewport('diagram-1', renderer as never)
      renderer.offsetX = 20
      persistDiagramViewport('diagram-1', renderer as never)
      vi.advanceTimersByTime(200)
      expect(saveJson).toHaveBeenCalledTimes(1)
      expect(saveJson).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.objectContaining({
          'diagram-1': expect.objectContaining({ offsetX: 20 }),
        })
      )
    })

    it('clamps zoom to min/max range', () => {
      vi.mocked(loadJson).mockReturnValue(null)

      const renderer = makeMockRenderer(0.1, 0, 0)
      persistDiagramViewport('diagram-1', renderer as never)
      vi.advanceTimersByTime(200)

      expect(saveJson).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.objectContaining({
          'diagram-1': expect.objectContaining({ zoom: 0.3 }),
        })
      )
    })

    it('clamps zoom above max', () => {
      vi.mocked(loadJson).mockReturnValue(null)

      const renderer = makeMockRenderer(5.0, 0, 0)
      persistDiagramViewport('diagram-1', renderer as never)
      vi.advanceTimersByTime(200)

      expect(saveJson).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.objectContaining({
          'diagram-1': expect.objectContaining({ zoom: 2.5 }),
        })
      )
    })

    it('merges with existing stored viewports', () => {
      vi.mocked(loadJson).mockReturnValue({
        'diagram-old': { zoom: 1, offsetX: 0, offsetY: 0, updatedAt: 500 },
      })

      const renderer = makeMockRenderer(1, 50, 60)
      persistDiagramViewport('diagram-new', renderer as never)
      vi.advanceTimersByTime(200)

      expect(saveJson).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.objectContaining({
          'diagram-new': expect.objectContaining({ offsetX: 50 }),
          'diagram-old': expect.objectContaining({ offsetX: 0 }),
        })
      )
    })
  })

  describe('restoreDiagramViewport', () => {
    it('restores saved viewport and returns true', () => {
      vi.mocked(loadJson).mockReturnValue({
        'diagram-1': { zoom: 1.2, offsetX: 30, offsetY: 40, updatedAt: 900 },
      })

      const renderer = makeMockRenderer()
      const result = restoreDiagramViewport('diagram-1', renderer as never)

      expect(result).toBe(true)
      expect(renderer.viewport).toEqual({ zoom: 1.2, offsetX: 30, offsetY: 40 })
      expect(renderer.markDirty).toHaveBeenCalled()
    })

    it('returns false when no saved viewport', () => {
      vi.mocked(loadJson).mockReturnValue(null)

      const renderer = makeMockRenderer()
      const result = restoreDiagramViewport('diagram-1', renderer as never)

      expect(result).toBe(false)
      expect(renderer.markDirty).not.toHaveBeenCalled()
    })

    it('returns false when diagram id not found', () => {
      vi.mocked(loadJson).mockReturnValue({
        'other-diagram': { zoom: 1, offsetX: 0, offsetY: 0, updatedAt: 500 },
      })

      const renderer = makeMockRenderer()
      const result = restoreDiagramViewport('diagram-1', renderer as never)

      expect(result).toBe(false)
    })

    it('clamps zoom on restore', () => {
      vi.mocked(loadJson).mockReturnValue({
        'diagram-1': { zoom: 0.1, offsetX: 0, offsetY: 0, updatedAt: 900 },
      })

      const renderer = makeMockRenderer()
      restoreDiagramViewport('diagram-1', renderer as never)

      expect((renderer.viewport as { zoom: number }).zoom).toBe(0.3)
    })

    it('skips entries with invalid data', () => {
      vi.mocked(loadJson).mockReturnValue({
        'diagram-1': { zoom: 'invalid', offsetX: 0, offsetY: 0 },
      })

      const renderer = makeMockRenderer()
      const result = restoreDiagramViewport('diagram-1', renderer as never)

      expect(result).toBe(false)
    })

    it('skips entries with NaN values', () => {
      vi.mocked(loadJson).mockReturnValue({
        'diagram-1': { zoom: NaN, offsetX: 0, offsetY: 0 },
      })

      const renderer = makeMockRenderer()
      const result = restoreDiagramViewport('diagram-1', renderer as never)

      expect(result).toBe(false)
    })

    it('skips entries with Infinity values', () => {
      vi.mocked(loadJson).mockReturnValue({
        'diagram-1': { zoom: Infinity, offsetX: 0, offsetY: 0 },
      })

      const renderer = makeMockRenderer()
      const result = restoreDiagramViewport('diagram-1', renderer as never)

      expect(result).toBe(false)
    })
  })
})

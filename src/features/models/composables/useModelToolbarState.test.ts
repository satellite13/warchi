import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/utils/localStorage', () => ({
  loadJson: vi.fn(() => null),
  saveJson: vi.fn(),
}))

import { useModelToolbarState, type EdgePathType } from './useModelToolbarState'
import { loadJson, saveJson } from '@/utils/localStorage'

describe('useModelToolbarState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createState() {
    const userId = ref<string | null>('test-user')
    const hasActiveDiagram = ref(true)
    return { userId, hasActiveDiagram, ...useModelToolbarState(userId, hasActiveDiagram) }
  }

  describe('default values', () => {
    it('has correct defaults when no saved state', () => {
      const state = createState()

      expect(state.gridVisible.value).toBe(true)
      expect(state.miniMapVisible.value).toBe(true)
      expect(state.snapEnabled.value).toBe(false)
      expect(state.alignEnabled.value).toBe(true)
      expect(state.rulersEnabled.value).toBe(true)
      expect(state.lockAnchorsEnabled.value).toBe(true)
      expect(state.attachToOutlineEnabled.value).toBe(true)
      expect(state.selectionSyncEnabled.value).toBe(true)
      expect(state.canvasSettingsVisible.value).toBe(true)
      expect(state.paletteVisible.value).toBe(true)
      expect(state.autoLinkInGroups.value).toBe(true)
      expect(state.diagramNavigationOnlyMode.value).toBe(false)
      expect(state.defaultEdgeType.value).toBe('bezier')
    })
  })

  describe('restoring saved state', () => {
    it('applies saved state from localStorage on init', () => {
      vi.mocked(loadJson).mockReturnValue({
        gridVisible: false,
        snapEnabled: true,
        defaultEdgeType: 'polyline',
      })

      const state = createState()

      expect(state.gridVisible.value).toBe(false)
      expect(state.snapEnabled.value).toBe(true)
      expect(state.defaultEdgeType.value).toBe('polyline')
    })

    it('ignores invalid edge types', () => {
      vi.mocked(loadJson).mockReturnValue({
        defaultEdgeType: 'invalid-type',
      })

      const state = createState()
      expect(state.defaultEdgeType.value).toBe('bezier')
    })
  })

  describe('persisting state', () => {
    it('saves to localStorage when values change', async () => {
      const state = createState()
      vi.mocked(saveJson).mockClear()

      state.gridVisible.value = false
      await nextTick()

      expect(saveJson).toHaveBeenCalledWith(
        'warchi:model-editor:toolbar-state:test-user',
        expect.objectContaining({ gridVisible: false })
      )
    })

    it('uses anonymous key when userId is null', async () => {
      const userId = ref<string | null>(null)
      const hasActiveDiagram = ref(true)
      const state = useModelToolbarState(userId, hasActiveDiagram)
      vi.mocked(saveJson).mockClear()

      state.snapEnabled.value = true
      await nextTick()

      expect(saveJson).toHaveBeenCalledWith(
        'warchi:model-editor:toolbar-state:anonymous',
        expect.objectContaining({ snapEnabled: true })
      )
    })
  })

  describe('canvasToggleButtons', () => {
    it('returns array of buttons', () => {
      const state = createState()
      const buttons = state.canvasToggleButtons.value

      expect(buttons.length).toBeGreaterThan(0)
      expect(buttons[0]).toHaveProperty('icon')
      expect(buttons[0]).toHaveProperty('event')
      expect(buttons[0]).toHaveProperty('title')
      expect(buttons[0]).toHaveProperty('active')
    })

    it('disables buttons when no active diagram', () => {
      const userId = ref<string | null>('test-user')
      const hasActiveDiagram = ref(false)
      const state = useModelToolbarState(userId, hasActiveDiagram)
      const buttons = state.canvasToggleButtons.value

      for (const btn of buttons) {
        expect(btn.disabled).toBe(true)
      }
    })

    it('enables buttons when diagram is active', () => {
      const state = createState()
      const buttons = state.canvasToggleButtons.value

      for (const btn of buttons) {
        expect(btn.disabled).toBe(false)
      }
    })
  })

  describe('defaultLinkTypeOptions', () => {
    it('returns all four link type options', () => {
      const state = createState()
      const options = state.defaultLinkTypeOptions.value

      expect(options).toHaveLength(4)
      const values = options.map((o) => o.value)
      expect(values).toContain('straight')
      expect(values).toContain('polyline')
      expect(values).toContain('editable-polyline')
      expect(values).toContain('bezier')
    })
  })

  describe('toggling refs', () => {
    it('allows toggling boolean refs', () => {
      const state = createState()

      state.gridVisible.value = false
      expect(state.gridVisible.value).toBe(false)

      state.miniMapVisible.value = false
      expect(state.miniMapVisible.value).toBe(false)

      state.snapEnabled.value = true
      expect(state.snapEnabled.value).toBe(true)
    })

    it('allows changing defaultEdgeType', () => {
      const state = createState()

      const types: EdgePathType[] = ['straight', 'polyline', 'editable-polyline', 'bezier']
      for (const t of types) {
        state.defaultEdgeType.value = t
        expect(state.defaultEdgeType.value).toBe(t)
      }
    })
  })
})

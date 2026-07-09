import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost } from '@/composables/useApi'
import { isDiagramServerNewerThanLocal, useDiagramEditLock } from './useDiagramEditLock'

vi.mock('@/composables/useApi', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

function mountLock(selectedDiagramId = ref<string | null>(null)) {
  let lock!: ReturnType<typeof useDiagramEditLock>
  const wrapper = mount(
    defineComponent({
      setup() {
        lock = useDiagramEditLock({
          modelId: ref('model-1'),
          selectedDiagramId,
          isActiveDiagramLatest: ref(true),
          canEditModel: ref(true),
          isSelectedDiagramPersistedOnServer: ref(true),
        })
        return () => null
      },
    })
  )
  return { lock, selectedDiagramId, wrapper }
}

describe("isDiagramServerNewerThanLocal", () => {
  it("returns false when remote is null", () => {
    expect(isDiagramServerNewerThanLocal(null, "2025-01-01T00:00:00.000Z")).toBe(false)
  })

  it("returns false when local is null or undefined", () => {
    expect(isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", null)).toBe(false)
    expect(isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", undefined)).toBe(false)
  })

  it("returns false when remote is not newer than local", () => {
    expect(
      isDiagramServerNewerThanLocal("2024-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z")
    ).toBe(false)
    expect(
      isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z")
    ).toBe(false)
  })

  it("returns true when remote is strictly newer than local", () => {
    expect(
      isDiagramServerNewerThanLocal("2025-06-15T12:00:00.000Z", "2025-01-01T00:00:00.000Z")
    ).toBe(true)
  })

  it("returns false for invalid ISO strings", () => {
    expect(isDiagramServerNewerThanLocal("not-a-date", "2025-01-01T00:00:00.000Z")).toBe(false)
    expect(isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", "invalid")).toBe(false)
  })
})

describe('useDiagramEditLock', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset()
    vi.mocked(apiPost).mockReset()
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        content: [
          {
            diagramId: 'diagram-1',
            isLocked: true,
            lockedByUserId: 'user-1',
          },
        ],
        totalElements: 1,
        totalPages: 1,
        size: 20,
        number: 0,
      },
    })
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: {
        diagramId: 'diagram-1',
        isLocked: true,
        lockedByUserId: 'user-1',
      },
    })
  })

  it('acquires a lock when a persisted latest editable diagram is selected', async () => {
    const { lock, selectedDiagramId } = mountLock()

    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
    expect(lock.isLockHeld.value).toBe(true)
    expect(lock.isBlockedByOther.value).toBe(false)
  })

  it('marks the selected diagram as blocked when another user holds the lock', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: {
        diagramId: 'diagram-1',
        isLocked: true,
        lockedByUserId: 'user-2',
        lockedByDisplay: 'Other User',
        diagramUpdatedAt: '2026-01-02T00:00:00.000Z',
        reason: 'LOCKED_BY_OTHER',
      },
    })
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        content: [
          {
            diagramId: 'diagram-1',
            isLocked: true,
            lockedByUserId: 'user-2',
            lockedByDisplay: 'Other User',
            diagramUpdatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        totalElements: 1,
        totalPages: 1,
        size: 20,
        number: 0,
      },
    })
    const { lock, selectedDiagramId } = mountLock()

    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    expect(lock.isLockHeld.value).toBe(false)
    expect(lock.isBlockedByOther.value).toBe(true)
    expect(lock.lockHolderDisplay.value).toBe('Other User')
    expect(lock.remoteDiagramUpdatedAt.value).toBe('2026-01-02T00:00:00.000Z')
  })

  it('revokes local lock state when verify before save no longer finds our lock', async () => {
    const { lock, selectedDiagramId } = mountLock()

    selectedDiagramId.value = 'diagram-1'
    await flushPromises()
    expect(lock.isLockHeld.value).toBe(true)

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        content: [],
        totalElements: 0,
        totalPages: 0,
        size: 20,
        number: 0,
      },
    })

    await expect(lock.verifyLockBeforeSave()).resolves.toBe(false)
    expect(lock.isLockHeld.value).toBe(false)
    expect(lock.lockForceRevoked.value).toBe(true)
  })
})

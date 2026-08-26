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

  it('infers blocked state from locks list when acquire returns bare 409', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: false,
      error: { status: 409, message: 'Diagram lock is held by another user' },
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

  it('re-acquires when the locks list no longer contains our held lock', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()
    expect(lock.isLockHeld.value).toBe(true)

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return {
          success: true,
          data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
        }
      }
      return { success: true, data: {} }
    })

    await lock.fetchLocksList()
    await flushPromises()

    expect(lock.isLockHeld.value).toBe(true)
    expect(lock.lockLost.value).toBe(false)
    expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
  })

  it('becomes blocked and keeps lockLost false when another user took the lock', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return {
          success: true,
          data: {
            diagramId: 'diagram-1',
            isLocked: true,
            lockedByUserId: 'user-2',
            lockedByDisplay: 'Other User',
            reason: 'LOCKED_BY_OTHER',
          },
        }
      }
      return { success: true, data: {} }
    })

    await lock.fetchLocksList()
    await flushPromises()

    expect(lock.isLockHeld.value).toBe(false)
    expect(lock.isBlockedByOther.value).toBe(true)
    expect(lock.lockHolderDisplay.value).toBe('Other User')
    expect(lock.lockLost.value).toBe(false)
    expect(lock.preserveLocalCanvasAfterLockLoss.value).toBe(true)
  })

  it('ignores a locks-list response that arrives during release or acquire', async () => {
    const resolveListFns: Array<(value: unknown) => void> = []
    vi.mocked(apiGet).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListFns.push(resolve)
        })
    )
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
    })

    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    expect(lock.isLockHeld.value).toBe(true)
    const acquireCountAfterHold = vi
      .mocked(apiPost)
      .mock.calls.filter((call) => String(call[0]).endsWith('/acquire')).length

    const emptyList = {
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    }
    for (const resolve of resolveListFns) {
      resolve(emptyList)
    }
    await flushPromises()

    expect(lock.lockLost.value).toBe(false)
    expect(lock.isLockHeld.value).toBe(true)
    expect(lock.preserveLocalCanvasAfterLockLoss.value).toBe(false)
    const acquireCountAfterList = vi
      .mocked(apiPost)
      .mock.calls.filter((call) => String(call[0]).endsWith('/acquire')).length
    expect(acquireCountAfterList).toBe(acquireCountAfterHold)
  })

  it('skips release+acquire when apply is invoked while already holding the eligible diagram', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()
    vi.mocked(apiPost).mockClear()

    await lock.retryAcquire()
    await flushPromises()

    expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/release', {})
    expect(apiPost).not.toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
    expect(lock.isLockHeld.value).toBe(true)
  })

  it('recovers the lock when heartbeat reports the lock is gone', async () => {
    vi.useFakeTimers()
    try {
      const { lock, selectedDiagramId } = mountLock()
      selectedDiagramId.value = 'diagram-1'
      await flushPromises()
      expect(lock.isLockHeld.value).toBe(true)
      vi.mocked(apiPost).mockClear()

      vi.mocked(apiPost).mockImplementation(async (url: string) => {
        if (String(url).endsWith('/heartbeat')) {
          return { success: false, error: { status: 404, message: 'Lock expired' } }
        }
        if (String(url).endsWith('/acquire')) {
          return {
            success: true,
            data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
          }
        }
        return { success: true, data: {} }
      })

      await vi.advanceTimersByTimeAsync(60_000)
      await flushPromises()

      expect(apiPost).toHaveBeenCalledWith('/diagram-locks/diagram-1/acquire', {})
      expect(lock.isLockHeld.value).toBe(true)
      expect(lock.lockLost.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('verifyLockBeforeSave re-acquires a missing lock and allows save', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return {
          success: true,
          data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
        }
      }
      return { success: true, data: {} }
    })

    await expect(lock.verifyLockBeforeSave()).resolves.toBe(true)
    expect(lock.isLockHeld.value).toBe(true)
    expect(lock.lockLost.value).toBe(false)
  })

  it('clears preserveLocalCanvasAfterLockLoss on reloadAfterRemoteChange', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return {
          success: true,
          data: {
            diagramId: 'diagram-1',
            isLocked: true,
            lockedByUserId: 'user-2',
            lockedByDisplay: 'Other User',
            reason: 'LOCKED_BY_OTHER',
          },
        }
      }
      return { success: true, data: {} }
    })

    await lock.fetchLocksList()
    await flushPromises()
    expect(lock.preserveLocalCanvasAfterLockLoss.value).toBe(true)

    await lock.reloadAfterRemoteChange(async () => undefined)
    expect(lock.preserveLocalCanvasAfterLockLoss.value).toBe(false)
  })

  it('verifyLockBeforeSave returns false when another user holds the lock', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return {
          success: true,
          data: {
            diagramId: 'diagram-1',
            isLocked: true,
            lockedByUserId: 'user-2',
            lockedByDisplay: 'Other User',
            reason: 'LOCKED_BY_OTHER',
          },
        }
      }
      return { success: true, data: {} }
    })

    await expect(lock.verifyLockBeforeSave()).resolves.toBe(false)
    expect(lock.isBlockedByOther.value).toBe(true)
    expect(lock.lockLost.value).toBe(false)
  })

  it('verifyLockBeforeSave returns false while recover acquire is in flight', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()
    expect(lock.isLockHeld.value).toBe(true)

    let resolveAcquire: ((value: unknown) => void) | null = null
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return new Promise((resolve) => {
          resolveAcquire = resolve
        })
      }
      return { success: true, data: {} }
    })

    const recoverPromise = lock.fetchLocksList()
    await flushPromises()
    await expect(lock.verifyLockBeforeSave()).resolves.toBe(false)

    resolveAcquire?.({
      success: true,
      data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
    })
    await recoverPromise
    await flushPromises()
  })

  it('verifyLockBeforeSave returns false when lockLost is already set', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return { success: false, error: { status: 500, message: 'down' } }
      }
      return { success: true, data: {} }
    })

    await lock.fetchLocksList()
    await flushPromises()
    expect(lock.lockLost.value).toBe(true)
    await expect(lock.verifyLockBeforeSave()).resolves.toBe(false)
  })

  it('clears lockLost after retryAcquire successfully re-acquires', async () => {
    const { lock, selectedDiagramId } = mountLock()
    selectedDiagramId.value = 'diagram-1'
    await flushPromises()

    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 0, size: 0 },
    })
    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return { success: false, error: { status: 500, message: 'down' } }
      }
      return { success: true, data: {} }
    })
    await lock.fetchLocksList()
    await flushPromises()
    expect(lock.lockLost.value).toBe(true)

    vi.mocked(apiPost).mockImplementation(async (url: string) => {
      if (String(url).endsWith('/acquire')) {
        return {
          success: true,
          data: { diagramId: 'diagram-1', isLocked: true, lockedByUserId: 'user-1' },
        }
      }
      return { success: true, data: {} }
    })
    await lock.retryAcquire()
    await flushPromises()
    expect(lock.lockLost.value).toBe(false)
    expect(lock.isLockHeld.value).toBe(true)
    await expect(lock.verifyLockBeforeSave()).resolves.toBe(true)
  })
})

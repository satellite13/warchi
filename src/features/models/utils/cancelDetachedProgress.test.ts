import { describe, expect, it, vi } from 'vitest'
import { cancelDetachedProgress } from './cancelDetachedProgress'

describe('cancelDetachedProgress', () => {
  it('cancels only the save snapshot while save validation is running', () => {
    const saveCancel = vi.fn()
    const scriptsCancel = vi.fn()

    cancelDetachedProgress({
      savePreparing: true,
      scriptsPreparing: true,
      saveCancel,
      scriptsCancel,
    })

    expect(saveCancel).toHaveBeenCalledTimes(1)
    expect(scriptsCancel).not.toHaveBeenCalled()
  })

  it('cancels only the scripts snapshot while script load is running', () => {
    const saveCancel = vi.fn()
    const scriptsCancel = vi.fn()

    cancelDetachedProgress({
      savePreparing: false,
      scriptsPreparing: true,
      saveCancel,
      scriptsCancel,
    })

    expect(saveCancel).not.toHaveBeenCalled()
    expect(scriptsCancel).toHaveBeenCalledTimes(1)
  })
})

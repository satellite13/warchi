import { describe, expect, it, vi } from 'vitest'
import { cancelDetachedProgress } from './cancelDetachedProgress'

describe('cancelDetachedProgress', () => {
  it('cancels the scripts snapshot while script load is running', () => {
    const scriptsCancel = vi.fn()

    cancelDetachedProgress({
      scriptsPreparing: true,
      scriptsCancel,
    })

    expect(scriptsCancel).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { applyPendingDiagramSwitch } from './applyPendingDiagramSwitch'

describe('applyPendingDiagramSwitch', () => {
  it('does not close or switch when discard/reset returns false', async () => {
    const discard = vi.fn(async () => false)

    const closeResult = await applyPendingDiagramSwitch({
      discard,
      action: 'close',
      targetDiagramId: null,
    })
    const switchResult = await applyPendingDiagramSwitch({
      discard,
      action: 'switch',
      targetDiagramId: 'diagram-2',
    })

    expect(closeResult).toEqual({ ok: false })
    expect(switchResult).toEqual({ ok: false })
    expect(discard).toHaveBeenCalledTimes(2)
  })

  it('closes or switches only after a successful discard', async () => {
    const discard = vi.fn(async () => true)

    await expect(
      applyPendingDiagramSwitch({
        discard,
        action: 'close',
        targetDiagramId: null,
      })
    ).resolves.toEqual({ ok: true, effect: 'close' })
    await expect(
      applyPendingDiagramSwitch({
        discard,
        action: 'switch',
        targetDiagramId: 'diagram-2',
      })
    ).resolves.toEqual({ ok: true, effect: 'switch', diagramId: 'diagram-2' })
  })
})

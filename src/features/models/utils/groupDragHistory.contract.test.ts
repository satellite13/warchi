import { InteractionManager } from '@ngroznykh/papirus'
import { describe, expect, it } from 'vitest'

describe('group drag undo contract', () => {
  it('exposes recordAdditionalDragStartPositions so nested followers and their edges enter papirus history', () => {
    expect(typeof InteractionManager.prototype.recordAdditionalDragStartPositions).toBe(
      'function'
    )
  })
})

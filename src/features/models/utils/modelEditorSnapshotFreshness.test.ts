import { beforeEach, describe, expect, it } from 'vitest'
import {
  isModelEditorSnapshotFresh,
  markModelEditorSnapshotFresh,
  resetModelEditorSnapshotFreshness,
} from './modelEditorSnapshotFreshness'

describe('modelEditorSnapshotFreshness', () => {
  beforeEach(() => {
    resetModelEditorSnapshotFreshness()
  })

  it('is fresh only within ttl after mark', () => {
    const now = 1_000_000
    expect(isModelEditorSnapshotFresh(now)).toBe(false)
    markModelEditorSnapshotFresh(5_000, now)
    expect(isModelEditorSnapshotFresh(now)).toBe(true)
    expect(isModelEditorSnapshotFresh(now + 4_999)).toBe(true)
    expect(isModelEditorSnapshotFresh(now + 5_001)).toBe(false)
  })
})

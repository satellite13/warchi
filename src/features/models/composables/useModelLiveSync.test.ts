import { describe, expect, it } from 'vitest'
import { parseModelLivePollMs, parseModelLiveSyncMode } from './useModelLiveSync'

describe('useModelLiveSync config parsing', () => {
  it('accepts supported sync modes and defaults unknown values to hybrid', () => {
    expect(parseModelLiveSyncMode('ws')).toBe('ws')
    expect(parseModelLiveSyncMode('poll')).toBe('poll')
    expect(parseModelLiveSyncMode('hybrid')).toBe('hybrid')
    expect(parseModelLiveSyncMode(' HYBRID ')).toBe('hybrid')
    expect(parseModelLiveSyncMode('invalid')).toBe('hybrid')
    expect(parseModelLiveSyncMode(undefined)).toBe('hybrid')
  })

  it('normalizes poll interval to a finite integer with a one second minimum', () => {
    expect(parseModelLivePollMs('2500.9')).toBe(2500)
    expect(parseModelLivePollMs('100')).toBe(1000)
    expect(parseModelLivePollMs('not-a-number')).toBe(15_000)
    expect(parseModelLivePollMs(undefined)).toBe(15_000)
  })
})

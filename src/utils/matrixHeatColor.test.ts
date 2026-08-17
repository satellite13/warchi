import { describe, expect, it } from 'vitest'
import { matrixHeatColor } from './matrixHeatColor'

describe('matrixHeatColor', () => {
  it('returns transparent for empty cells', () => {
    expect(matrixHeatColor(0, 10)).toBe('transparent')
  })

  it('returns soft primary when heatmap is off', () => {
    expect(matrixHeatColor(3, 10, false)).toBe('var(--primary-soft)')
  })

  it('scales alpha by ratio', () => {
    expect(matrixHeatColor(10, 10)).toBe('rgba(124, 92, 252, 0.600)')
  })
})

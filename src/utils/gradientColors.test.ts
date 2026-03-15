import { describe, expect, it } from 'vitest'
import { getGradient } from '@/utils/gradientColors'

describe('getGradient', () => {
  it('returns a linear-gradient string', () => {
    const result = getGradient('test-id')
    expect(result).toMatch(/^linear-gradient\(/)
  })

  it('returns the same gradient for the same id', () => {
    const first = getGradient('my-entity')
    const second = getGradient('my-entity')
    expect(first).toBe(second)
  })

  it('is deterministic across multiple calls', () => {
    const results = Array.from({ length: 10 }, () => getGradient('stable'))
    expect(new Set(results).size).toBe(1)
  })

  it('may return different gradients for different ids', () => {
    const ids = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota']
    const gradients = new Set(ids.map((id) => getGradient(id)))
    expect(gradients.size).toBeGreaterThan(1)
  })

  it('handles empty string id', () => {
    const result = getGradient('')
    expect(result).toMatch(/^linear-gradient\(/)
  })

  it('handles single character id', () => {
    const result = getGradient('a')
    expect(result).toMatch(/^linear-gradient\(/)
  })

  it('handles very long id', () => {
    const longId = 'x'.repeat(10000)
    const result = getGradient(longId)
    expect(result).toMatch(/^linear-gradient\(/)
  })

  it('handles id with special characters', () => {
    const result = getGradient('uuid-1234-5678-abcd')
    expect(result).toMatch(/^linear-gradient\(/)
  })

  it('returns one of the predefined gradient values', () => {
    const knownGradients = [
      'linear-gradient(135deg, #7c5cfc 0%, #b06cff 100%)',
      'linear-gradient(135deg, #45e0b8 0%, #7c5cfc 100%)',
      'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',
      'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
      'linear-gradient(135deg, #fb923c 0%, #f472b6 100%)',
      'linear-gradient(135deg, #34d399 0%, #38bdf8 100%)',
      'linear-gradient(135deg, #fbbf24 0%, #fb923c 100%)',
      'linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)',
    ]
    const result = getGradient('any-id')
    expect(knownGradients).toContain(result)
  })
})

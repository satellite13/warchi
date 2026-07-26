import { describe, expect, it } from 'vitest'
import { applyContentInsetFromStyle } from './applyContentInsetFromStyle'

describe('applyContentInsetFromStyle', () => {
  it('sets inset, scale flags, and base from style defaults', () => {
    const node: {
      contentInset: unknown
      contentInsetScale?: { top?: boolean; left?: boolean }
      contentInsetBaseSize?: { width: number; height: number }
    } = { contentInset: 0 }

    applyContentInsetFromStyle(node, {
      contentInset: { top: 48, left: 8, right: 8, bottom: 8 },
      contentInsetScale: { top: true, left: true },
      width: 100,
      height: 120,
    })

    expect(node.contentInset).toEqual({ top: 48, left: 8, right: 8, bottom: 8 })
    expect(node.contentInsetScale).toEqual({ top: true, left: true })
    expect(node.contentInsetBaseSize).toEqual({ width: 100, height: 120 })
  })

  it('prefers explicit baseStyle for base size', () => {
    const node: {
      contentInset: unknown
      contentInsetScale?: { top?: boolean }
      contentInsetBaseSize?: { width: number; height: number }
    } = { contentInset: 0 }

    applyContentInsetFromStyle(
      node,
      {
        contentInset: { top: 40 },
        contentInsetScale: { top: true },
        width: 320,
        height: 240,
      },
      { width: 100, height: 120 }
    )

    expect(node.contentInsetBaseSize).toEqual({ width: 100, height: 120 })
  })

  it('clears scale when no true sides', () => {
    const node: {
      contentInset: unknown
      contentInsetScale?: { top?: boolean }
      contentInsetBaseSize?: { width: number; height: number }
    } = {
      contentInset: 0,
      contentInsetScale: { top: true },
      contentInsetBaseSize: { width: 10, height: 10 },
    }

    applyContentInsetFromStyle(node, { contentInset: 0, width: 0, height: 0 })
    expect(node.contentInsetScale).toBeUndefined()
    expect(node.contentInsetBaseSize).toBeUndefined()
  })
})

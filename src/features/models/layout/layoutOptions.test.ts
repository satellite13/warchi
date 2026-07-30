import { describe, expect, it } from 'vitest'
import { defaultLayoutUiOptions, toElkLayoutOptions } from './layoutOptions'

describe('toElkLayoutOptions', () => {
  it('maps layered basics', () => {
    const ui = defaultLayoutUiOptions('layered')
    ui.direction = 'DOWN'
    ui.nodeNodeSpacing = 32
    ui.layerSpacing = 64
    ui.edgeRouting = 'POLYLINE'
    const elk = toElkLayoutOptions('layered', ui)
    expect(elk['elk.algorithm']).toBe('layered')
    expect(elk['elk.direction']).toBe('DOWN')
    expect(elk['elk.spacing.nodeNode']).toBe('32')
    expect(elk['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('64')
    expect(elk['elk.edgeRouting']).toBe('POLYLINE')
  })

  it('omits direction/layer spacing for overlap', () => {
    const ui = defaultLayoutUiOptions('overlap')
    ui.nodeNodeSpacing = 50
    const elk = toElkLayoutOptions('overlap', ui)
    expect(elk['elk.algorithm']).toBe('sporeOverlap')
    expect(elk['elk.direction']).toBeUndefined()
    expect(elk['elk.layered.spacing.nodeNodeBetweenLayers']).toBeUndefined()
    expect(elk['elk.spacing.nodeNode']).toBe('50')
  })

  it('applies advanced layered fields when set', () => {
    const ui = defaultLayoutUiOptions('layered')
    ui.padding = '8'
    ui.crossingStrategy = 'LAYER_SWEEP'
    ui.edgeNodeSpacing = 12
    const elk = toElkLayoutOptions('layered', ui)
    expect(elk['elk.padding']).toBe('8')
    expect(elk['elk.layered.crossingMinimization.strategy']).toBe('LAYER_SWEEP')
    expect(elk['elk.spacing.edgeNode']).toBe('12')
  })

  it('enables sporeCompaction when advanced flag on', () => {
    const ui = defaultLayoutUiOptions('overlap')
    ui.sporeCompaction = true
    const elk = toElkLayoutOptions('overlap', ui)
    expect(elk['elk.algorithm']).toBe('org.eclipse.elk.sporeCompaction')
  })
})

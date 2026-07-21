import { describe, expect, it } from 'vitest'
import {
  resolveComponentAnchorPoints,
  resolveLabelTemplate,
  buildNodeLabel,
  buildEdgeLabel,
  buildEdgeLabelBackground,
  buildNodeIcon,
  buildMarker,
} from '@/features/notations/utils/notationElementBuilders'
import type { DiagramStyle, CustomProperty } from '@/domain/attrs/notationAttrs'
import type { TextLabelOptions } from '@ngroznykh/papirus'

function makeCustomProp(overrides: Partial<CustomProperty> & { id: string; name: string }): CustomProperty {
  return {
    type: 'string',
    required: false,
    min: null,
    max: null,
    ...overrides,
  }
}

function expectTextLabelOptions(value: string | TextLabelOptions): TextLabelOptions {
  expect(typeof value).toBe('object')
  return value as TextLabelOptions
}

describe('resolveComponentAnchorPoints', () => {
  it('returns defaults when no DiagramStyle', () => {
    expect(resolveComponentAnchorPoints()).toEqual({ top: 3, right: 1, bottom: 3, left: 1 })
  })

  it('returns defaults when DiagramStyle has no port values', () => {
    expect(resolveComponentAnchorPoints({})).toEqual({ top: 3, right: 1, bottom: 3, left: 1 })
  })

  it('uses provided port values', () => {
    const ds: DiagramStyle = { portsTop: 5, portsRight: 2, portsBottom: 4, portsLeft: 3 }
    expect(resolveComponentAnchorPoints(ds)).toEqual({ top: 5, right: 2, bottom: 4, left: 3 })
  })

  it('falls back on invalid values', () => {
    const ds: DiagramStyle = { portsTop: -1, portsRight: NaN } as DiagramStyle
    const result = resolveComponentAnchorPoints(ds)
    expect(result.top).toBe(3)
    expect(result.right).toBe(1)
  })
})

describe('resolveLabelTemplate', () => {
  it('replaces ${name} with the name argument', () => {
    expect(resolveLabelTemplate('<<${name}>>', 'MyNode', [])).toBe('<<MyNode>>')
  })

  it('replaces custom property placeholders', () => {
    const props = [makeCustomProp({ id: '1', name: 'status', defaultValue: 'active' })]
    expect(resolveLabelTemplate('${name} [${status}]', 'Node', props)).toBe('Node [active]')
  })

  it('replaces unknown placeholders with empty string', () => {
    expect(resolveLabelTemplate('${name} ${unknown}', 'X', [])).toBe('X ')
  })

  it('converts \\n to newline', () => {
    expect(resolveLabelTemplate('A\\nB', 'X', [])).toBe('A\nB')
  })

  it('handles property with undefined defaultValue', () => {
    const props = [makeCustomProp({ id: '1', name: 'tag' })]
    expect(resolveLabelTemplate('${tag}', 'X', props)).toBe('')
  })

  it('resolves #{key} from type properties', () => {
    const typeProps = [makeCustomProp({ id: 't1', name: 'code', defaultValue: 'T0' })]
    const compProps = [makeCustomProp({ id: 'c1', name: 'status', defaultValue: 'ok' })]
    expect(resolveLabelTemplate('#{code} · ${status}', 'N', compProps, typeProps)).toBe('T0 · ok')
  })

  it('does not read type schema for ${prop}', () => {
    const typeProps = [makeCustomProp({ id: 't1', name: 'code', defaultValue: 'X' })]
    expect(resolveLabelTemplate('${code}', 'N', [], typeProps)).toBe('')
  })
})

describe('buildNodeLabel', () => {
  it('returns plain string when no DiagramStyle', () => {
    expect(buildNodeLabel('Node')).toBe('Node')
  })

  it('returns plain string when DiagramStyle has no label props', () => {
    expect(buildNodeLabel('Node', {})).toBe('Node')
  })

  it('returns TextLabelOptions with style when labelColor set', () => {
    const ds: DiagramStyle = { labelColor: '#ff0000' }
    const result = expectTextLabelOptions(buildNodeLabel('Node', ds))
    expect(result.text).toBe('Node')
    expect(result.style?.color).toBe('#ff0000')
  })

  it('returns TextLabelOptions with template', () => {
    const ds: DiagramStyle = { labelTemplate: '<<${name}>>' }
    const result = expectTextLabelOptions(buildNodeLabel('Test', ds))
    expect(result.text).toBe('<<Test>>')
    expect(result.editableText).toBe('Test')
  })

  it('includes labelFontSize and labelAlign', () => {
    const ds: DiagramStyle = { labelFontSize: 14, labelAlign: 'center' }
    const result = expectTextLabelOptions(buildNodeLabel('N', ds))
    expect(result.style?.fontSize).toBe(14)
    expect(result.style?.align).toBe('center')
  })

  it('includes inset when labelInset set', () => {
    const ds: DiagramStyle = { labelInset: 8 }
    const result = expectTextLabelOptions(buildNodeLabel('N', ds))
    expect(result.inset).toBe(8)
  })

  it('returns undefined when showLabel is false', () => {
    expect(buildNodeLabel('Node', { showLabel: false })).toBeUndefined()
    expect(buildNodeLabel('Node', { showLabel: false, labelColor: '#f00' })).toBeUndefined()
    expect(buildNodeLabel('Node', { showLabel: false, labelTemplate: '${name}' })).toBeUndefined()
  })

  it('still returns label when showLabel is true or absent', () => {
    expect(buildNodeLabel('Node', { showLabel: true })).toBe('Node')
    expect(buildNodeLabel('Node', {})).toBe('Node')
  })
})

describe('buildEdgeLabel', () => {
  it('returns plain string when no label style', () => {
    expect(buildEdgeLabel('Edge')).toBe('Edge')
    expect(buildEdgeLabel('Edge', {})).toBe('Edge')
  })

  it('returns TextLabelOptions when labelColor set', () => {
    const ds: DiagramStyle = { labelColor: '#00f' }
    const result = expectTextLabelOptions(buildEdgeLabel('E', ds))
    expect(result.text).toBe('E')
    expect(result.style?.color).toBe('#00f')
  })

  it('includes inset', () => {
    const ds: DiagramStyle = { labelInset: 4 }
    const result = expectTextLabelOptions(buildEdgeLabel('E', ds))
    expect(result.inset).toBe(4)
  })
})

describe('buildEdgeLabelBackground', () => {
  it('returns transparent when no style', () => {
    const result = buildEdgeLabelBackground()
    expect(result.color).toBe('transparent')
  })

  it('uses provided bgColor', () => {
    const ds: DiagramStyle = { labelBgColor: '#fff' }
    expect(buildEdgeLabelBackground(ds).color).toBe('#fff')
  })

  it('includes opacity, padding, borderRadius', () => {
    const ds: DiagramStyle = {
      labelBgColor: '#eee',
      labelBgOpacity: 0.5,
      labelBgPadding: 4,
      labelBgBorderRadius: 2,
    }
    const result = buildEdgeLabelBackground(ds)
    expect(result.opacity).toBe(0.5)
    expect(result.padding).toBe(4)
    expect(result.borderRadius).toBe(2)
  })
})

describe('buildNodeIcon', () => {
  it('returns undefined when no iconName', () => {
    expect(buildNodeIcon()).toBeUndefined()
    expect(buildNodeIcon({})).toBeUndefined()
  })

  it('returns icon config with defaults', () => {
    const ds: DiagramStyle = { iconName: 'server' }
    const result = buildNodeIcon(ds)!
    expect(result.source).toBe('/icons/server.svg')
    expect(result.placement).toBe('top-left')
    expect(result.width).toBe(20)
    expect(result.height).toBe(20)
    expect(result.fit).toBe('contain')
  })

  it('uses provided placement', () => {
    const ds: DiagramStyle = { iconName: 'x', iconPlacement: 'center' }
    expect(buildNodeIcon(ds)!.placement).toBe('center')
  })

  it('falls back to top-left for invalid placement', () => {
    const ds: DiagramStyle = { iconName: 'x', iconPlacement: 'invalid' }
    expect(buildNodeIcon(ds)!.placement).toBe('top-left')
  })

  it('uses iconInset over iconPadding', () => {
    const ds: DiagramStyle = { iconName: 'x', iconInset: 5, iconPadding: 10 }
    expect(buildNodeIcon(ds)!.inset).toBe(5)
  })

  it('falls back to iconPadding when no iconInset', () => {
    const ds: DiagramStyle = { iconName: 'x', iconPadding: 10 }
    expect(buildNodeIcon(ds)!.inset).toBe(10)
  })

  it('includes offset and color options', () => {
    const ds: DiagramStyle = {
      iconName: 'x',
      iconOffsetX: 3,
      iconOffsetY: 4,
      iconStrokeColor: '#000',
      iconFillColor: '#fff',
    }
    const result = buildNodeIcon(ds)!
    expect(result.offsetX).toBe(3)
    expect(result.offsetY).toBe(4)
    expect(result.strokeColor).toBe('#000')
    expect(result.fillColor).toBe('#fff')
  })
})

describe('buildMarker', () => {
  it('returns undefined for invalid type', () => {
    expect(buildMarker(undefined, {}, 'start')).toBeUndefined()
    expect(buildMarker('invalid', {}, 'end')).toBeUndefined()
  })

  it('returns explicit none marker so legacy arrowType heads stay disabled', () => {
    expect(buildMarker('none', {}, 'start')).toEqual({ type: 'none' })
    expect(buildMarker('none', {}, 'end')).toEqual({ type: 'none' })
  })

  it('returns marker for arrow type', () => {
    const result = buildMarker('arrow', {}, 'start')!
    expect(result.type).toBe('arrow')
    expect(result.size).toBe(12)
  })

  it('returns marker for all valid types', () => {
    for (const t of ['arrow', 'open', 'diamond', 'circle', 'square']) {
      expect(buildMarker(t, {}, 'end')!.type).toBe(t)
    }
  })

  it('uses startMarkerSize for start prefix', () => {
    const ds: DiagramStyle = { startMarkerSize: 20 }
    expect(buildMarker('arrow', ds, 'start')!.size).toBe(20)
  })

  it('uses endMarkerSize for end prefix', () => {
    const ds: DiagramStyle = { endMarkerSize: 16 }
    expect(buildMarker('arrow', ds, 'end')!.size).toBe(16)
  })

  it('includes fill color and opacity for start', () => {
    const ds: DiagramStyle = { startMarkerFillColor: '#f00', startMarkerFillOpacity: 0.8 }
    const result = buildMarker('diamond', ds, 'start')!
    expect(result.fillColor).toBe('#f00')
    expect(result.fillOpacity).toBe(0.8)
  })

  it('includes fill color and opacity for end', () => {
    const ds: DiagramStyle = { endMarkerFillColor: '#0f0', endMarkerFillOpacity: 0.5 }
    const result = buildMarker('circle', ds, 'end')!
    expect(result.fillColor).toBe('#0f0')
    expect(result.fillOpacity).toBe(0.5)
  })
})

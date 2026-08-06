import { describe, expect, it } from 'vitest'
import type { TextLabelOptions } from '@ngroznykh/papirus'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'
import {
  buildEdgeLabel as buildNotationEdgeLabel,
  buildEdgeLabelBackground as buildNotationEdgeLabelBackground,
  buildMarker,
  buildNodeIcon as buildNotationNodeIcon,
} from '@/features/notations/utils/notationElementBuilders'
import {
  buildModelEdgeDisplayLabel,
  buildModelEdgeLabelBackground,
  buildModelEdgeLabelConfig,
  buildModelNodeIcon,
  mergeEffectiveDiagramStyle,
  resolveModelEdgeOptions,
} from './diagramCanvasBuilders'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'

function prop(
  overrides: Partial<CustomProperty> & { id: string; name: string }
): CustomProperty {
  return {
    type: 'string',
    required: false,
    min: null,
    max: null,
    ...overrides,
  }
}

function expectTextLabelOptions(value: string | TextLabelOptions | undefined): TextLabelOptions {
  expect(typeof value).toBe('object')
  return value as TextLabelOptions
}

describe('diagramCanvasBuilders', () => {
  it('keeps model icon placement fallback while reusing notation icon fields', () => {
    const ds: DiagramStyle = { iconName: 'server', iconPlacement: 'invalid' }

    expect(buildModelNodeIcon(ds)).toMatchObject({
      ...buildNotationNodeIcon(ds),
      placement: 'left',
    })
  })

  it('matches notation node icon output for explicit valid placements', () => {
    const ds: DiagramStyle = {
      iconName: 'server',
      iconPlacement: 'center',
      iconInset: 6,
      iconOffsetX: 2,
      iconOffsetY: 3,
      iconStrokeColor: '#111',
      iconFillColor: '#eee',
    }

    expect(buildModelNodeIcon(ds)).toEqual(buildNotationNodeIcon(ds))
  })

  it('trims empty model edge labels and matches notation label style output', () => {
    expect(buildModelEdgeLabelConfig('  ')).toBeUndefined()

    const ds: DiagramStyle = { labelColor: '#00f', labelOpacity: 0.7, labelFontSize: 13, labelInset: 4 }
    const modelLabel = expectTextLabelOptions(buildModelEdgeLabelConfig('  Rel  ', ds))
    const notationLabel = expectTextLabelOptions(buildNotationEdgeLabel('Rel', ds))

    expect(modelLabel).toEqual(notationLabel)
  })

  it('returns no model edge label background unless a background property is set', () => {
    expect(buildModelEdgeLabelBackground()).toBeUndefined()
    expect(buildModelEdgeLabelBackground({})).toBeUndefined()
  })

  it('matches notation edge label background when background properties exist', () => {
    const ds: DiagramStyle = {
      labelBgColor: '#fff',
      labelBgOpacity: 0.8,
      labelBgPadding: 5,
      labelBgBorderRadius: 3,
    }

    expect(buildModelEdgeLabelBackground(ds)).toEqual(buildNotationEdgeLabelBackground(ds))
  })

  it('resolves model edge options with shared marker semantics', () => {
    const ds: DiagramStyle = {
      edgeType: 'polyline',
      strokeColor: '#123',
      strokeWidth: 2,
      strokeOpacity: 0.5,
      opacity: 0.9,
      lineDash: [4, 2],
      startMarkerType: 'arrow',
      endMarkerType: 'diamond',
      endMarkerSize: 16,
      edgeLabelOffset: 18,
      edgeLabelPosition: 0.25,
      edgeLabelFollowPath: true,
      edgeLabelLineGap: false,
    }

    expect(resolveModelEdgeOptions(ds)).toEqual({
      type: 'polyline',
      style: {
        strokeColor: '#123',
        strokeWidth: 2,
        strokeOpacity: 0.5,
        opacity: 0.9,
        lineDash: [4, 2],
      },
      startMarker: buildMarker('arrow', ds, 'start'),
      endMarker: buildMarker('diamond', ds, 'end'),
      labelOffset: 18,
      labelPosition: 0.25,
      labelFollowPath: true,
      labelLineGap: false,
    })
  })

  it('ignores invalid model edge marker types', () => {
    const ds = {
      startMarkerType: 'invalid',
      endMarkerType: 'arrow',
    } as DiagramStyle

    expect(resolveModelEdgeOptions(ds).startMarker).toBeUndefined()
    expect(resolveModelEdgeOptions(ds).endMarker).toEqual(buildMarker('arrow', ds, 'end'))
  })

  it('keeps none markers for diagram-only / note links', () => {
    const ds = {
      startMarkerType: 'none',
      endMarkerType: 'none',
      lineDash: [4, 4],
    } as DiagramStyle

    expect(resolveModelEdgeOptions(ds)).toMatchObject({
      style: { lineDash: [4, 4] },
      startMarker: { type: 'none' },
      endMarker: { type: 'none' },
    })
  })

  it('merges relation style with instance edgeType override without dropping label fields', () => {
    const bound: DiagramStyle = {
      edgeType: 'bezier',
      strokeColor: '#333',
      labelColor: '#00f',
      labelFontSize: 14,
      labelBgColor: '#fff',
    }
    const instance: DiagramStyle = { edgeType: 'polyline' }
    expect(mergeEffectiveDiagramStyle(bound, instance)).toEqual({
      edgeType: 'polyline',
      strokeColor: '#333',
      labelColor: '#00f',
      labelFontSize: 14,
      labelBgColor: '#fff',
    })
    expect(mergeEffectiveDiagramStyle(bound, undefined)).toEqual(bound)
    expect(mergeEffectiveDiagramStyle(undefined, instance)).toEqual(instance)
  })

  it('prefers labelTemplate over instance attrs.label for display', () => {
    const label = buildModelEdgeDisplayLabel({
      instanceEdgeLabel: 'Custom diagram label',
      relationName: 'Serving',
      ds: { labelTemplate: '${name}' },
      relationProperties: [],
      linkTypeProperties: [],
      typeValues: {},
      relationValues: {},
    })

    expect(label).toEqual({ text: 'Serving', editableText: 'Serving' })
  })

  it('resolves template placeholders from link type and relation values', () => {
    const label = expectTextLabelOptions(
      buildModelEdgeDisplayLabel({
        instanceEdgeLabel: 'ignored',
        relationName: 'Link',
        ds: { labelTemplate: '#{code} · ${protocol}' },
        relationProperties: [prop({ id: '2', name: 'protocol' })],
        linkTypeProperties: [prop({ id: '1', name: 'code' })],
        typeValues: { code: 'HTTP' },
        relationValues: { protocol: '2.0' },
      })
    )

    expect(label.text).toBe('HTTP · 2.0')
    expect(label.editableText).toBe('Link')
  })

  it('falls back to instance edge label when no template is set', () => {
    expect(
      buildModelEdgeDisplayLabel({
        instanceEdgeLabel: '  My label  ',
        relationName: 'Serving',
        ds: undefined,
        relationProperties: [],
        linkTypeProperties: [],
        typeValues: {},
        relationValues: {},
      })
    ).toBe('My label')
  })

  it('does not fall back to relation name when attrs.label is empty', () => {
    expect(
      buildModelEdgeDisplayLabel({
        instanceEdgeLabel: undefined,
        relationName: 'Association',
        ds: undefined,
        relationProperties: [],
        linkTypeProperties: [],
        typeValues: {},
        relationValues: {},
      })
    ).toBeUndefined()
  })

  it('treats whitespace-only labelTemplate as unset', () => {
    expect(
      buildModelEdgeDisplayLabel({
        instanceEdgeLabel: undefined,
        relationName: 'Association',
        ds: { labelTemplate: '   ' },
        relationProperties: [],
        linkTypeProperties: [],
        typeValues: {},
        relationValues: {},
      })
    ).toBeUndefined()
  })

  it('returns undefined when template resolves to empty text', () => {
    expect(
      buildModelEdgeDisplayLabel({
        instanceEdgeLabel: 'ignored while template is set',
        relationName: 'Association',
        ds: { labelTemplate: '#{missing}' },
        relationProperties: [],
        linkTypeProperties: [],
        typeValues: {},
        relationValues: {},
      })
    ).toBeUndefined()
  })

  it('returns undefined when showLabel is false', () => {
    expect(
      buildModelEdgeDisplayLabel({
        instanceEdgeLabel: 'Visible',
        relationName: 'Serving',
        ds: { showLabel: false, labelTemplate: '${name}' },
        relationProperties: [],
        linkTypeProperties: [],
        typeValues: {},
        relationValues: {},
      })
    ).toBeUndefined()
  })
})

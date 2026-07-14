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
  buildModelEdgeLabelBackground,
  buildModelEdgeLabelConfig,
  buildModelNodeIcon,
  resolveModelEdgeOptions,
} from './diagramCanvasBuilders'

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
})

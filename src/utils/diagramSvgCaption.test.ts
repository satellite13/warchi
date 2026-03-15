import { describe, expect, it } from 'vitest'
import { appendDiagramCaption, type DiagramCaptionMeta } from '@/utils/diagramSvgCaption'

const baseMeta: DiagramCaptionMeta = {
  diagramName: 'Test Diagram',
  diagramVersion: '1.0.0',
  notationName: 'ArchiMate',
  notationVersion: '3.2',
}

const svgWithViewBox = '<svg viewBox="0 0 800 600"><rect/></svg>'
const svgWithWidthHeight = '<svg width="800" height="600"><rect/></svg>'

describe('appendDiagramCaption', () => {
  it('inserts caption before closing </svg> when viewBox present', () => {
    const result = appendDiagramCaption(svgWithViewBox, baseMeta)
    expect(result).toContain('<g id="diagram-caption">')
    expect(result).toContain('Test Diagram')
    expect(result).toContain('v1.0.0')
    expect(result).toContain('ArchiMate')
    expect(result).toContain('v3.2')
    expect(result).toContain('</svg>')
  })

  it('inserts caption when width/height present (no viewBox)', () => {
    const result = appendDiagramCaption(svgWithWidthHeight, baseMeta)
    expect(result).toContain('<g id="diagram-caption">')
  })

  it('returns original SVG when dimensions are zero', () => {
    const svg = '<svg width="0" height="0"><rect/></svg>'
    expect(appendDiagramCaption(svg, baseMeta)).toBe(svg)
  })

  it('returns original SVG when no dimensions found', () => {
    const svg = '<svg><rect/></svg>'
    expect(appendDiagramCaption(svg, baseMeta)).toBe(svg)
  })

  it('escapes special characters in text', () => {
    const meta: DiagramCaptionMeta = {
      diagramName: 'A&B<C>"D\'E',
      diagramVersion: '1.0',
      notationName: '',
      notationVersion: '',
    }
    const result = appendDiagramCaption(svgWithViewBox, meta)
    expect(result).toContain('&amp;')
    expect(result).toContain('&lt;')
    expect(result).toContain('&gt;')
    expect(result).toContain('&quot;')
    expect(result).toContain('&#39;')
  })

  it('omits version prefix when diagramVersion is empty', () => {
    const meta: DiagramCaptionMeta = {
      ...baseMeta,
      diagramVersion: '',
    }
    const result = appendDiagramCaption(svgWithViewBox, meta)
    expect(result).not.toContain('v ')
    expect(result).toContain('Test Diagram')
  })

  it('omits notation section when both notation fields are empty', () => {
    const meta: DiagramCaptionMeta = {
      ...baseMeta,
      notationName: '',
      notationVersion: '',
    }
    const result = appendDiagramCaption(svgWithViewBox, meta)
    expect(result).not.toContain(' · ')
  })

  it('returns original SVG when all meta fields produce empty line', () => {
    const meta: DiagramCaptionMeta = {
      diagramName: '',
      diagramVersion: '',
      notationName: '',
      notationVersion: '',
    }
    expect(appendDiagramCaption(svgWithViewBox, meta)).toBe(svgWithViewBox)
  })

  it('positions caption with text-anchor="end"', () => {
    const result = appendDiagramCaption(svgWithViewBox, baseMeta)
    expect(result).toContain('text-anchor="end"')
  })

  it('uses correct x/y from viewBox dimensions', () => {
    const result = appendDiagramCaption(svgWithViewBox, baseMeta)
    // w=800, h=600, padding=16 → x=784, y=584
    expect(result).toContain('x="784"')
    expect(result).toContain('y="584"')
  })
})

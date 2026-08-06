import { describe, expect, it } from 'vitest'
import type { Edge } from '@ngroznykh/papirus'
import { useEdgeStyleState } from './useEdgeStyleState'

describe('useEdgeStyleState', () => {
  it('round-trips labelTemplate in buildEdgeStyle', () => {
    const { edgeLabelTemplate, buildEdgeStyle } = useEdgeStyleState()
    edgeLabelTemplate.value = '${name} · #{code}'
    expect(buildEdgeStyle().labelTemplate).toBe('${name} · #{code}')
  })

  it('omits labelTemplate when empty', () => {
    const { edgeLabelTemplate, buildEdgeStyle } = useEdgeStyleState()
    edgeLabelTemplate.value = ''
    expect(buildEdgeStyle().labelTemplate).toBeUndefined()
  })

  it('omits whitespace-only labelTemplate', () => {
    const { edgeLabelTemplate, buildEdgeStyle } = useEdgeStyleState()
    edgeLabelTemplate.value = '   '
    expect(buildEdgeStyle().labelTemplate).toBeUndefined()
  })

  it('loadEdgeProps prefers editableText over unresolved display text', () => {
    const { edgeLabel, loadEdgeProps } = useEdgeStyleState()
    const edge = {
      label: { text: '${name', editableText: 'Association', style: {} },
      style: {},
      type: 'polyline',
      labelOffset: 0,
      labelPosition: 0.5,
      labelFollowPath: false,
      labelLineGap: false,
    } as unknown as Edge

    loadEdgeProps(edge, { labelTemplate: '${name}' })

    expect(edgeLabel.value).toBe('Association')
  })
})

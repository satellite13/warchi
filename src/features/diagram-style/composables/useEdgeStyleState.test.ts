import { describe, expect, it } from 'vitest'
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
})

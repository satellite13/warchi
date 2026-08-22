import { describe, expect, it } from 'vitest'
import { validateCommandQueue } from './diagramScriptCommands'

describe('validateCommandQueue', () => {
  it('rejects addEdge when endpoints are not on diagram and not added earlier', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a']),
      instanceIds: new Set(['ia']),
      edgeIds: new Set(),
      linkEndpoints: { l1: { sourceId: 'a', targetId: 'b' } },
      commands: [{ type: 'addEdge', linkId: 'l1' }],
    })
    expect(result.ok).toBe(false)
  })

  it('accepts addInstance then addEdge', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a']),
      instanceIds: new Set(['ia']),
      edgeIds: new Set(),
      linkEndpoints: { l1: { sourceId: 'a', targetId: 'b' } },
      commands: [
        { type: 'addInstance', nodeId: 'b', x: 0, y: 0 },
        { type: 'addEdge', linkId: 'l1' },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects setBounds for an unknown instance', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a']),
      instanceIds: new Set(['ia']),
      edgeIds: new Set(),
      linkEndpoints: {},
      commands: [{ type: 'setBounds', instanceId: 'missing', x: 1, y: 2 }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects align when an instance is missing', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a']),
      instanceIds: new Set(['ia']),
      edgeIds: new Set(),
      linkEndpoints: {},
      commands: [{ type: 'align', instanceIds: ['ia', 'ib'], mode: 'left' }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects setEdgeStyle without a valid hex color', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a', 'b']),
      instanceIds: new Set(['ia', 'ib']),
      edgeIds: new Set(['e1']),
      canvasLinkIds: new Set(['l1']),
      linkEndpoints: {},
      commands: [{ type: 'setEdgeStyle', linkId: 'l1', strokeColor: 'red' }],
    })
    expect(result.ok).toBe(false)
  })

  it('accepts setEdgeStyle by canvas link id', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a', 'b']),
      instanceIds: new Set(['ia', 'ib']),
      edgeIds: new Set(['e1']),
      canvasLinkIds: new Set(['l1']),
      linkEndpoints: {},
      commands: [{ type: 'setEdgeStyle', linkId: 'l1', strokeColor: '#dc3545' }],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects addEdge when link endpoints are unknown to the host', () => {
    const result = validateCommandQueue({
      instanceModelNodeIds: new Set(['a', 'b']),
      instanceIds: new Set(['ia', 'ib']),
      edgeIds: new Set(),
      linkEndpoints: {},
      commands: [{ type: 'addEdge', linkId: 'missing' }],
    })
    expect(result.ok).toBe(false)
  })
})

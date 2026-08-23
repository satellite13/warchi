import { describe, expect, it } from 'vitest'
import { expandLayoutCommands } from './layoutCommands'

const a = { id: 'a', x: 0, y: 0, width: 10, height: 10 }
const b = { id: 'b', x: 50, y: 20, width: 10, height: 10 }
const c = { id: 'c', x: 80, y: 5, width: 10, height: 10 }

describe('expandLayoutCommands', () => {
  it('aligns left to the minimum x', () => {
    const commands = expandLayoutCommands({
      boundsById: { a, b },
      commands: [{ type: 'align', instanceIds: ['a', 'b'], mode: 'left' }],
    })
    expect(commands).toEqual([
      { type: 'setBounds', instanceId: 'a', x: 0, y: 0, width: 10, height: 10 },
      { type: 'setBounds', instanceId: 'b', x: 0, y: 20, width: 10, height: 10 },
    ])
  })

  it('distributes horizontally like papirus', () => {
    const commands = expandLayoutCommands({
      boundsById: { a, b, c },
      commands: [{ type: 'distribute', instanceIds: ['a', 'b', 'c'], axis: 'horizontal' }],
    })
    expect(commands).toEqual([
      { type: 'setBounds', instanceId: 'a', x: 0, y: 0, width: 10, height: 10 },
      { type: 'setBounds', instanceId: 'b', x: 40, y: 20, width: 10, height: 10 },
      { type: 'setBounds', instanceId: 'c', x: 80, y: 5, width: 10, height: 10 },
    ])
  })

  it('stacks vertically with an 8px gap and min X', () => {
    const commands = expandLayoutCommands({
      boundsById: { a, b },
      commands: [{ type: 'stack', instanceIds: ['a', 'b'], mode: 'vertical' }],
    })
    expect(commands).toEqual([
      { type: 'setBounds', instanceId: 'a', x: 0, y: 0, width: 10, height: 10 },
      { type: 'setBounds', instanceId: 'b', x: 0, y: 18, width: 10, height: 10 },
    ])
  })

  it('stacks overlap onto the same origin', () => {
    const commands = expandLayoutCommands({
      boundsById: { a, b },
      commands: [{ type: 'stack', instanceIds: ['a', 'b'], mode: 'overlap' }],
    })
    expect(commands).toEqual([
      { type: 'setBounds', instanceId: 'a', x: 0, y: 0, width: 10, height: 10 },
      { type: 'setBounds', instanceId: 'b', x: 0, y: 0, width: 10, height: 10 },
    ])
  })
})

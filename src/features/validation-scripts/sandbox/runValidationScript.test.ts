import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { runValidationScript, toIframePayload } from './runValidationScript'
import type { ValidationSnapshot } from './types'

function snapshot(): ValidationSnapshot {
  return {
    model: {
      id: 'm1',
      name: 'M',
      version: '1.0.0',
      nodes: [{ id: 'n1', name: 'A', parentId: null, nodeTypeId: 'nt', attrs: null }],
      links: [],
      folders: [],
      diagrams: [
        {
          id: 'd1',
          name: 'D',
          version: '1.0.0',
          notationId: 'not1',
          nodeIds: ['n1'],
          linkIds: [],
          instances: [{ id: 'ia', modelNodeId: 'n1', x: 0, y: 0 }],
          edges: [],
        },
      ],
    },
    notations: [],
    types: { nodeTypes: [], linkTypes: [] },
  }
}

describe('runValidationScript', () => {
  it('returns issues and an empty command queue for a report-only script', async () => {
    const result = await runValidationScript({
      source: `report.info('x')`,
      snapshot: snapshot(),
      openDiagramId: 'd1',
      inProcess: true,
    })
    expect(result.issues).toEqual([{ level: 'info', message: 'x' }])
    expect(result.commands).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it('returns queued apply commands from an in-process query', async () => {
    const result = await runValidationScript({
      source: `
const n = await neighbors(ctx.diagram.instances[0].modelNodeId, { direction: 'outgoing' })
apply.addInstance({ nodeId: n.items[0].node.id, x: 10, y: 10 })
`,
      snapshot: snapshot(),
      openDiagramId: 'd1',
      inProcess: true,
      query: async () => ({ items: [{ node: { id: 'n2' }, link: { id: 'l1' } }], last: true }),
    })
    expect(result.error).toBeUndefined()
    expect(result.commands).toEqual([{ type: 'addInstance', nodeId: 'n2', x: 10, y: 10 }])
  })

  it('strips Vue reactivity so the iframe payload can be structured-cloned', () => {
    const snap = reactive(snapshot())
    expect(() => structuredClone(snap)).toThrow()
    expect(() => structuredClone(toIframePayload({ type: 'run', snapshot: snap }))).not.toThrow()
  })

  it('does not time out when the snapshot is a Vue reactive proxy', async () => {
    const posted: unknown[] = []
    const contentWindow = {
      postMessage(data: unknown) {
        structuredClone(data)
        posted.push(data)
      },
    }
    const iframe = {
      setAttribute: vi.fn(),
      style: {} as CSSStyleDeclaration,
      contentWindow,
      remove: vi.fn(),
      onerror: null,
      set src(_value: string) {
        queueMicrotask(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: 'ready' },
              source: contentWindow as unknown as MessageEventSource,
            })
          )
        })
      },
    }
    const createElement = vi.spyOn(document, 'createElement').mockImplementation(((
      tag: string
    ) => {
      if (tag === 'iframe') return iframe as unknown as HTMLIFrameElement
      return document.createElement(tag)
    }) as typeof document.createElement)
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

    try {
      const run = runValidationScript({
        source: `report.info('x')`,
        snapshot: reactive(snapshot()),
        openDiagramId: 'd1',
        timeoutMs: 300,
      })
      await vi.waitFor(() => expect(posted.length).toBeGreaterThan(0))
      const runMessage = posted[0] as { requestId: string }
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'done', requestId: runMessage.requestId, issues: [] },
          source: contentWindow as unknown as MessageEventSource,
        })
      )
      const result = await run
      expect(result.timedOut).not.toBe(true)
      expect(result.error).toBeUndefined()
    } finally {
      createElement.mockRestore()
      appendChild.mockRestore()
    }
  })
})

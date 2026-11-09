import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { DiagramAttrs } from '../../modelAttrs'
import { useDiagramHistoryPersist } from '../../composables/useDiagramHistoryPersist'
import {
  applyEdgeTypeFromContextMenu,
  commitEdgeTypeChange,
} from './setEdgeTypeFromContextMenu'

function makeAttrs(edgeType?: string, controlPoints?: number[][]): DiagramAttrs {
  return {
    instances: {
      nodes: [],
      edges: [
        {
          id: 'e1',
          modelLinkId: 'link-1',
          sourceInstanceId: 'n1',
          targetInstanceId: 'n2',
          attrs: {
            ...(edgeType || controlPoints
              ? {
                  diagramStyle: edgeType ? { edgeType } : {},
                  ...(controlPoints ? { controlPoints } : {}),
                }
              : {}),
          },
        },
      ],
    },
  } as DiagramAttrs
}

describe('applyEdgeTypeFromContextMenu', () => {
  it('returns false when edge is missing', () => {
    const attrs = makeAttrs('bezier')
    expect(applyEdgeTypeFromContextMenu(attrs, 'missing', 'straight', () => undefined)).toBe(false)
  })

  it('returns false when type is unchanged', () => {
    const attrs = makeAttrs('straight')
    expect(applyEdgeTypeFromContextMenu(attrs, 'e1', 'straight', () => undefined)).toBe(false)
  })

  it('writes full effective style and new edgeType', () => {
    const attrs = makeAttrs('bezier')
    const changed = applyEdgeTypeFromContextMenu(attrs, 'e1', 'polyline', () => ({
      strokeColor: '#333',
      edgeType: 'bezier',
    }))
    expect(changed).toBe(true)
    expect(attrs.instances.edges[0]?.attrs?.diagramStyle).toEqual({
      strokeColor: '#333',
      edgeType: 'polyline',
    })
  })

  it('clears controlPoints when leaving polyline', () => {
    const attrs = makeAttrs('polyline', [
      [0, 0],
      [1, 1],
    ])
    const changed = applyEdgeTypeFromContextMenu(attrs, 'e1', 'bezier', () => undefined)
    expect(changed).toBe(true)
    expect(attrs.instances.edges[0]?.attrs?.controlPoints).toBeUndefined()
    expect(attrs.instances.edges[0]?.attrs?.diagramStyle).toMatchObject({ edgeType: 'bezier' })
  })

  it('keeps the routed polyline bends when switching to an editable polyline', () => {
    const attrs = makeAttrs('polyline')
    const changed = applyEdgeTypeFromContextMenu(
      attrs,
      'e1',
      'editable-polyline',
      () => undefined,
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 20 },
        { x: 100, y: 20 },
      ]
    )
    expect(changed).toBe(true)
    expect(attrs.instances.edges[0]?.attrs?.diagramStyle).toMatchObject({
      edgeType: 'editable-polyline',
    })
    expect(attrs.instances.edges[0]?.attrs?.controlPoints).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 20 },
    ])
  })

  it('does not invent bends when the rendered polyline has only endpoints', () => {
    const attrs = makeAttrs('polyline')
    applyEdgeTypeFromContextMenu(attrs, 'e1', 'editable-polyline', () => undefined, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
    expect(attrs.instances.edges[0]?.attrs?.controlPoints).toBeUndefined()
  })
})

describe('commitEdgeTypeChange', () => {
  it('keeps the new edge type when history change would persist the pre-flush snapshot', () => {
    const before = makeAttrs('polyline')
    const after = structuredClone(before)
    applyEdgeTypeFromContextMenu(after, 'e1', 'straight', () => undefined)

    let state = structuredClone(before)
    const props = structuredClone(before)
    const persistHistoryLayoutFromRenderer = vi.fn(() => {
      state = structuredClone(props)
    })
    let onChange: (() => void) | undefined
    const history = {
      canUndo: true,
      canRedo: false,
      undoCount: 1,
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'change') onChange = handler
      }),
      execute(command: { execute: () => void }) {
        command.execute()
        onChange?.()
      },
    }
    const persist = useDiagramHistoryPersist({
      canUndo: ref(false),
      canRedo: ref(false),
      isReadOnly: () => false,
      isDiagramDirty: () => false,
      persistHistoryLayoutFromRenderer,
      detectLabelChanges: vi.fn(),
      detectEdgeLabelChanges: vi.fn(),
      syncEdgeAnchors: vi.fn(),
    })
    persist.bindHistoryEvents(history)

    commitEdgeTypeChange({
      history,
      runWithoutCanvasPersist: action => persist.runWithoutCanvasPersist(action),
      apply: attrs => {
        state = structuredClone(attrs)
      },
      before,
      after,
    })

    expect(state.instances.edges[0]?.attrs?.diagramStyle).toMatchObject({ edgeType: 'straight' })
    expect(persistHistoryLayoutFromRenderer).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  emitModelSelectionFromPapIds,
  findTopEdgeAtPoint,
  resolvePapIdsFromSelectionProps,
  selectionIdsDiffer,
  selectionNeedsRepair,
  useDiagramSelectionBridge,
} from './useDiagramSelectionBridge'

describe('resolvePapIdsFromSelectionProps', () => {
  const nodes = new Map([
    ['pap-n1', { modelNodeId: 'm1', instanceId: 'i1' }],
    ['pap-n2', { modelNodeId: 'm2', instanceId: 'i2' }],
  ])
  const edges = new Map([
    ['edge-e1', { modelLinkId: 'l1', edgeId: 'e1' }],
    ['pap-edge-2', { modelLinkId: 'l2', edgeId: 'e2' }],
  ])

  it('prefers instance ids over model node ids', () => {
    expect(
      resolvePapIdsFromSelectionProps(
        {
          selectedModelNodeIds: ['m1', 'm2'],
          selectedInstanceIds: ['i2'],
          selectedModelLinkId: null,
        },
        nodes,
        edges
      )
    ).toEqual(['pap-n2'])
  })

  it('resolves edge instance id via edge- prefix', () => {
    expect(
      resolvePapIdsFromSelectionProps(
        {
          selectedModelNodeIds: [],
          selectedModelLinkId: null,
          selectedEdgeInstanceId: 'e1',
        },
        nodes,
        edges
      )
    ).toEqual(['edge-e1'])
  })

  it('resolves model link id', () => {
    expect(
      resolvePapIdsFromSelectionProps(
        {
          selectedModelNodeIds: [],
          selectedModelLinkId: 'l2',
        },
        nodes,
        edges
      )
    ).toEqual(['pap-edge-2'])
  })
})

describe('selectionIdsDiffer / selectionNeedsRepair', () => {
  it('detects id set differences', () => {
    expect(selectionIdsDiffer(['a', 'b'], new Set(['a', 'b']))).toBe(false)
    expect(selectionIdsDiffer(['a'], new Set(['a', 'b']))).toBe(true)
  })

  it('detects selected state repair needs', () => {
    expect(
      selectionNeedsRepair(['a'], id => (id === 'a' ? { state: 'normal' } : null))
    ).toBe(true)
    expect(
      selectionNeedsRepair(['a'], id => (id === 'a' ? { state: 'selected' } : null))
    ).toBe(false)
  })
})

describe('emitModelSelectionFromPapIds', () => {
  it('clears all emits when empty', () => {
    const emit = {
      selectNodes: vi.fn(),
      selectInstanceIds: vi.fn(),
      selectLink: vi.fn(),
      selectEdgeInstanceId: vi.fn(),
      selectCanvasElementId: vi.fn(),
    }
    emitModelSelectionFromPapIds([], new Map(), new Map(), emit)
    expect(emit.selectNodes).toHaveBeenCalledWith([])
    expect(emit.selectLink).toHaveBeenCalledWith(null)
    expect(emit.selectCanvasElementId).toHaveBeenCalledWith(null)
  })

  it('emits nodes when pap ids map to nodes', () => {
    const emit = {
      selectNodes: vi.fn(),
      selectInstanceIds: vi.fn(),
      selectLink: vi.fn(),
      selectEdgeInstanceId: vi.fn(),
      selectCanvasElementId: vi.fn(),
    }
    emitModelSelectionFromPapIds(
      ['pap-n1'],
      new Map([['pap-n1', { modelNodeId: 'm1', instanceId: 'i1' }]]),
      new Map(),
      emit
    )
    expect(emit.selectCanvasElementId).toHaveBeenCalledWith('pap-n1')
    expect(emit.selectNodes).toHaveBeenCalledWith(['m1'])
    expect(emit.selectInstanceIds).toHaveBeenCalledWith(['i1'])
  })
})

describe('findTopEdgeAtPoint', () => {
  it('returns topmost visible edge that hits', () => {
    const edges = [
      {
        id: 'bottom',
        visible: true,
        style: { strokeWidth: 2 },
        hitTestWithTolerance: vi.fn(() => true),
      },
      {
        id: 'top',
        visible: true,
        style: { strokeWidth: 2 },
        hitTestWithTolerance: vi.fn(() => true),
      },
    ]
    expect(findTopEdgeAtPoint(edges, { x: 0, y: 0 }, 1, 8)?.id).toBe('top')
  })
})

describe('useDiagramSelectionBridge', () => {
  it('suppresses selection events while syncing from props', () => {
    const suppress = { value: false }
    const selectedIds = new Set<string>()
    const selectMultiple = vi.fn((ids: string[]) => {
      expect(suppress.value).toBe(true)
      selectedIds.clear()
      ids.forEach(id => selectedIds.add(id))
    })
    const bridge = useDiagramSelectionBridge({
      suppressSelectionEvent: suppress,
      getSelection: () => ({
        selectedIds,
        selectMultiple,
        clearSelection: vi.fn(),
        select: vi.fn(),
      }),
      getElement: () => ({ state: 'normal' }),
      nodeIdToInstance: new Map([['pap-n1', { modelNodeId: 'm1', instanceId: 'i1' }]]),
      edgeIdToInstance: new Map(),
    })
    bridge.syncSelectionFromProps({
      selectedModelNodeIds: ['m1'],
      selectedModelLinkId: null,
    })
    expect(selectMultiple).toHaveBeenCalledWith(['pap-n1'])
    expect(suppress.value).toBe(false)
  })
})

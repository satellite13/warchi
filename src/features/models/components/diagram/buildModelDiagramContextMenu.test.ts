import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuTarget } from '@ngroznykh/papirus'
import { buildModelDiagramContextMenu } from './buildModelDiagramContextMenu'

describe('buildModelDiagramContextMenu', () => {
  it('builds note node menu actions', () => {
    const onEditNote = vi.fn()
    const onDeleteNodeFromDiagram = vi.fn()
    const menu = buildModelDiagramContextMenu({
      findNodeEntity: () => ({ modelNodeId: 'n1', instanceId: 'i1' }),
      findEdgeEntity: () => undefined,
      findNodeInstance: () =>
        ({
          id: 'i1',
          modelNodeId: 'n1',
          x: 0,
          y: 0,
          attrs: { isNote: true },
        }) as never,
      findEdgeInstance: () => undefined,
      getEffectiveEdgeStyle: () => undefined,
      isNoteInstance: () => true,
      isContainerInstance: () => false,
      isEdgeAnchorInstance: () => false,
      setEdgeType: vi.fn(),
      onEditNote,
      onDeleteNodeFromDiagram,
      onFindInTree: vi.fn(),
      onDeleteLink: vi.fn(),
      t: key => key,
    })

    const items = menu.node({
      type: 'node',
      node: { id: 'pap-1' },
    } as ContextMenuTarget)

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ label: 'diagram.editNote' })
    ;(items[0] as { action: () => void }).action()
    expect(onEditNote).toHaveBeenCalledWith('i1')
  })

  it('builds edge link-type submenu', () => {
    const setEdgeType = vi.fn()
    const onDeleteLink = vi.fn()
    const menu = buildModelDiagramContextMenu({
      findNodeEntity: () => undefined,
      findEdgeEntity: () => ({ modelLinkId: 'l1', edgeId: 'e1' }),
      findNodeInstance: () => undefined,
      findEdgeInstance: () =>
        ({
          id: 'e1',
          modelLinkId: 'l1',
          attrs: {},
        }) as never,
      getEffectiveEdgeStyle: () => ({ edgeType: 'bezier' }) as never,
      isNoteInstance: () => false,
      isContainerInstance: () => false,
      isEdgeAnchorInstance: () => false,
      setEdgeType,
      onEditNote: vi.fn(),
      onDeleteNodeFromDiagram: vi.fn(),
      onFindInTree: vi.fn(),
      onDeleteLink,
      t: key => key,
    })

    const items = menu.edge({
      type: 'edge',
      edge: { id: 'pap-e1' },
    } as ContextMenuTarget)

    const linkType = items.find(
      item => 'label' in item && item.label === 'diagram.linkType'
    ) as { items?: Array<{ label: string; action: () => void }> }
    expect(linkType?.items?.length).toBe(4)
    linkType.items![0]!.action()
    expect(setEdgeType).toHaveBeenCalledWith('e1', 'straight')

    const del = items[items.length - 1] as { action: () => void }
    del.action()
    expect(onDeleteLink).toHaveBeenCalledWith('l1', 'e1')
  })
})

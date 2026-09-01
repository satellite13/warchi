import type { ContextMenuItem, ContextMenuTarget, EdgePathType } from '@ngroznykh/papirus'
import type { DiagramStyle } from '@/domain/attrs/notationAttrs'
import type { DiagramEdgeInstance, DiagramNodeInstance } from '../../modelAttrs'

type Translate = (key: string) => string

export type DiagramContextMenuLookups = {
  findNodeEntity: (
    papNodeId: string
  ) => { modelNodeId: string; instanceId: string } | undefined
  findEdgeEntity: (papEdgeId: string) => { modelLinkId: string; edgeId: string } | undefined
  findNodeInstance: (instanceId: string) => DiagramNodeInstance | undefined
  findEdgeInstance: (edgeId: string) => DiagramEdgeInstance | undefined
  getEffectiveEdgeStyle: (edgeInst: DiagramEdgeInstance) => DiagramStyle | undefined
  isNoteInstance: (instance: DiagramNodeInstance) => boolean
  isContainerInstance: (instance: DiagramNodeInstance) => boolean
  isEdgeAnchorInstance: (instance: DiagramNodeInstance) => boolean
  setEdgeType: (edgeInstanceId: string, edgeType: EdgePathType) => void
  onEditNote: (instanceId: string) => void
  onDeleteNodeFromDiagram: (instanceId: string) => void
  onFindInTree: (modelNodeId: string) => void
  onDeleteLink: (modelLinkId: string, edgeId: string) => void
  t: Translate
}

export function buildModelDiagramContextMenu(lookups: DiagramContextMenuLookups): {
  node: (target: ContextMenuTarget) => ContextMenuItem[]
  edge: (target: ContextMenuTarget) => ContextMenuItem[]
} {
  return {
    node: (target: ContextMenuTarget) => {
      if (target.type !== 'node') return []
      const entity = lookups.findNodeEntity(target.node.id)
      if (!entity) return []
      const instance = lookups.findNodeInstance(entity.instanceId)
      if (instance && lookups.isNoteInstance(instance)) {
        return [
          {
            label: lookups.t('diagram.editNote'),
            icon: 'edit_note',
            action: () => lookups.onEditNote(entity.instanceId),
          },
          {
            label: lookups.t('diagram.deleteNote'),
            icon: 'delete',
            action: () => lookups.onDeleteNodeFromDiagram(entity.instanceId),
          },
        ]
      }
      if (instance && lookups.isContainerInstance(instance)) {
        return [
          {
            label: lookups.t('diagram.deleteContainer'),
            icon: 'delete',
            action: () => lookups.onDeleteNodeFromDiagram(entity.instanceId),
          },
        ]
      }
      if (instance && lookups.isEdgeAnchorInstance(instance)) {
        return []
      }
      return [
        {
          label: lookups.t('diagram.findInTree'),
          icon: 'account_tree',
          action: () => lookups.onFindInTree(entity.modelNodeId),
        },
        {
          label: lookups.t('diagram.removeFromDiagram'),
          icon: 'delete',
          action: () => lookups.onDeleteNodeFromDiagram(entity.instanceId),
        },
      ]
    },
    edge: (target: ContextMenuTarget) => {
      if (target.type !== 'edge') return []
      const entity = lookups.findEdgeEntity(target.edge.id)
      if (!entity) return []

      const edgeInst = lookups.findEdgeInstance(entity.edgeId)
      const isDiagramOnly = edgeInst?.attrs?.isDiagramOnly === true
      const effStyle = edgeInst ? lookups.getEffectiveEdgeStyle(edgeInst) : undefined
      const currentType = (effStyle?.edgeType as EdgePathType | undefined) ?? 'bezier'

      const items: ContextMenuItem[] = []

      if (isDiagramOnly) {
        items.push(
          { label: lookups.t('diagram.noteLink'), icon: 'note', action: () => {} },
          { separator: true }
        )
      }

      items.push(
        {
          label: lookups.t('diagram.linkType'),
          icon: 'conversion_path',
          items: [
            {
              label: lookups.t('diagram.linkTypeStraight'),
              icon: 'remove',
              enabled: currentType !== 'straight',
              action: () => lookups.setEdgeType(entity.edgeId, 'straight'),
            },
            {
              label: lookups.t('diagram.linkTypePolyline'),
              icon: 'timeline',
              enabled: currentType !== 'polyline',
              action: () => lookups.setEdgeType(entity.edgeId, 'polyline'),
            },
            {
              label: lookups.t('diagram.linkTypeEditablePolyline'),
              icon: 'polyline',
              enabled: currentType !== 'editable-polyline',
              action: () => lookups.setEdgeType(entity.edgeId, 'editable-polyline'),
            },
            {
              label: lookups.t('diagram.linkTypeBezier'),
              icon: 'line_curve',
              enabled: currentType !== 'bezier',
              action: () => lookups.setEdgeType(entity.edgeId, 'bezier'),
            },
          ],
        },
        { separator: true },
        {
          label: isDiagramOnly ? lookups.t('diagram.deleteNoteLink') : lookups.t('common.delete'),
          icon: 'delete',
          action: () => lookups.onDeleteLink(entity.modelLinkId, entity.edgeId),
        }
      )

      return items
    },
  }
}

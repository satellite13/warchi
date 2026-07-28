import { clonePlainDeep } from '@/utils/clonePlainDeep'
import type { DiagramAttrs, DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'
import type { EditorLink, EditorNode, ModelEditorState } from '../types'
import {
  DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX,
  isContainerInstance,
  isEdgeAnchorInstance,
} from './diagramOnlyInstances'

function isStickyNoteInstance(inst: DiagramNodeInstance): boolean {
  return inst.attrs?.isNote === true && inst.attrs?.isDirectoryNote !== true
}

function isDiagramOnlyNodeInstance(inst: DiagramNodeInstance): boolean {
  return isStickyNoteInstance(inst) || isContainerInstance(inst) || isEdgeAnchorInstance(inst)
}

function activeModelNode(nodes: EditorNode[], modelNodeId: string): EditorNode | undefined {
  const live = nodes.find(n => n.id === modelNodeId && !n._isDeleted)
  if (live) return live
  return nodes.find(n => n.id === modelNodeId)
}

/**
 * Экземпляр ноды на холсте: убираем только если модельная нода явно удалена в state.
 * Если ноды нет в state (progressive load / неполная выборка) — оставляем, как для рёбер
 * без link в state: иначе save вычищает почти все элементы с диаграмм.
 * Diagram-only (sticky note / container / edge anchor) не привязаны к модельной ноде.
 */
function keepInstanceNode(nodes: EditorNode[], inst: DiagramNodeInstance): boolean {
  if (!inst.id || !inst.modelNodeId) return false
  if (isDiagramOnlyNodeInstance(inst)) return true
  const n = activeModelNode(nodes, inst.modelNodeId)
  if (!n) return true
  return !n._isDeleted
}

function keepModelEdge(edge: DiagramEdgeInstance, linkById: Map<string, EditorLink>): boolean {
  if (edge.attrs?.isDiagramOnly === true) return true
  if (edge.modelLinkId.startsWith(DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX)) return true
  const l = linkById.get(edge.modelLinkId)
  // Если связи нет в текущем state (например, её удалили параллельно), не вычищаем ребро
  // до этапа merge-конфликта: пользователь должен увидеть отличие «локально есть / на сервере нет».
  if (!l) return true
  if (l._isDeleted) return false
  return true
}

export type SanitizeDiagramInstancesResult = {
  nextAttrs: DiagramAttrs
  removedNodes: number
  removedEdges: number
  changed: boolean
}

/**
 * Убирает из attrs диаграммы заведомый мусор относительно текущих нод и связей модели:
 * экземпляры с явно удалённой нодой, рёбра с битым source/target, рёбра с удалённой связью.
 * Отсутствие ноды/связи в state само по себе не повод удалять экземпляр (данные ещё могут грузиться).
 */
export function sanitizeDiagramInstancesForModel(
  attrs: DiagramAttrs,
  nodes: EditorNode[],
  links: EditorLink[]
): SanitizeDiagramInstancesResult {
  const inst = attrs.instances
  const rawNodes = inst?.nodes ?? []
  const rawEdges = inst?.edges ?? []
  const linkById = new Map(links.map(l => [l.id, l]))

  const keptNodes = rawNodes.filter(n => keepInstanceNode(nodes, n))
  const nodeIdSet = new Set(keptNodes.map(n => n.id))

  const keptEdges = rawEdges.filter(e => {
    if (!nodeIdSet.has(e.sourceInstanceId) || !nodeIdSet.has(e.targetInstanceId)) return false
    return keepModelEdge(e, linkById)
  })

  const removedNodes = rawNodes.length - keptNodes.length
  const removedEdges = rawEdges.length - keptEdges.length
  if (removedNodes === 0 && removedEdges === 0) {
    return { nextAttrs: attrs, removedNodes: 0, removedEdges: 0, changed: false }
  }

  return {
    nextAttrs: {
      ...attrs,
      instances: {
        nodes: clonePlainDeep(keptNodes),
        edges: clonePlainDeep(keptEdges),
      },
    },
    removedNodes,
    removedEdges,
    changed: true,
  }
}

/**
 * Перед сохранением: чистит все диаграммы в state. При изменениях помечает диаграмму `_isDirty`,
 * чтобы batch save (primary) отправил исправленный JSON на сервер.
 */
export function applyDiagramGarbageSanitizeToState(state: ModelEditorState): void {
  for (const d of state.diagrams) {
    if (d._isDeleted) continue
    const { nextAttrs, changed } = sanitizeDiagramInstancesForModel(
      d.parsedAttrs,
      state.nodes,
      state.links
    )
    if (changed) {
      d.parsedAttrs = nextAttrs
      if (!d._isNew) d._isDirty = true
    }
  }
}

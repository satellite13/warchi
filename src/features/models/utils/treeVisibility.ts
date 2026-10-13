import { parseTypeAttrs } from '@/domain/attrs/notationAttrs'

/** Типы узлов, чьи элементы скрыты в дереве модели для ролей ниже админа (attrs.hideInTree). */
export const hiddenNodeTypeIds = (
  nodeTypes: ReadonlyArray<{ id: string; attrs?: string | null }>
): Set<string> =>
  new Set(
    nodeTypes
      .filter(nodeType => parseTypeAttrs(nodeType.attrs ?? null).hideInTree === true)
      .map(nodeType => nodeType.id)
  )

/**
 * Узел скрыт в дереве для не-админов:
 * - явный маркер узла system.hideInTree = true, либо
 * - тип узла скрытый (attrs.hideInTree) и у узла нет явного override (system.hideInTree = false).
 */
export const isNodeHiddenInTree = (
  node: { nodeTypeId: string; parsedAttrs: { system?: Record<string, unknown> } },
  hiddenTypeIds: ReadonlySet<string>
): boolean => {
  const marker = node.parsedAttrs.system?.hideInTree
  if (marker === true) return true
  if (marker === false) return false
  return hiddenTypeIds.has(node.nodeTypeId)
}

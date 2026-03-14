import type { DiagramResponse, LinkResponse, NodeResponse } from "@/types/api"
import { compareVersions } from "@/utils/version"

/** Путь узла от корня дерева (например "Root/Module A/Component 1") */
export function buildNodePathMap(nodes: NodeResponse[]): Map<string, string> {
  const byId = new Map<string, NodeResponse>()
  for (const n of nodes) byId.set(n.id, n)

  const pathById = new Map<string, string>()

  function getPath(node: NodeResponse): string {
    const cached = pathById.get(node.id)
    if (cached !== undefined) return cached
    const parent =
      node.parentNodeId != null ? byId.get(node.parentNodeId) : undefined
    const parentPath = parent ? getPath(parent) : ""
    const path = parentPath ? `${parentPath}/${node.name}` : node.name
    pathById.set(node.id, path)
    return path
  }

  for (const n of nodes) getPath(n)
  return pathById
}

/** Ключ связи для сопоставления между версиями */
export function linkKey(
  sourcePath: string,
  targetPath: string,
  linkTypeId: string
): string {
  return `${sourcePath}\t${targetPath}\t${linkTypeId}`
}

export type NodeDiffItem =
  | { kind: "added"; path: string; node: NodeResponse }
  | { kind: "removed"; path: string; node: NodeResponse }
  | { kind: "modified"; path: string; base: NodeResponse; target: NodeResponse }

export type LinkDiffItem =
  | { kind: "added"; sourcePath: string; targetPath: string; link: LinkResponse }
  | { kind: "removed"; sourcePath: string; targetPath: string; link: LinkResponse }
  | {
      kind: "modified"
      sourcePath: string
      targetPath: string
      base: LinkResponse
      target: LinkResponse
    }

export type DiagramDiffItem =
  | { kind: "added"; name: string; diagram: DiagramResponse }
  | { kind: "removed"; name: string; diagram: DiagramResponse }
  | { kind: "modified"; name: string; base: DiagramResponse; target: DiagramResponse }

function nodeEquals(a: NodeResponse, b: NodeResponse): boolean {
  return (
    a.name === b.name &&
    (a.attrs ?? "") === (b.attrs ?? "") &&
    a.nodeTypeId === b.nodeTypeId
  )
}

function linkEquals(a: LinkResponse, b: LinkResponse): boolean {
  return (
    (a.attrs ?? "") === (b.attrs ?? "") &&
    a.linkTypeId === b.linkTypeId
  )
}

function diagramEquals(a: DiagramResponse, b: DiagramResponse): boolean {
  return (
    a.version === b.version &&
    (a.attrs ?? "") === (b.attrs ?? "") &&
    a.notationId === b.notationId
  )
}

/**
 * Сравнивает узлы двух версий модели.
 * Сопоставление: 1) по stableId (сквозной id, сохраняется при копировании), 2) по path при отсутствии stableId.
 */
export function compareNodes(
  baseNodes: NodeResponse[],
  targetNodes: NodeResponse[]
): NodeDiffItem[] {
  const basePathMap = buildNodePathMap(baseNodes)
  const targetPathMap = buildNodePathMap(targetNodes)
  const baseByPath = new Map<string, NodeResponse>()
  for (const n of baseNodes) baseByPath.set(basePathMap.get(n.id)!, n)
  const targetByPath = new Map<string, NodeResponse>()
  for (const n of targetNodes) targetByPath.set(targetPathMap.get(n.id)!, n)
  const baseByStableId = new Map<string, NodeResponse>()
  for (const n of baseNodes) if (n.stableId) baseByStableId.set(n.stableId, n)
  const targetByStableId = new Map<string, NodeResponse>()
  for (const n of targetNodes) if (n.stableId) targetByStableId.set(n.stableId, n)

  const result: NodeDiffItem[] = []
  const matchedTargetIds = new Set<string>()

  for (const node of baseNodes) {
    const path = basePathMap.get(node.id)!
    const targetByStable = node.stableId ? targetByStableId.get(node.stableId) : undefined
    if (targetByStable) {
      matchedTargetIds.add(targetByStable.id)
      if (!nodeEquals(node, targetByStable)) {
        result.push({ kind: "modified", path, base: node, target: targetByStable })
      }
      continue
    }
    const targetByPathNode = targetByPath.get(path)
    if (targetByPathNode) {
      matchedTargetIds.add(targetByPathNode.id)
      if (!nodeEquals(node, targetByPathNode)) {
        result.push({ kind: "modified", path, base: node, target: targetByPathNode })
      }
      continue
    }
    result.push({ kind: "removed", path, node })
  }
  for (const node of targetNodes) {
    if (matchedTargetIds.has(node.id)) continue
    const path = targetPathMap.get(node.id)!
    if (baseByPath.has(path)) continue
    result.push({ kind: "added", path, node })
  }

  return result
}

/**
 * Сравнивает связи двух версий. Сопоставление: 1) по stableId, 2) по (sourcePath, targetPath, linkTypeId).
 */
export function compareLinks(
  baseLinks: LinkResponse[],
  targetLinks: LinkResponse[],
  basePathMap: Map<string, string>,
  targetPathMap: Map<string, string>
): LinkDiffItem[] {
  const baseByKey = new Map<string, LinkResponse>()
  for (const l of baseLinks) {
    const sp = basePathMap.get(l.sourceId)
    const tp = basePathMap.get(l.targetId)
    if (sp !== undefined && tp !== undefined) {
      baseByKey.set(linkKey(sp, tp, l.linkTypeId), l)
    }
  }
  const targetByKey = new Map<string, LinkResponse>()
  for (const l of targetLinks) {
    const sp = targetPathMap.get(l.sourceId)
    const tp = targetPathMap.get(l.targetId)
    if (sp !== undefined && tp !== undefined) {
      targetByKey.set(linkKey(sp, tp, l.linkTypeId), l)
    }
  }
  const baseByStableId = new Map<string, LinkResponse>()
  for (const l of baseLinks) if (l.stableId) baseByStableId.set(l.stableId, l)
  const targetByStableId = new Map<string, LinkResponse>()
  for (const l of targetLinks) if (l.stableId) targetByStableId.set(l.stableId, l)

  const result: LinkDiffItem[] = []
  const matchedTargetIds = new Set<string>()

  for (const link of baseLinks) {
    const sp = basePathMap.get(link.sourceId)
    const tp = basePathMap.get(link.targetId)
    if (sp === undefined || tp === undefined) continue
    const targetByStable = link.stableId ? targetByStableId.get(link.stableId) : undefined
    if (targetByStable) {
      matchedTargetIds.add(targetByStable.id)
      if (!linkEquals(link, targetByStable)) {
        result.push({ kind: "modified", sourcePath: sp, targetPath: tp, base: link, target: targetByStable })
      }
      continue
    }
    const key = linkKey(sp, tp, link.linkTypeId)
    const targetByKeyLink = targetByKey.get(key)
    if (targetByKeyLink) {
      matchedTargetIds.add(targetByKeyLink.id)
      if (!linkEquals(link, targetByKeyLink)) {
        result.push({ kind: "modified", sourcePath: sp, targetPath: tp, base: link, target: targetByKeyLink })
      }
      continue
    }
    result.push({ kind: "removed", sourcePath: sp, targetPath: tp, link })
  }
  for (const link of targetLinks) {
    if (matchedTargetIds.has(link.id)) continue
    const sp = targetPathMap.get(link.sourceId)
    const tp = targetPathMap.get(link.targetId)
    if (sp === undefined || tp === undefined) continue
    const key = linkKey(sp, tp, link.linkTypeId)
    if (baseByKey.has(key)) continue
    result.push({ kind: "added", sourcePath: sp, targetPath: tp, link })
  }

  return result
}

/**
 * Оставляет по одной диаграмме на имя — с максимальной версией (semver), как в редакторе.
 */
function getLatestDiagramsByName(diagrams: DiagramResponse[]): DiagramResponse[] {
  const byName = new Map<string, DiagramResponse>()
  for (const d of diagrams) {
    const name = d.name.trim()
    const existing = byName.get(name)
    if (!existing || compareVersions(d.version, existing.version) > 0) {
      byName.set(name, d)
    }
  }
  return Array.from(byName.values())
}

/**
 * Сравнивает диаграммы по имени (одно имя = один «логический» диаграммный артефакт).
 * Ожидает уже нормализованные массивы (одна диаграмма на имя — последняя по версии).
 */
export function compareDiagrams(
  baseDiagrams: DiagramResponse[],
  targetDiagrams: DiagramResponse[]
): DiagramDiffItem[] {
  const baseByName = new Map<string, DiagramResponse>()
  for (const d of baseDiagrams) baseByName.set(d.name.trim(), d)
  const targetByName = new Map<string, DiagramResponse>()
  for (const d of targetDiagrams) targetByName.set(d.name.trim(), d)

  const result: DiagramDiffItem[] = []

  for (const [name, diagram] of baseByName) {
    const targetDiagram = targetByName.get(name)
    if (!targetDiagram) {
      result.push({ kind: "removed", name, diagram })
    } else if (!diagramEquals(diagram, targetDiagram)) {
      result.push({ kind: "modified", name, base: diagram, target: targetDiagram })
    }
  }
  for (const [name, diagram] of targetByName) {
    if (!baseByName.has(name)) {
      result.push({ kind: "added", name, diagram })
    }
  }

  return result
}

export type ModelVersionDiff = {
  nodes: NodeDiffItem[]
  links: LinkDiffItem[]
  diagrams: DiagramDiffItem[]
}

/**
 * Полный diff двух наборов артефактов модели.
 * Диаграммы перед сравнением приводятся к одной на имя (последняя по semver).
 */
export function computeModelDiff(
  base: { nodes: NodeResponse[]; links: LinkResponse[]; diagrams: DiagramResponse[] },
  target: { nodes: NodeResponse[]; links: LinkResponse[]; diagrams: DiagramResponse[] }
): ModelVersionDiff {
  const basePathMap = buildNodePathMap(base.nodes)
  const targetPathMap = buildNodePathMap(target.nodes)
  const baseDiagrams = getLatestDiagramsByName(base.diagrams)
  const targetDiagrams = getLatestDiagramsByName(target.diagrams)
  return {
    nodes: compareNodes(base.nodes, target.nodes),
    links: compareLinks(base.links, target.links, basePathMap, targetPathMap),
    diagrams: compareDiagrams(baseDiagrams, targetDiagrams),
  }
}

export type DiagramDiffStateMaps = {
  diffStateByModelNodeId: Record<string, "added" | "removed" | "modified">
  diffStateByModelLinkId: Record<string, "added" | "removed" | "modified">
}

/**
 * Строит карты подсветки для экземпляров диаграммы (узлы и рёбра на канвасе).
 * base = левый канвас (removed/modified), target = правый (added/modified).
 * Сравнение «есть на этой диаграмме, нет на той» — по stableId узла/связи. Один и тот же stableId
 * на базе и отсутствующий на диаграмме изменений → красный на базе; на изменениях и отсутствующий на базе → зелёный.
 */
export function buildDiagramDiffStateMaps(
  diff: ModelVersionDiff,
  basePathMap: Map<string, string>,
  targetPathMap: Map<string, string>,
  baseLinks: LinkResponse[],
  targetLinks: LinkResponse[],
  instanceNodeIds: string[],
  instanceEdges: Array<{
    modelLinkId: string
    sourceId: string
    targetId: string
    linkTypeId: string
  }>,
  side: "base" | "target",
  options?: {
    /** stableId узлов/связей на противоположной диаграмме (stableId или id при отсутствии stableId). */
    otherSideStableIds?: {
      nodeStableIds: Set<string>
      linkStableIds: Set<string>
    }
    /** Текущая диаграмма: modelNodeId → stableId (или id), modelLinkId → stableId (или id). */
    currentStableIds?: {
      nodeIdToStableId: Map<string, string>
      linkIdToStableId: Map<string, string>
    }
  }
): DiagramDiffStateMaps {
  const removedNodeIds = new Set(
    diff.nodes.filter((n) => n.kind === "removed").map((n) => n.node.id)
  )
  const addedNodeIds = new Set(
    diff.nodes.filter((n) => n.kind === "added").map((n) => n.node.id)
  )
  const modifiedBaseNodeIds = new Set(
    diff.nodes.filter((n) => n.kind === "modified").map((n) => n.base.id)
  )
  const modifiedTargetNodeIds = new Set(
    diff.nodes.filter((n) => n.kind === "modified").map((n) => n.target.id)
  )
  const removedLinkIds = new Set(
    diff.links.filter((l) => l.kind === "removed").map((l) => l.link.id)
  )
  const addedLinkIds = new Set(
    diff.links.filter((l) => l.kind === "added").map((l) => l.link.id)
  )
  const modifiedBaseLinkIds = new Set(
    diff.links.filter((l) => l.kind === "modified").map((l) => l.base.id)
  )
  const modifiedTargetLinkIds = new Set(
    diff.links.filter((l) => l.kind === "modified").map((l) => l.target.id)
  )

  const otherStableIds = options?.otherSideStableIds
  const currentStableIds = options?.currentStableIds

  const diffStateByModelNodeId: Record<string, "added" | "removed" | "modified"> = {}
  for (const nodeId of instanceNodeIds) {
    const stableId = currentStableIds?.nodeIdToStableId.get(nodeId) ?? nodeId
    const absentOnOtherByStableId =
      otherStableIds?.nodeStableIds ? !otherStableIds.nodeStableIds.has(stableId) : false
    if (side === "base") {
      if (removedNodeIds.has(nodeId) || absentOnOtherByStableId) diffStateByModelNodeId[nodeId] = "removed"
      else if (modifiedBaseNodeIds.has(nodeId)) diffStateByModelNodeId[nodeId] = "modified"
    } else {
      if (addedNodeIds.has(nodeId) || absentOnOtherByStableId) diffStateByModelNodeId[nodeId] = "added"
      else if (modifiedTargetNodeIds.has(nodeId)) diffStateByModelNodeId[nodeId] = "modified"
    }
  }

  const diffStateByModelLinkId: Record<string, "added" | "removed" | "modified"> = {}
  for (const edge of instanceEdges) {
    const stableId = currentStableIds?.linkIdToStableId.get(edge.modelLinkId) ?? edge.modelLinkId
    const absentOnOtherByStableId =
      otherStableIds?.linkStableIds ? !otherStableIds.linkStableIds.has(stableId) : false
    if (side === "base") {
      if (removedLinkIds.has(edge.modelLinkId) || absentOnOtherByStableId) diffStateByModelLinkId[edge.modelLinkId] = "removed"
      else if (modifiedBaseLinkIds.has(edge.modelLinkId)) diffStateByModelLinkId[edge.modelLinkId] = "modified"
    } else {
      if (addedLinkIds.has(edge.modelLinkId) || absentOnOtherByStableId) diffStateByModelLinkId[edge.modelLinkId] = "added"
      else if (modifiedTargetLinkIds.has(edge.modelLinkId)) diffStateByModelLinkId[edge.modelLinkId] = "modified"
    }
  }

  return { diffStateByModelNodeId, diffStateByModelLinkId }
}

import { apiGet } from "@/composables/useApi"
import { computeModelDiff, type ModelVersionDiff } from "@/utils/modelDiff"
import type {
  DiagramResponse,
  LinkResponse,
  NodeResponse,
} from "@/types/api"

interface ApiNodeItem {
  id: string
  stableId?: string
  name: string
  nodeTypeId: string
  parentNodeId?: string | null
  attrs?: string | null
}

interface ApiLinkItem {
  id: string
  stableId?: string
  sourceNodeId: string
  targetNodeId: string
  sourcePath?: string
  targetPath?: string
  linkTypeId: string
  attrs?: string | null
}

interface ApiDiagramItem {
  id: string
  name: string
  version: string
  notationId: string
  attrs?: string | null
}

export interface ModelDiffApiResponse {
  nodes: Array<{
    kind: "added" | "removed" | "modified"
    path: string
    node?: ApiNodeItem
    base?: ApiNodeItem
    target?: ApiNodeItem
  }>
  links: Array<{
    kind: "added" | "removed" | "modified"
    key: string
    link?: ApiLinkItem
    base?: ApiLinkItem
    target?: ApiLinkItem
  }>
  diagrams: Array<{
    kind: "added" | "removed" | "modified"
    name: string
    diagram?: ApiDiagramItem
    base?: ApiDiagramItem
    target?: ApiDiagramItem
  }>
}

function toNodeResponse(n: ApiNodeItem): NodeResponse {
  return {
    id: n.id,
    stableId: n.stableId,
    name: n.name,
    modelId: "",
    ownerId: "",
    nodeTypeId: n.nodeTypeId,
    parentNodeId: n.parentNodeId,
    attrs: n.attrs,
  }
}

function toLinkResponse(l: ApiLinkItem): LinkResponse {
  return {
    id: l.id,
    stableId: l.stableId,
    sourceId: l.sourceNodeId,
    targetId: l.targetNodeId,
    modelId: "",
    ownerId: "",
    linkTypeId: l.linkTypeId,
    attrs: l.attrs,
  }
}

function toDiagramResponse(d: ApiDiagramItem): DiagramResponse {
  return {
    id: d.id,
    name: d.name,
    version: d.version,
    modelId: "",
    ownerId: "",
    notationId: d.notationId,
    attrs: d.attrs,
  }
}

/**
 * Парсит `key` связи формата "sourcePath\ttargetPath\tlinkTypeId"
 * и возвращает sourcePath / targetPath.
 */
function parseLinkKey(key: string): { sourcePath: string; targetPath: string } {
  const parts = key.split("\t")
  return { sourcePath: parts[0] ?? "", targetPath: parts[1] ?? "" }
}

export function normalizeApiDiffResponse(
  data: ModelDiffApiResponse
): ModelVersionDiff {
  return {
    nodes: data.nodes.map((item) => {
      if (item.kind === "modified") {
        return {
          kind: "modified",
          path: item.path,
          base: toNodeResponse(item.base!),
          target: toNodeResponse(item.target!),
        }
      }
      return {
        kind: item.kind,
        path: item.path,
        node: toNodeResponse(item.node!),
      }
    }),

    links: data.links.map((item) => {
      const { sourcePath, targetPath } = parseLinkKey(item.key)
      if (item.kind === "modified") {
        return {
          kind: "modified",
          sourcePath,
          targetPath,
          base: toLinkResponse(item.base!),
          target: toLinkResponse(item.target!),
        }
      }
      return {
        kind: item.kind,
        sourcePath,
        targetPath,
        link: toLinkResponse(item.link!),
      }
    }),

    diagrams: data.diagrams.map((item) => {
      if (item.kind === "modified") {
        return {
          kind: "modified",
          name: item.name,
          base: toDiagramResponse(item.base!),
          target: toDiagramResponse(item.target!),
        }
      }
      return {
        kind: item.kind,
        name: item.name,
        diagram: toDiagramResponse(item.diagram!),
      }
    }),
  }
}

/**
 * Пытается получить diff моделей через backend API.
 * При недоступности эндпоинта — fallback на локальное вычисление.
 */
export async function fetchModelDiff(
  baseModelId: string,
  targetModelId: string,
  localData?: {
    base: {
      nodes: NodeResponse[]
      links: LinkResponse[]
      diagrams: DiagramResponse[]
    }
    target: {
      nodes: NodeResponse[]
      links: LinkResponse[]
      diagrams: DiagramResponse[]
    }
  }
): Promise<ModelVersionDiff> {
  const result = await apiGet<ModelDiffApiResponse>(
    `/models/${encodeURIComponent(baseModelId)}/diff/${encodeURIComponent(targetModelId)}`
  )

  if (result.success) {
    return normalizeApiDiffResponse(result.data)
  }

  if (localData) {
    return computeModelDiff(localData.base, localData.target)
  }

  throw new Error(result.error.message)
}

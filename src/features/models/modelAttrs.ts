import type { ComponentResponse, RelationResponse } from "../../types/api"

export type JsonObject = Record<string, unknown>

export type NodeComponentBinding = {
  componentId: string
}

export type LinkRelationBinding = {
  relationId: string
}

export type ModelNodeAttrs = {
  notationComponents: Record<string, NodeComponentBinding>
  componentProperties: Record<string, Record<string, Record<string, unknown>>>
}

export type ModelLinkAttrs = {
  notationRelations: Record<string, LinkRelationBinding>
  relationProperties: Record<string, Record<string, Record<string, unknown>>>
}

export type DiagramNodeInstance = {
  id: string
  modelNodeId: string
  x: number
  y: number
  width?: number
  height?: number
  attrs?: JsonObject
}

export type DiagramEdgeInstance = {
  id: string
  modelLinkId: string
  sourceInstanceId: string
  targetInstanceId: string
  attrs?: JsonObject
}

export type DiagramAttrs = {
  instances: {
    nodes: DiagramNodeInstance[]
    edges: DiagramEdgeInstance[]
  }
}

export const createId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`

const parseJson = (raw: string | null | undefined): JsonObject => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject
    }
  } catch {
    // Ignore malformed payloads and fall back to empty attrs.
  }
  return {}
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const toNodeBindings = (value: unknown): Record<string, NodeComponentBinding> => {
  const source = toRecord(value)
  const out: Record<string, NodeComponentBinding> = {}
  for (const [notationId, row] of Object.entries(source)) {
    const record = toRecord(row)
    const componentId = typeof record.componentId === "string" ? record.componentId : ""
    if (!componentId) continue
    out[notationId] = { componentId }
  }
  return out
}

const toLinkBindings = (value: unknown): Record<string, LinkRelationBinding> => {
  const source = toRecord(value)
  const out: Record<string, LinkRelationBinding> = {}
  for (const [notationId, row] of Object.entries(source)) {
    const record = toRecord(row)
    const relationId = typeof record.relationId === "string" ? record.relationId : ""
    if (!relationId) continue
    out[notationId] = { relationId }
  }
  return out
}

const toScopedMap = (
  value: unknown
): Record<string, Record<string, Record<string, unknown>>> => {
  const source = toRecord(value)
  const result: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const [notationId, byEntity] of Object.entries(source)) {
    const entityMap = toRecord(byEntity)
    const normalizedEntityMap: Record<string, Record<string, unknown>> = {}
    for (const [entityId, props] of Object.entries(entityMap)) {
      normalizedEntityMap[entityId] = toRecord(props)
    }
    result[notationId] = normalizedEntityMap
  }
  return result
}

const toDiagramNodes = (value: unknown): DiagramNodeInstance[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => toRecord(item))
    .filter((item) => typeof item.id === "string" && typeof item.modelNodeId === "string")
    .map((item) => ({
      id: item.id as string,
      modelNodeId: item.modelNodeId as string,
      x: typeof item.x === "number" ? item.x : 80,
      y: typeof item.y === "number" ? item.y : 80,
      width: typeof item.width === "number" ? item.width : undefined,
      height: typeof item.height === "number" ? item.height : undefined,
      attrs: toRecord(item.attrs)
    }))
}

const toDiagramEdges = (value: unknown): DiagramEdgeInstance[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => toRecord(item))
    .filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.modelLinkId === "string" &&
        typeof item.sourceInstanceId === "string" &&
        typeof item.targetInstanceId === "string"
    )
    .map((item) => ({
      id: item.id as string,
      modelLinkId: item.modelLinkId as string,
      sourceInstanceId: item.sourceInstanceId as string,
      targetInstanceId: item.targetInstanceId as string,
      attrs: toRecord(item.attrs)
    }))
}

export const parseNodeAttrs = (raw: string | null | undefined): ModelNodeAttrs => {
  const data = parseJson(raw)
  return {
    notationComponents: toNodeBindings(data.notationComponents),
    componentProperties: toScopedMap(data.componentProperties)
  }
}

export const parseLinkAttrs = (raw: string | null | undefined): ModelLinkAttrs => {
  const data = parseJson(raw)
  return {
    notationRelations: toLinkBindings(data.notationRelations),
    relationProperties: toScopedMap(data.relationProperties)
  }
}

export const parseDiagramAttrs = (raw: string | null | undefined): DiagramAttrs => {
  const data = parseJson(raw)
  const instances = toRecord(data.instances)
  return {
    instances: {
      nodes: toDiagramNodes(instances.nodes),
      edges: toDiagramEdges(instances.edges)
    }
  }
}

export const serializeNodeAttrs = (attrs: ModelNodeAttrs): string =>
  JSON.stringify(attrs)

export const serializeLinkAttrs = (attrs: ModelLinkAttrs): string =>
  JSON.stringify(attrs)

export const serializeDiagramAttrs = (attrs: DiagramAttrs): string =>
  JSON.stringify(attrs)

export const resolveComponentByNodeType = (
  components: ComponentResponse[],
  notationId: string,
  nodeTypeId: string
): ComponentResponse[] =>
  components.filter((item) => item.notationId === notationId && item.nodeTypeId === nodeTypeId)

export const resolveRelationByLinkType = (
  relations: RelationResponse[],
  notationId: string,
  linkTypeId: string
): RelationResponse[] =>
  relations.filter((item) => item.notationId === notationId && item.linkTypeId === linkTypeId)

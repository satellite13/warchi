import type { ComponentResponse, RelationResponse } from '@/types/api'
import { clonePlainDeep } from '@/utils/clonePlainDeep'

export type JsonObject = Record<string, unknown>

export type NodeComponentBinding = {
  componentId: string
}

export type LinkRelationBinding = {
  relationId: string
}

export type ModelNodeAttrs = {
  treeOrder: number
  notationComponents: Record<string, NodeComponentBinding>
  componentProperties: Record<string, Record<string, Record<string, unknown>>>
  /** Значения кастомных свойств типа ноды (общие для модели, не зависят от диаграммы) */
  typeProperties: Record<string, unknown>
  /** UUID файла markdown-документации */
  documentFileId?: string
}

export type ModelLinkAttrs = {
  notationRelations: Record<string, LinkRelationBinding>
  relationProperties: Record<string, Record<string, Record<string, unknown>>>
  /** Значения кастомных свойств типа связи (общие для модели, не зависят от диаграммы) */
  typeProperties: Record<string, unknown>
}

export type ScopedCustomValues = Record<string, Record<string, Record<string, unknown>>>

export type BoundaryAttach = {
  hostInstanceId: string
  param: number
}

export type DiagramNodeInstanceAttrs = JsonObject & {
  componentProperties?: ScopedCustomValues
  /** Visual (notation component) for this diagram instance; falls back to node binding. */
  notationComponentId?: string
  /** Guest glued to a host outline (BPMN boundary event). */
  boundaryAttach?: BoundaryAttach
}

export const parseBoundaryAttach = (value: unknown): BoundaryAttach | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const hostInstanceId = typeof record.hostInstanceId === 'string' ? record.hostInstanceId.trim() : ''
  const param = record.param
  if (!hostInstanceId || typeof param !== 'number' || !Number.isFinite(param)) return undefined
  return { hostInstanceId, param }
}

export type DiagramEdgeInstanceAttrs = JsonObject & {
  relationProperties?: ScopedCustomValues
  diagramStyle?: JsonObject
}

export type DiagramNodeInstance = {
  id: string
  modelNodeId: string
  x: number
  y: number
  width?: number
  height?: number
  attrs?: DiagramNodeInstanceAttrs
}

export type DiagramEdgeInstance = {
  id: string
  modelLinkId: string
  sourceInstanceId: string
  targetInstanceId: string
  attrs?: DiagramEdgeInstanceAttrs
}

export type DiagramAttrs = {
  instances: {
    nodes: DiagramNodeInstance[]
    edges: DiagramEdgeInstance[]
  }
  /** UUID файла markdown-документации */
  documentFileId?: string
}

export { createId } from '@/utils/createId'

const parseJson = (raw: string | null | undefined): JsonObject => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonObject
    }
  } catch {
    // Ignore malformed payloads and fall back to empty attrs.
  }
  return {}
}

const cloneJson = clonePlainDeep

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const toClonedRecord = (value: unknown): Record<string, unknown> => {
  const record = toRecord(value)
  return Object.keys(record).length > 0 ? cloneJson(record) : {}
}

const toNodeBindings = (value: unknown): Record<string, NodeComponentBinding> => {
  const source = toRecord(value)
  const out: Record<string, NodeComponentBinding> = {}
  for (const [notationId, row] of Object.entries(source)) {
    const record = toRecord(row)
    const componentId = typeof record.componentId === 'string' ? record.componentId : ''
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
    const relationId = typeof record.relationId === 'string' ? record.relationId : ''
    if (!relationId) continue
    out[notationId] = { relationId }
  }
  return out
}

const toScopedMap = (value: unknown): ScopedCustomValues => {
  const source = toRecord(value)
  const result: ScopedCustomValues = {}
  for (const [notationId, byEntity] of Object.entries(source)) {
    const entityMap = toRecord(byEntity)
    const normalizedEntityMap: Record<string, Record<string, unknown>> = {}
    for (const [entityId, props] of Object.entries(entityMap)) {
      normalizedEntityMap[entityId] = toClonedRecord(props)
    }
    result[notationId] = normalizedEntityMap
  }
  return result
}

const toDiagramNodeAttrs = (value: unknown): DiagramNodeInstanceAttrs => {
  const attrs = toClonedRecord(value) as DiagramNodeInstanceAttrs
  if ('componentProperties' in attrs) {
    attrs.componentProperties = toScopedMap(attrs.componentProperties)
  }
  if (typeof attrs.notationComponentId === 'string') {
    const trimmed = attrs.notationComponentId.trim()
    if (trimmed) attrs.notationComponentId = trimmed
    else delete attrs.notationComponentId
  } else if ('notationComponentId' in attrs) {
    delete attrs.notationComponentId
  }
  const boundaryAttach = parseBoundaryAttach(attrs.boundaryAttach)
  if (boundaryAttach) attrs.boundaryAttach = boundaryAttach
  else delete attrs.boundaryAttach
  return attrs
}

const toDiagramEdgeAttrs = (value: unknown): DiagramEdgeInstanceAttrs => {
  const attrs = toClonedRecord(value) as DiagramEdgeInstanceAttrs
  if ('relationProperties' in attrs) {
    attrs.relationProperties = toScopedMap(attrs.relationProperties)
  }
  return attrs
}

const toDiagramNodes = (value: unknown): DiagramNodeInstance[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => toRecord(item))
    .filter(item => typeof item.id === 'string' && typeof item.modelNodeId === 'string')
    .map(item => ({
      id: item.id as string,
      modelNodeId: item.modelNodeId as string,
      x: typeof item.x === 'number' ? item.x : 80,
      y: typeof item.y === 'number' ? item.y : 80,
      width: typeof item.width === 'number' ? item.width : undefined,
      height: typeof item.height === 'number' ? item.height : undefined,
      attrs: toDiagramNodeAttrs(item.attrs),
    }))
}

const toDiagramEdges = (value: unknown): DiagramEdgeInstance[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => toRecord(item))
    .filter(
      item =>
        typeof item.id === 'string' &&
        typeof item.modelLinkId === 'string' &&
        typeof item.sourceInstanceId === 'string' &&
        typeof item.targetInstanceId === 'string'
    )
    .map(item => ({
      id: item.id as string,
      modelLinkId: item.modelLinkId as string,
      sourceInstanceId: item.sourceInstanceId as string,
      targetInstanceId: item.targetInstanceId as string,
      attrs: toDiagramEdgeAttrs(item.attrs),
    }))
}

export const parseNodeAttrs = (raw: string | null | undefined): ModelNodeAttrs => {
  const data = parseJson(raw)
  const rawTreeOrder = data.treeOrder
  const treeOrder =
    typeof rawTreeOrder === 'number' && Number.isFinite(rawTreeOrder) && rawTreeOrder >= 0
      ? Math.trunc(rawTreeOrder)
      : 0
  const result: ModelNodeAttrs = {
    treeOrder,
    notationComponents: toNodeBindings(data.notationComponents),
    componentProperties: toScopedMap(data.componentProperties),
    typeProperties: toClonedRecord(data.typeProperties),
  }
  if (typeof data.documentFileId === 'string' && data.documentFileId.trim().length > 0) {
    result.documentFileId = data.documentFileId.trim()
  }
  return result
}

export const parseLinkAttrs = (raw: string | null | undefined): ModelLinkAttrs => {
  const data = parseJson(raw)
  return {
    notationRelations: toLinkBindings(data.notationRelations),
    relationProperties: toScopedMap(data.relationProperties),
    typeProperties: toClonedRecord(data.typeProperties),
  }
}

export const parseDiagramAttrs = (raw: string | null | undefined): DiagramAttrs => {
  const data = parseJson(raw)
  const instances = toRecord(data.instances)
  const result: DiagramAttrs = {
    instances: {
      nodes: toDiagramNodes(instances.nodes),
      edges: toDiagramEdges(instances.edges),
    },
  }
  if (typeof data.documentFileId === 'string' && data.documentFileId.trim().length > 0) {
    result.documentFileId = data.documentFileId.trim()
  }
  return result
}

export const serializeNodeAttrs = (attrs: ModelNodeAttrs): string => JSON.stringify(attrs)

export const serializeLinkAttrs = (attrs: ModelLinkAttrs): string => JSON.stringify(attrs)

export const serializeDiagramAttrs = (attrs: DiagramAttrs): string => JSON.stringify(attrs)

export const resolveComponentByNodeType = (
  components: ComponentResponse[],
  notationId: string,
  nodeTypeId: string
): ComponentResponse[] =>
  components.filter(item => item.notationId === notationId && item.nodeTypeId === nodeTypeId)

/**
 * Resolves components with the same precedence as notation eligibility:
 * a present node binding is authoritative, while an absent binding falls back
 * to components matching the node type.
 */
export const resolveCompatibleNotationComponents = <
  T extends Pick<ComponentResponse, 'id' | 'notationId' | 'nodeTypeId'>,
>(input: {
  node: { nodeTypeId: string; parsedAttrs: ModelNodeAttrs }
  notationId: string | null | undefined
  components: readonly T[]
}): T[] => {
  const notationId = input.notationId
  if (!notationId) return []

  const componentId = input.node.parsedAttrs.notationComponents[notationId]?.componentId
  if (componentId) {
    return input.components.filter(
      component => component.id === componentId && component.notationId === notationId
    )
  }

  return input.components.filter(
    component =>
      component.notationId === notationId && component.nodeTypeId === input.node.nodeTypeId
  )
}

export type ResolveInstanceComponentIdInput = {
  instance?: DiagramNodeInstance | null
  node?: { parsedAttrs: ModelNodeAttrs } | null
  notationId: string | null | undefined
}

/** Prefer per-instance visual binding, then node-level default for the notation. */
export const resolveInstanceComponentId = (
  input: ResolveInstanceComponentIdInput,
): string | null => {
  const fromInstance = input.instance?.attrs?.notationComponentId
  if (typeof fromInstance === 'string' && fromInstance.trim().length > 0) {
    return fromInstance.trim()
  }
  const notationId = input.notationId
  if (!notationId || !input.node) return null
  return input.node.parsedAttrs.notationComponents[notationId]?.componentId ?? null
}

export const hasEligibleNotationComponent = (input: {
  node: { nodeTypeId: string; parsedAttrs: ModelNodeAttrs }
  notationId: string | null | undefined
  components: readonly Pick<ComponentResponse, 'id' | 'notationId' | 'nodeTypeId'>[]
}): boolean => {
  const notationId = input.notationId
  if (!notationId) return false

  const existingComponentId = input.node.parsedAttrs.notationComponents[notationId]?.componentId
  if (existingComponentId) {
    return input.components.some(
      component => component.id === existingComponentId && component.notationId === notationId
    )
  }

  return input.components.some(
    component =>
      component.notationId === notationId && component.nodeTypeId === input.node.nodeTypeId
  )
}

export const resolveRelationByLinkType = (
  relations: RelationResponse[],
  notationId: string,
  linkTypeId: string
): RelationResponse[] =>
  relations.filter(item => item.notationId === notationId && item.linkTypeId === linkTypeId)

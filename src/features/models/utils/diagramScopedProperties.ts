import { clonePlainDeep } from '@/utils/clonePlainDeep'
import type {
  DiagramAttrs,
  DiagramEdgeInstance,
  DiagramNodeInstance,
  ModelLinkAttrs,
  ModelNodeAttrs,
  ScopedCustomValues,
} from '../modelAttrs'

type NodeScopedReadInput = {
  diagram: DiagramAttrs | null | undefined
  modelNodeId: string
  notationId: string | null | undefined
  componentId: string | null | undefined
  nodeAttrsFallback?: ModelNodeAttrs | null
  instanceId?: string | null
}

type LinkScopedReadInput = {
  diagram: DiagramAttrs | null | undefined
  modelLinkId: string
  notationId: string | null | undefined
  relationId: string | null | undefined
  linkAttrsFallback?: ModelLinkAttrs | null
  edgeInstanceId?: string | null
}

type NodeScopedWriteInput = {
  diagram: DiagramAttrs
  modelNodeId: string
  notationId: string
  componentId: string
  key: string
  value: unknown
  nodeAttrsFallback?: ModelNodeAttrs | null
  instanceId?: string | null
}

type LinkScopedWriteInput = {
  diagram: DiagramAttrs
  modelLinkId: string
  notationId: string
  relationId: string
  key: string
  value: unknown
  linkAttrsFallback?: ModelLinkAttrs | null
  edgeInstanceId?: string | null
}

const cloneJson = clonePlainDeep

const toScopedMap = (value: unknown): ScopedCustomValues =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (cloneJson(value) as ScopedCustomValues)
    : {}

const resolveNodeInstance = (
  diagram: DiagramAttrs | null | undefined,
  modelNodeId: string,
  instanceId?: string | null
): DiagramNodeInstance | null => {
  if (!diagram) return null
  if (instanceId) {
    const byId = diagram.instances.nodes.find(item => item.id === instanceId)
    if (byId) return byId
  }
  return diagram.instances.nodes.find(item => item.modelNodeId === modelNodeId) ?? null
}

const resolveEdgeInstance = (
  diagram: DiagramAttrs | null | undefined,
  modelLinkId: string,
  edgeInstanceId?: string | null
): DiagramEdgeInstance | null => {
  if (!diagram) return null
  if (edgeInstanceId) {
    const byId = diagram.instances.edges.find(item => item.id === edgeInstanceId)
    if (byId) return byId
  }
  return diagram.instances.edges.find(item => item.modelLinkId === modelLinkId) ?? null
}

const readLegacyNodeScopedValues = (
  nodeAttrs: ModelNodeAttrs | null | undefined,
  notationId: string | null | undefined,
  componentId: string | null | undefined
): Record<string, unknown> => {
  if (!nodeAttrs || !notationId || !componentId) return {}
  return nodeAttrs.componentProperties[notationId]?.[componentId] ?? {}
}

const readLegacyLinkScopedValues = (
  linkAttrs: ModelLinkAttrs | null | undefined,
  notationId: string | null | undefined,
  relationId: string | null | undefined
): Record<string, unknown> => {
  if (!linkAttrs || !notationId || !relationId) return {}
  return linkAttrs.relationProperties[notationId]?.[relationId] ?? {}
}

const mergeScopedMaps = (base: ScopedCustomValues, overlay: ScopedCustomValues): ScopedCustomValues => {
  const result: ScopedCustomValues = cloneJson(base)
  for (const [notationId, byEntity] of Object.entries(overlay)) {
    if (!result[notationId]) result[notationId] = {}
    for (const [entityId, props] of Object.entries(byEntity)) {
      result[notationId]![entityId] = {
        ...(result[notationId]![entityId] ?? {}),
        ...props,
      }
    }
  }
  return result
}

export const getDiagramScopedNodeMap = ({
  diagram,
  modelNodeId,
  nodeAttrsFallback,
  instanceId,
}: {
  diagram: DiagramAttrs | null | undefined
  modelNodeId: string
  nodeAttrsFallback?: ModelNodeAttrs | null
  instanceId?: string | null
}): ScopedCustomValues => {
  const legacy = nodeAttrsFallback?.componentProperties ?? {}
  const instance = resolveNodeInstance(diagram, modelNodeId, instanceId)
  const snapshot = instance?.attrs?.componentProperties ?? {}
  return mergeScopedMaps(legacy, snapshot)
}

export const getDiagramScopedLinkMap = ({
  diagram,
  modelLinkId,
  linkAttrsFallback,
  edgeInstanceId,
}: {
  diagram: DiagramAttrs | null | undefined
  modelLinkId: string
  linkAttrsFallback?: ModelLinkAttrs | null
  edgeInstanceId?: string | null
}): ScopedCustomValues => {
  const legacy = linkAttrsFallback?.relationProperties ?? {}
  const edge = resolveEdgeInstance(diagram, modelLinkId, edgeInstanceId)
  const snapshot = edge?.attrs?.relationProperties ?? {}
  return mergeScopedMaps(legacy, snapshot)
}

export const getDiagramScopedNodeValues = ({
  diagram,
  modelNodeId,
  notationId,
  componentId,
  nodeAttrsFallback,
  instanceId,
}: NodeScopedReadInput): Record<string, unknown> => {
  if (!notationId || !componentId) return {}
  const instance = resolveNodeInstance(diagram, modelNodeId, instanceId)
  const fromSnapshot = instance?.attrs?.componentProperties?.[notationId]?.[componentId]
  if (fromSnapshot) return fromSnapshot
  return readLegacyNodeScopedValues(nodeAttrsFallback, notationId, componentId)
}

export const getDiagramScopedLinkValues = ({
  diagram,
  modelLinkId,
  notationId,
  relationId,
  linkAttrsFallback,
  edgeInstanceId,
}: LinkScopedReadInput): Record<string, unknown> => {
  if (!notationId || !relationId) return {}
  const edge = resolveEdgeInstance(diagram, modelLinkId, edgeInstanceId)
  const fromSnapshot = edge?.attrs?.relationProperties?.[notationId]?.[relationId]
  if (fromSnapshot) return fromSnapshot
  return readLegacyLinkScopedValues(linkAttrsFallback, notationId, relationId)
}

const ensureNodeSnapshotValues = ({
  diagram,
  modelNodeId,
  notationId,
  componentId,
  nodeAttrsFallback,
  instanceId,
}: Omit<NodeScopedWriteInput, 'key' | 'value'>): Record<string, unknown> | null => {
  const instance = resolveNodeInstance(diagram, modelNodeId, instanceId)
  if (!instance) return null
  if (!instance.attrs) instance.attrs = {}
  if (!instance.attrs.componentProperties) {
    instance.attrs.componentProperties = toScopedMap(undefined)
  }
  if (!instance.attrs.componentProperties[notationId]) {
    instance.attrs.componentProperties[notationId] = {}
  }
  if (!instance.attrs.componentProperties[notationId][componentId]) {
    instance.attrs.componentProperties[notationId][componentId] = cloneJson(
      readLegacyNodeScopedValues(nodeAttrsFallback, notationId, componentId)
    )
  }
  return instance.attrs.componentProperties[notationId][componentId] ?? null
}

const ensureLinkSnapshotValues = ({
  diagram,
  modelLinkId,
  notationId,
  relationId,
  linkAttrsFallback,
  edgeInstanceId,
}: Omit<LinkScopedWriteInput, 'key' | 'value'>): Record<string, unknown> | null => {
  const edge = resolveEdgeInstance(diagram, modelLinkId, edgeInstanceId)
  if (!edge) return null
  if (!edge.attrs) edge.attrs = {}
  if (!edge.attrs.relationProperties) {
    edge.attrs.relationProperties = toScopedMap(undefined)
  }
  if (!edge.attrs.relationProperties[notationId]) {
    edge.attrs.relationProperties[notationId] = {}
  }
  if (!edge.attrs.relationProperties[notationId][relationId]) {
    edge.attrs.relationProperties[notationId][relationId] = cloneJson(
      readLegacyLinkScopedValues(linkAttrsFallback, notationId, relationId)
    )
  }
  return edge.attrs.relationProperties[notationId][relationId] ?? null
}

export const setDiagramScopedNodeValue = ({
  diagram,
  modelNodeId,
  notationId,
  componentId,
  key,
  value,
  nodeAttrsFallback,
  instanceId,
}: NodeScopedWriteInput): boolean => {
  const target = ensureNodeSnapshotValues({
    diagram,
    modelNodeId,
    notationId,
    componentId,
    nodeAttrsFallback,
    instanceId,
  })
  if (!target) return false
  if (Object.is(target[key], value)) return false
  target[key] = value
  return true
}

export const setDiagramScopedLinkValue = ({
  diagram,
  modelLinkId,
  notationId,
  relationId,
  key,
  value,
  linkAttrsFallback,
  edgeInstanceId,
}: LinkScopedWriteInput): boolean => {
  const target = ensureLinkSnapshotValues({
    diagram,
    modelLinkId,
    notationId,
    relationId,
    linkAttrsFallback,
    edgeInstanceId,
  })
  if (!target) return false
  if (Object.is(target[key], value)) return false
  target[key] = value
  return true
}


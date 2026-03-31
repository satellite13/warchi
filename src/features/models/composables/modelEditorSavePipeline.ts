import { apiDelete, apiPost, apiPut } from "@/composables/useApi"
import type { ModelData } from "@/types/entities"
import type {
  DiagramRequest,
  DiagramResponse,
  DiagramUpdateRequest,
  LinkRequest,
  LinkResponse,
  ModelUpdateRequest,
  NodeRequest,
  NodeResponse,
} from "@/types/api"
import { formatEntitySaveError } from "@/utils/formatEntityError"
import { compareVersions } from "@/utils/version"
import { serializeDiagramAttrs, serializeLinkAttrs, serializeNodeAttrs } from "../modelAttrs"
import type { EditorDiagram, EditorLink, EditorNode } from "../types"


export async function saveModelMetadata(
  model: ModelData,
  modelCatalog: ModelData[]
): Promise<{ data: ModelData }> {
  const request: ModelUpdateRequest = {
    name: model.name,
    version: model.version,
    ownerId: model.ownerId,
    attrs: model.attrs ?? null,
  }
  const result = await apiPut<ModelData>(`/models/${model.id}`, request)
  if (!result.success) {
    if (result.error.status === 409) {
      throw new Error("Модель с таким именем и версией уже существует.")
    }
    throw new Error(`Ошибка обновления модели: ${result.error.message}`)
  }
  const idx = modelCatalog.findIndex(item => item.id === result.data.id)
  if (idx >= 0) modelCatalog[idx] = result.data
  return { data: result.data }
}

export async function saveNodes(
  nodes: EditorNode[],
  modelId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<Map<string, string>> {
  const newNodeIdMap = new Map<string, string>()

  const pendingNewNodes = nodes.filter(row => row._isNew && !row._isDeleted)
  const pendingNewNodeIds = new Set(pendingNewNodes.map(node => node.id))

  while (pendingNewNodes.length > 0) {
    let progress = false

    for (let i = 0; i < pendingNewNodes.length; i += 1) {
      const node = pendingNewNodes[i]!
      const rawParentId = node.parentNodeId ?? null
      const parentIsPending = rawParentId ? pendingNewNodeIds.has(rawParentId) : false
      if (parentIsPending && !newNodeIdMap.has(rawParentId!)) {
        continue
      }

      const resolvedParentId = rawParentId ? (newNodeIdMap.get(rawParentId) ?? rawParentId) : null
      onProgress(`Создание узла: ${node.name}`)
      const request: NodeRequest = {
        name: node.name,
        modelId,
        ownerId,
        nodeTypeId: node.nodeTypeId,
        parentNodeId: resolvedParentId,
        attrs: serializeNodeAttrs(node.parsedAttrs),
      }
      const result = await apiPost<NodeResponse>("/nodes", request)
      if (!result.success) {
        throw new Error(
          formatEntitySaveError("модели", "создания", "узла", result.error.status, result.error.message)
        )
      }
      const oldId = node.id
      newNodeIdMap.set(oldId, result.data.id)
      node.id = result.data.id
      node.parentNodeId = result.data.parentNodeId ?? resolvedParentId
      node._isNew = false
      const createdU = result.data.updatedAt
      if (typeof createdU === "string" && createdU.length > 0) node.updatedAt = createdU
      pendingNewNodes.splice(i, 1)
      pendingNewNodeIds.delete(oldId)
      i -= 1
      progress = true
    }

    if (!progress) {
      throw new Error("Не удалось сохранить новые узлы: проверьте иерархию дерева.")
    }
  }

  for (const node of nodes.filter(row => row._isDirty && !row._isDeleted && !row._isNew)) {
    onProgress(`Обновление узла: ${node.name}`)
    const resolvedParentId = node.parentNodeId
      ? (newNodeIdMap.get(node.parentNodeId) ?? node.parentNodeId)
      : null
    const request: NodeRequest = {
      name: node.name,
      modelId,
      ownerId,
      nodeTypeId: node.nodeTypeId,
      parentNodeId: resolvedParentId,
      attrs: serializeNodeAttrs(node.parsedAttrs),
    }
    const result = await apiPut<NodeResponse>(`/nodes/${node.id}`, request)
    if (!result.success) {
      throw new Error(
        formatEntitySaveError("модели", "обновления", "узла", result.error.status, result.error.message)
      )
    }
    node.parentNodeId = result.data.parentNodeId ?? resolvedParentId
    node._isDirty = false
    const nodeU = result.data.updatedAt
    if (typeof nodeU === "string" && nodeU.length > 0) node.updatedAt = nodeU
  }

  for (const node of nodes.filter(row => row._isDeleted && !row._isNew)) {
    onProgress(`Удаление узла: ${node.name}`)
    const result = await apiDelete<void>(`/nodes/${node.id}`)
    if (!result.success) {
      throw new Error(
        formatEntitySaveError("модели", "удаления", "узла", result.error.status, result.error.message)
      )
    }
  }

  return newNodeIdMap
}

export function remapNodeIds(
  newNodeIdMap: Map<string, string>,
  links: EditorLink[],
  diagrams: EditorDiagram[]
): void {
  if (newNodeIdMap.size === 0) return
  for (const link of links) {
    if (newNodeIdMap.has(link.sourceId)) link.sourceId = newNodeIdMap.get(link.sourceId)!
    if (newNodeIdMap.has(link.targetId)) link.targetId = newNodeIdMap.get(link.targetId)!
  }
  for (const diagram of diagrams) {
    if (diagram.nodeId && newNodeIdMap.has(diagram.nodeId)) {
      diagram.nodeId = newNodeIdMap.get(diagram.nodeId) ?? diagram.nodeId
    }
    for (const nodeInstance of diagram.parsedAttrs.instances.nodes) {
      if (newNodeIdMap.has(nodeInstance.modelNodeId)) {
        nodeInstance.modelNodeId = newNodeIdMap.get(nodeInstance.modelNodeId)!
      }
    }
  }
}

export async function saveLinks(
  links: EditorLink[],
  diagrams: EditorDiagram[],
  modelId: string,
  ownerId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  for (const link of links.filter(row => row._isDeleted && !row._isNew)) {
    onProgress("Удаление связи")
    const result = await apiDelete<void>(`/links/${link.id}`)
    if (!result.success) throw new Error(`Ошибка удаления связи: ${result.error.message}`)
  }

  for (const link of links.filter(row => row._isNew && !row._isDeleted)) {
    onProgress("Создание связи")
    const request: LinkRequest = {
      sourceId: link.sourceId,
      targetId: link.targetId,
      modelId,
      ownerId,
      linkTypeId: link.linkTypeId,
      attrs: serializeLinkAttrs(link.parsedAttrs),
    }
    const result = await apiPost<LinkResponse>("/links", request)
    if (!result.success) throw new Error(`Ошибка создания связи: ${result.error.message}`)
    const oldId = link.id
    link.id = result.data.id
    link._isNew = false
    const linkCreatedU = result.data.updatedAt
    if (typeof linkCreatedU === "string" && linkCreatedU.length > 0) link.updatedAt = linkCreatedU
    for (const diagram of diagrams) {
      for (const edge of diagram.parsedAttrs.instances.edges) {
        if (edge.modelLinkId === oldId) edge.modelLinkId = result.data.id
      }
    }
  }

  for (const link of links.filter(row => row._isDirty && !row._isDeleted && !row._isNew)) {
    onProgress("Обновление связи")
    const request: LinkRequest = {
      sourceId: link.sourceId,
      targetId: link.targetId,
      modelId,
      ownerId,
      linkTypeId: link.linkTypeId,
      attrs: serializeLinkAttrs(link.parsedAttrs),
    }
    const result = await apiPut<LinkResponse>(`/links/${link.id}`, request)
    if (!result.success) throw new Error(`Ошибка обновления связи: ${result.error.message}`)
    link._isDirty = false
    const linkU = result.data.updatedAt
    if (typeof linkU === "string" && linkU.length > 0) link.updatedAt = linkU
  }
}

export async function saveDiagrams(
  diagrams: EditorDiagram[],
  ownerId: string,
  modelId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  for (const diagram of diagrams.filter(row => row._isDeleted && !row._isNew)) {
    onProgress(`Удаление диаграммы: ${diagram.name}`)
    const result = await apiDelete<void>(`/diagrams/${diagram.id}`)
    if (!result.success) throw new Error(`Ошибка удаления диаграммы: ${result.error.message}`)
  }

  for (const diagram of diagrams.filter(row => row._isNew && !row._isDeleted)) {
    onProgress(`Создание диаграммы: ${diagram.name}`)
    const request: DiagramRequest = {
      name: diagram.name,
      version: diagram.version,
      ownerId,
      modelId,
      nodeId: diagram.nodeId ?? null,
      notationId: diagram.notationId,
      attrs: serializeDiagramAttrs(diagram.parsedAttrs),
    }
    const result = await apiPost<DiagramResponse>("/diagrams", request)
    if (!result.success) throw new Error(`Ошибка создания диаграммы: ${result.error.message}`)
    diagram.id = result.data.id
    diagram._isNew = false
    const dCreatedU = result.data.updatedAt
    if (typeof dCreatedU === "string" && dCreatedU.length > 0) diagram.updatedAt = dCreatedU
  }

  const dirtyDiagrams = diagrams
    .filter(row => row._isDirty && !row._isDeleted && !row._isNew)
    .sort((a, b) => compareVersions(b.version, a.version))
  for (const diagram of dirtyDiagrams) {
    onProgress(`Обновление диаграммы: ${diagram.name}`)
    const request: DiagramUpdateRequest = {
      name: diagram.name,
      version: diagram.version,
      ownerId,
      modelId,
      nodeId: diagram.nodeId ?? null,
      notationId: diagram.notationId,
      attrs: serializeDiagramAttrs(diagram.parsedAttrs),
    }
    const result = await apiPut<DiagramResponse>(`/diagrams/${diagram.id}`, request)
    if (!result.success) throw new Error(`Ошибка обновления диаграммы: ${result.error.message}`)
    diagram._isDirty = false
    const dU = result.data.updatedAt
    if (typeof dU === "string" && dU.length > 0) diagram.updatedAt = dU
  }
}

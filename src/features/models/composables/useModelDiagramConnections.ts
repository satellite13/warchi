import { ref, type ComputedRef, type Ref } from 'vue'
import { parseEntityAttrs } from '@/domain/attrs/notationAttrs'
import type { RelationResponse } from '@/types/api'
import { createId, parseLinkAttrs } from '../modelAttrs'
import type { EditorDiagram, EditorLink, ModelEditorState } from '../types'

import {
  DEFAULT_DIAGRAM_ONLY_LINK_STYLE,
  DEFAULT_EDGE_ANCHOR_DIAGRAM_STYLE,
  DIAGRAM_EDGE_ANCHOR_NODE_PREFIX,
  DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX,
  EDGE_ANCHOR_SIZE,
} from '../utils/diagramOnlyInstances'
import type { DiagramNodeInstance } from '../modelAttrs'

export const NOTE_EDGE_PREFIX = DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX
export const UNTYPED_EDGE_PREFIX = '__diagram-untyped-edge__:'
const UNTYPED_TYPE_NAMES = new Set(['diagram only'])

export const isDiagramOnlyEdgeModelLinkId = (modelLinkId: string): boolean =>
  modelLinkId.startsWith(NOTE_EDGE_PREFIX) || modelLinkId.startsWith(UNTYPED_EDGE_PREFIX)

type PendingConnection = {
  sourceModelNodeId: string
  targetModelNodeId: string
  sourceInstanceId: string
  targetInstanceId: string
  sourcePortId?: string
  targetPortId?: string
  sourceOutlineParam?: number
  targetOutlineParam?: number
}

type RelationChoiceOption = {
  id: string
  name: string
  linkTypeId: string
}

type DiagramHistoryCommand = {
  execute: () => void
  undo: () => void
}

export type UseModelDiagramConnectionsOptions = {
  state: Ref<ModelEditorState>
  activeDiagram: ComputedRef<EditorDiagram | null>
  activeNotationId: ComputedRef<string | null>
  defaultEdgeType: Ref<string>
  isRelationRulesLoading: ComputedRef<boolean>
  isDiagramReadOnly: ComputedRef<boolean>
  isDiagramNoteModelNodeId: (modelNodeId: string) => boolean
  isDiagramContainerModelNodeId: (modelNodeId: string) => boolean
  isEdgeAnchorModelNodeId: (modelNodeId: string) => boolean
  isDirectoryNode: (modelNodeId: string) => boolean
  isDirectoryNoteInstanceId: (instanceId: string) => boolean
  executeDiagramHistoryCommand: (command: DiagramHistoryCommand) => void
  markDiagramDirty: (diagramId: string) => void
  markLinkDirty: (linkId: string) => void
  bindLinkRelation: (link: EditorLink, relationId: string) => void
  setUiError: (message: string) => void
  t: (key: string) => string
  selectedModelLinkId: Ref<string | null>
  selectedEdgeInstanceId: Ref<string | null>
  selectedCanvasElementId: Ref<string | null>
}

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function useModelDiagramConnections(options: UseModelDiagramConnectionsOptions) {
  const showRelationChoiceModal = ref(false)
  const relationChoiceOptions = ref<RelationChoiceOption[]>([])
  const pendingConnection = ref<PendingConnection | null>(null)
  const showReuseLinkModal = ref(false)
  const reuseLinkOptions = ref<EditorLink[]>([])
  const pendingRelationId = ref<string | null>(null)
  const setTranslatedUiError = (key: string) => options.setUiError(options.t(key))

  const normalizeTypeName = (value: string | undefined): string => value?.trim().toLowerCase() ?? ''
  const isUntypedTypeName = (value: string | undefined): boolean =>
    UNTYPED_TYPE_NAMES.has(normalizeTypeName(value))
  const isUntypedNodeTypeId = (nodeTypeId: string): boolean =>
    isUntypedTypeName(options.state.value.nodeTypes.find(type => type.id === nodeTypeId)?.name)
  const isUntypedLinkTypeId = (linkTypeId: string): boolean =>
    isUntypedTypeName(options.state.value.linkTypes.find(type => type.id === linkTypeId)?.name)

  const isDiagramOnlyEndpointConnection = (
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string
  ): boolean =>
    options.isDiagramNoteModelNodeId(sourceModelNodeId) ||
    options.isDiagramNoteModelNodeId(targetModelNodeId) ||
    options.isDiagramContainerModelNodeId(sourceModelNodeId) ||
    options.isDiagramContainerModelNodeId(targetModelNodeId) ||
    options.isEdgeAnchorModelNodeId(sourceModelNodeId) ||
    options.isEdgeAnchorModelNodeId(targetModelNodeId) ||
    options.isDirectoryNode(sourceModelNodeId) ||
    options.isDirectoryNode(targetModelNodeId) ||
    options.isDirectoryNoteInstanceId(sourceInstanceId) ||
    options.isDirectoryNoteInstanceId(targetInstanceId)

  const allowedRelationsForConnection = (
    sourceModelNodeId: string,
    targetModelNodeId: string,
    reportErrors = true
  ): { relations: RelationResponse[]; sourceIsUntyped: boolean } | null => {
    const notationId = options.activeNotationId.value
    if (!notationId) return null
    const sourceNode = options.state.value.nodes.find(item => item.id === sourceModelNodeId)
    const targetNode = options.state.value.nodes.find(item => item.id === targetModelNodeId)
    if (!sourceNode || !targetNode) return null

    const sourceComponentId = sourceNode.parsedAttrs.notationComponents[notationId]?.componentId
    const targetComponentId = targetNode.parsedAttrs.notationComponents[notationId]?.componentId
    if (!sourceComponentId || !targetComponentId) {
      if (reportErrors) setTranslatedUiError('models.noComponentsForLink')
      return null
    }
    const sourceComponent = options.state.value.components.find(
      component => component.id === sourceComponentId && component.notationId === notationId
    )
    const targetComponent = options.state.value.components.find(
      component => component.id === targetComponentId && component.notationId === notationId
    )
    const sourceIsUntyped = sourceComponent
      ? isUntypedNodeTypeId(sourceComponent.nodeTypeId)
      : false
    const targetIsUntyped = targetComponent
      ? isUntypedNodeTypeId(targetComponent.nodeTypeId)
      : false
    const untypedRelations = options.state.value.relations.filter(
      relation => relation.notationId === notationId && isUntypedLinkTypeId(relation.linkTypeId)
    )

    if (!sourceIsUntyped && targetIsUntyped) {
      if (reportErrors) setTranslatedUiError('models.noAllowedRelationRules')
      return null
    }
    if (sourceIsUntyped) return { relations: untypedRelations, sourceIsUntyped: true }

    const ruleRelationIds = options.state.value.relationRules
      .filter(
        rule => rule.fromComponentId === sourceComponentId && rule.toComponentId === targetComponentId
      )
      .map(rule => rule.relationId)
    if (ruleRelationIds.length === 0) {
      if (reportErrors) setTranslatedUiError('models.noAllowedRelationRules')
      return null
    }
    return {
      relations: options.state.value.relations.filter(
        relation =>
          relation.notationId === notationId &&
          ruleRelationIds.includes(relation.id) &&
          !isUntypedLinkTypeId(relation.linkTypeId)
      ),
      sourceIsUntyped: false,
    }
  }

  const setPendingConnection = (
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    sourcePortId?: string,
    targetPortId?: string,
    sourceOutlineParam?: number,
    targetOutlineParam?: number
  ) => {
    pendingConnection.value = {
      sourceModelNodeId,
      targetModelNodeId,
      sourceInstanceId,
      targetInstanceId,
      sourcePortId,
      targetPortId,
      sourceOutlineParam,
      targetOutlineParam,
    }
  }

  const createNoteEdge = (connection: PendingConnection, diagram: EditorDiagram) => {
    const modelLinkId = `${NOTE_EDGE_PREFIX}${createId()}`
    const attrs: Record<string, unknown> = {
      isDiagramOnly: true,
      diagramStyle: {
        ...DEFAULT_DIAGRAM_ONLY_LINK_STYLE,
        edgeType: options.defaultEdgeType.value,
      },
    }
    if (connection.sourcePortId) attrs.fromPortId = connection.sourcePortId
    if (connection.targetPortId) attrs.toPortId = connection.targetPortId
    if (connection.sourceOutlineParam !== undefined) attrs.fromOutlineParam = connection.sourceOutlineParam
    if (connection.targetOutlineParam !== undefined) attrs.toOutlineParam = connection.targetOutlineParam
    const edge = {
      id: createId(),
      modelLinkId,
      sourceInstanceId: connection.sourceInstanceId,
      targetInstanceId: connection.targetInstanceId,
      attrs,
    }
    options.executeDiagramHistoryCommand({
      execute: () => {
        if (!diagram.parsedAttrs.instances.edges.some(item => item.id === edge.id)) {
          diagram.parsedAttrs.instances.edges.push(deepClone(edge))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          item => item.id !== edge.id
        )
        if (options.selectedModelLinkId.value === modelLinkId) {
          options.selectedModelLinkId.value = null
          options.selectedEdgeInstanceId.value = null
          options.selectedCanvasElementId.value = null
        }
        options.markDiagramDirty(diagram.id)
      },
    })
  }

  /**
   * Note/node → relation edge: create an edge-anchor on the host and a diagram-only link.
   */
  const connectNodeToEdge = (
    _nodeModelNodeId: string,
    nodeInstanceId: string,
    hostEdgeInstanceId: string,
    pathParam: number,
    nodeIsSource: boolean,
    nodePortId?: string,
    nodeOutlineParam?: number
  ) => {
    const diagram = options.activeDiagram.value
    if (!diagram || options.isDiagramReadOnly.value) return
    if (!diagram.parsedAttrs.instances.edges.some(edge => edge.id === hostEdgeInstanceId)) {
      return
    }

    const anchorId = createId()
    const path = Number.isFinite(pathParam) ? Math.min(1, Math.max(0, pathParam)) : 0.5
    const anchor: DiagramNodeInstance = {
      id: anchorId,
      modelNodeId: `${DIAGRAM_EDGE_ANCHOR_NODE_PREFIX}${anchorId}`,
      x: 0,
      y: 0,
      width: EDGE_ANCHOR_SIZE,
      height: EDGE_ANCHOR_SIZE,
      attrs: {
        isEdgeAnchor: true,
        hostEdgeInstanceId,
        pathParam: path,
        diagramStyle: { ...DEFAULT_EDGE_ANCHOR_DIAGRAM_STYLE },
      },
    }

    const modelLinkId = `${NOTE_EDGE_PREFIX}${createId()}`
    const attrs: Record<string, unknown> = {
      isDiagramOnly: true,
      diagramStyle: {
        ...DEFAULT_DIAGRAM_ONLY_LINK_STYLE,
        edgeType: options.defaultEdgeType.value,
      },
    }
    if (nodeIsSource) {
      if (nodePortId) attrs.fromPortId = nodePortId
      if (nodeOutlineParam !== undefined) attrs.fromOutlineParam = nodeOutlineParam
    } else {
      if (nodePortId) attrs.toPortId = nodePortId
      if (nodeOutlineParam !== undefined) attrs.toOutlineParam = nodeOutlineParam
    }

    const edge = {
      id: createId(),
      modelLinkId,
      sourceInstanceId: nodeIsSource ? nodeInstanceId : anchorId,
      targetInstanceId: nodeIsSource ? anchorId : nodeInstanceId,
      attrs,
    }

    options.executeDiagramHistoryCommand({
      execute: () => {
        if (!diagram.parsedAttrs.instances.nodes.some(item => item.id === anchor.id)) {
          diagram.parsedAttrs.instances.nodes.push(deepClone(anchor))
        }
        if (!diagram.parsedAttrs.instances.edges.some(item => item.id === edge.id)) {
          diagram.parsedAttrs.instances.edges.push(deepClone(edge))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          item => item.id !== edge.id
        )
        diagram.parsedAttrs.instances.nodes = diagram.parsedAttrs.instances.nodes.filter(
          item => item.id !== anchor.id
        )
        if (options.selectedModelLinkId.value === modelLinkId) {
          options.selectedModelLinkId.value = null
          options.selectedEdgeInstanceId.value = null
          options.selectedCanvasElementId.value = null
        }
        options.markDiagramDirty(diagram.id)
      },
    })
  }

  const startConnectNodes = (
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    sourcePortId?: string,
    targetPortId?: string,
    sourceOutlineParam?: number,
    targetOutlineParam?: number
  ) => {
    if (options.isRelationRulesLoading.value) {
      setTranslatedUiError('models.relationRulesLoadingConnectBlocked')
      return
    }
    const diagram = options.activeDiagram.value
    if (!diagram) return
    const connection: PendingConnection = {
      sourceModelNodeId,
      targetModelNodeId,
      sourceInstanceId,
      targetInstanceId,
      sourcePortId,
      targetPortId,
      sourceOutlineParam,
      targetOutlineParam,
    }
    if (
      isDiagramOnlyEndpointConnection(
        sourceModelNodeId,
        targetModelNodeId,
        sourceInstanceId,
        targetInstanceId
      )
    ) {
      createNoteEdge(connection, diagram)
      return
    }

    const allowed = allowedRelationsForConnection(sourceModelNodeId, targetModelNodeId)
    if (!allowed) return
    if (allowed.relations.length === 0) {
      setTranslatedUiError('models.noAvailableRelations')
      return
    }
    pendingConnection.value = connection
    relationChoiceOptions.value = allowed.relations.map(relation => ({
      id: relation.id,
      name: relation.name,
      linkTypeId: relation.linkTypeId,
    }))
    if (allowed.sourceIsUntyped) {
      if (allowed.relations.length === 1) finalizeConnection(allowed.relations[0]!.id)
      else showRelationChoiceModal.value = true
      return
    }

    const existingLinks = options.state.value.links.filter(
      link =>
        !link._isDeleted &&
        link.sourceId === sourceModelNodeId &&
        link.targetId === targetModelNodeId &&
        allowed.relations.some(relation => relation.linkTypeId === link.linkTypeId)
    )
    if (existingLinks.length > 0) {
      reuseLinkOptions.value = existingLinks
      showReuseLinkModal.value = true
      return
    }
    if (allowed.relations.length === 1) finalizeConnection(allowed.relations[0]!.id)
    else showRelationChoiceModal.value = true
  }

  const finalizeConnection = (relationId: string) => {
    if (!options.activeNotationId.value || !options.activeDiagram.value || !pendingConnection.value) return
    if (!options.state.value.relations.some(item => item.id === relationId)) return
    showRelationChoiceModal.value = false
    pendingRelationId.value = relationId
    createOrReuseLink(null)
  }

  const handleCreateNewLinkFromReuseModal = () => {
    showReuseLinkModal.value = false
    if (relationChoiceOptions.value.length === 1) {
      finalizeConnection(relationChoiceOptions.value[0]!.id)
      return
    }
    showRelationChoiceModal.value = true
  }

  const handleRequestAutoLink = (
    sourceModelNodeId: string,
    targetModelNodeId: string,
    sourceInstanceId: string,
    targetInstanceId: string,
    availableRelations: RelationResponse[],
    existingLinksNotOnDiagram: EditorLink[]
  ) => {
    if (!options.activeDiagram.value) return
    setPendingConnection(sourceModelNodeId, targetModelNodeId, sourceInstanceId, targetInstanceId)
    relationChoiceOptions.value = availableRelations.map(relation => ({
      id: relation.id,
      name: relation.name,
      linkTypeId: relation.linkTypeId,
    }))
    if (existingLinksNotOnDiagram.length > 0) {
      reuseLinkOptions.value = existingLinksNotOnDiagram
      showReuseLinkModal.value = true
      return
    }
    showRelationChoiceModal.value = true
  }

  const handleSelectExistingLink = (linkId: string) => {
    const notationId = options.activeNotationId.value
    const link = options.state.value.links.find(item => item.id === linkId)
    if (!notationId || !link) return
    const relation = options.state.value.relations.find(
      item => item.notationId === notationId && item.linkTypeId === link.linkTypeId
    )
    if (!relation) return
    pendingRelationId.value = relation.id
    createOrReuseLink(linkId)
  }

  const createOrReuseLink = (linkId: string | null) => {
    const diagram = options.activeDiagram.value
    const connection = pendingConnection.value
    const relationId = pendingRelationId.value
    if (!diagram || !connection || !relationId) return
    const relation = options.state.value.relations.find(item => item.id === relationId)
    if (!relation) return
    const isUntypedRelation = isUntypedLinkTypeId(relation.linkTypeId)
    const isNewLink = !linkId || isUntypedRelation
    const resolvedLinkId = isUntypedRelation
      ? `${UNTYPED_EDGE_PREFIX}${createId()}`
      : (linkId ?? createId())
    const existingLink = options.state.value.links.find(item => item.id === resolvedLinkId) ?? null
    if (!isNewLink && !existingLink) return
    const previousParsedAttrs = existingLink ? deepClone(existingLink.parsedAttrs) : null
    const newLink: EditorLink | null =
      isNewLink && !isUntypedRelation
        ? {
            id: resolvedLinkId,
            sourceId: connection.sourceModelNodeId,
            targetId: connection.targetModelNodeId,
            modelId: options.state.value.modelId,
            ownerId: options.state.value.ownerId,
            linkTypeId: relation.linkTypeId,
            createdAt: null,
            updatedAt: null,
            parsedAttrs: parseLinkAttrs(null),
            _isNew: true,
          }
        : null
    const relationStyle = parseEntityAttrs(relation.attrs ?? null).diagramStyle
    const diagramStyle: Record<string, unknown> = relationStyle ? deepClone(relationStyle) : {}
    diagramStyle.edgeType = options.defaultEdgeType.value
    const attrs: Record<string, unknown> = { diagramStyle }
    if (connection.sourcePortId) attrs.fromPortId = connection.sourcePortId
    if (connection.targetPortId) attrs.toPortId = connection.targetPortId
    if (connection.sourceOutlineParam !== undefined) attrs.fromOutlineParam = connection.sourceOutlineParam
    if (connection.targetOutlineParam !== undefined) attrs.toOutlineParam = connection.targetOutlineParam
    const edge = {
      id: createId(),
      modelLinkId: resolvedLinkId,
      sourceInstanceId: connection.sourceInstanceId,
      targetInstanceId: connection.targetInstanceId,
      attrs,
    }

    options.executeDiagramHistoryCommand({
      execute: () => {
        if (isUntypedRelation) {
          if (!diagram.parsedAttrs.instances.edges.some(item => item.id === edge.id)) {
            diagram.parsedAttrs.instances.edges.push(deepClone(edge))
          }
          options.markDiagramDirty(diagram.id)
          return
        }
        let link = options.state.value.links.find(item => item.id === resolvedLinkId) ?? null
        if (!link && newLink) {
          options.state.value.links.push(deepClone(newLink))
          link = options.state.value.links.find(item => item.id === resolvedLinkId) ?? null
        }
        if (!link) return
        options.bindLinkRelation(link, relation.id)
        if (!diagram.parsedAttrs.instances.edges.some(item => item.id === edge.id)) {
          diagram.parsedAttrs.instances.edges.push(deepClone(edge))
        }
        options.markDiagramDirty(diagram.id)
      },
      undo: () => {
        diagram.parsedAttrs.instances.edges = diagram.parsedAttrs.instances.edges.filter(
          item => item.id !== edge.id
        )
        if (isUntypedRelation) {
          options.markDiagramDirty(diagram.id)
          return
        }
        if (isNewLink) {
          options.state.value.links = options.state.value.links.filter(item => item.id !== resolvedLinkId)
        } else if (previousParsedAttrs) {
          const link = options.state.value.links.find(item => item.id === resolvedLinkId)
          if (link) {
            link.parsedAttrs = deepClone(previousParsedAttrs)
            options.markLinkDirty(link.id)
          }
        }
        options.markDiagramDirty(diagram.id)
      },
    })
    pendingConnection.value = null
    pendingRelationId.value = null
    showReuseLinkModal.value = false
  }

  const canConnect = (sourceModelNodeId: string, targetModelNodeId: string): boolean => {
    if (options.isRelationRulesLoading.value) return false
    if (
      options.isDiagramNoteModelNodeId(sourceModelNodeId) ||
      options.isDiagramNoteModelNodeId(targetModelNodeId) ||
      options.isDiagramContainerModelNodeId(sourceModelNodeId) ||
      options.isDiagramContainerModelNodeId(targetModelNodeId) ||
      options.isEdgeAnchorModelNodeId(sourceModelNodeId) ||
      options.isEdgeAnchorModelNodeId(targetModelNodeId) ||
      options.isDirectoryNode(sourceModelNodeId) ||
      options.isDirectoryNode(targetModelNodeId)
    ) {
      return true
    }
    const allowed = allowedRelationsForConnection(sourceModelNodeId, targetModelNodeId, false)
    return !!allowed && allowed.relations.length > 0
  }

  const placeTraceLinkOnDiagram = (linkId: string) => {
    const diagram = options.activeDiagram.value
    const notationId = options.activeNotationId.value
    if (!diagram || !notationId || options.isDiagramReadOnly.value) return
    const link = options.state.value.links.find(item => item.id === linkId && !item._isDeleted)
    if (!link || diagram.parsedAttrs.instances.edges.some(edge => edge.modelLinkId === link.id)) return
    const relation = options.state.value.relations.find(
      item => item.notationId === notationId && item.linkTypeId === link.linkTypeId
    )
    if (!relation || !canConnect(link.sourceId, link.targetId)) return
    const source = diagram.parsedAttrs.instances.nodes.find(item => item.modelNodeId === link.sourceId)
    const target = diagram.parsedAttrs.instances.nodes.find(item => item.modelNodeId === link.targetId)
    if (!source || !target) return
    setPendingConnection(link.sourceId, link.targetId, source.id, target.id)
    pendingRelationId.value = relation.id
    createOrReuseLink(link.id)
  }

  return {
    showRelationChoiceModal,
    relationChoiceOptions,
    pendingConnection,
    showReuseLinkModal,
    reuseLinkOptions,
    pendingRelationId,
    startConnectNodes,
    connectNodeToEdge,
    finalizeConnection,
    handleCreateNewLinkFromReuseModal,
    handleRequestAutoLink,
    handleSelectExistingLink,
    createOrReuseLink,
    canConnect,
    placeTraceLinkOnDiagram,
    isUntypedLinkTypeId,
    isDiagramOnlyEdgeModelLinkId,
  }
}

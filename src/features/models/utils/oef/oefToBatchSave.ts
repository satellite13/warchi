import type { BatchSaveRequest } from '@/features/models/composables/useModelBatchSave'
import type { DiagramAttrs, DiagramEdgeInstance, DiagramNodeInstance, ModelLinkAttrs, ModelNodeAttrs } from '@/features/models/modelAttrs'
import {
  parseDiagramAttrs,
  serializeDiagramAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs,
} from '@/features/models/modelAttrs'
import type { ImportDraft } from './types'
import type { ImportMappingState } from './mappingState'

const NOTE_NODE_PREFIX = '__diagram-note__:'
const NOTE_EDGE_PREFIX = '__diagram-note-edge__:'

const DEFAULT_NOTE_DIAGRAM_STYLE = {
  nodeShape: 'rectangle',
  fillColor: '#fff9c4',
  strokeColor: '#e6c85b',
  strokeWidth: 1.5,
  labelColor: '#5a4600',
  labelFontSize: 13,
  labelAlign: 'left',
  labelInset: 10,
  labelPlacement: 'center',
} as const

const DEFAULT_NOTE_LINK_DIAGRAM_STYLE = {
  edgeType: 'straight',
  startMarkerType: 'none',
  endMarkerType: 'none',
  lineDash: [4, 4],
} as const

export type OefImportBuildWarningCode =
  | 'nodeTypeNotMapped'
  | 'linkTypeNotMapped'
  | 'linkMissingNode'
  | 'diagramNodeMissingModelNode'
  | 'diagramConnectionMissingModelLink'
  | 'diagramConnectionMissingNodeInstance'

export type OefImportBuildWarning = {
  code: OefImportBuildWarningCode
  message: string
  sourceType?: string
  sourceId?: string
  diagramId?: string
}

export type OefImportBuildResult = {
  request: BatchSaveRequest
  warnings: OefImportBuildWarning[]
  createdCounts: {
    nodes: number
    links: number
    diagrams: number
    diagramNodeInstances: number
    diagramConnectionInstances: number
  }
}

export type BuildOefBatchSaveParams = {
  draft: ImportDraft
  mapping: ImportMappingState
  notationId: string
  parentNodeId?: string | null
  diagramVersion?: string
  force?: boolean
  nodeTypePropertyDefaultsById?: Record<string, Record<string, unknown>>
  componentPropertyDefaultsById?: Record<string, Record<string, unknown>>
  relationPropertyDefaultsById?: Record<string, Record<string, unknown>>
}

function makeStableTempId(prefix: string, sourceId: string, used: Set<string>): string {
  const safeSource = sourceId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
  let candidate = `${prefix}-${safeSource}`
  let index = 1
  while (used.has(candidate)) {
    index += 1
    candidate = `${prefix}-${safeSource}-${index}`
  }
  used.add(candidate)
  return candidate
}

function makeNodeAttrs(
  notationId: string,
  componentId: string,
  treeOrder: number,
  typeProperties: Record<string, unknown>,
  componentDefaults: Record<string, unknown>
): ModelNodeAttrs {
  return {
    treeOrder,
    notationComponents: {
      [notationId]: { componentId },
    },
    componentProperties:
      Object.keys(componentDefaults).length > 0
        ? {
            [notationId]: {
              [componentId]: componentDefaults,
            },
          }
        : {},
    typeProperties,
  }
}

function makeLinkAttrs(
  notationId: string,
  relationId: string,
  relationDefaults: Record<string, unknown>
): ModelLinkAttrs {
  return {
    notationRelations: {
      [notationId]: { relationId },
    },
    relationProperties:
      Object.keys(relationDefaults).length > 0
        ? {
            [notationId]: {
              [relationId]: relationDefaults,
            },
          }
        : {},
  }
}

export function buildOefBatchSaveRequest(params: BuildOefBatchSaveParams): OefImportBuildResult {
  const warnings: OefImportBuildWarning[] = []
  const usedIds = new Set<string>()
  const parentNodeId = params.parentNodeId ?? null
  const diagramVersion = params.diagramVersion ?? '1.0.0'

  const request: BatchSaveRequest = {
    ...(params.force === true ? { force: true } : {}),
    nodes: { create: [], update: [], delete: [] },
    links: { create: [], update: [], delete: [] },
    diagrams: { create: [], update: [], delete: [] },
  }

  const nodeTempBySourceElementId = new Map<string, string>()
  const linkTempBySourceRelationshipId = new Map<string, string>()

  let treeOrder = 0
  for (const node of params.draft.nodes) {
    const mapped = params.mapping.elementTypeMap[node.sourceType]
    if (!mapped?.nodeTypeId || !mapped.componentId) {
      warnings.push({
        code: 'nodeTypeNotMapped',
        sourceType: node.sourceType,
        sourceId: node.sourceElementId,
        message: `No element mapping for source type "${node.sourceType}"`,
      })
      continue
    }
    const tempId = makeStableTempId('oef-node', node.sourceElementId, usedIds)
    treeOrder += 1
    const typeDefaults = params.nodeTypePropertyDefaultsById?.[mapped.nodeTypeId] ?? {}
    const componentDefaults = params.componentPropertyDefaultsById?.[mapped.componentId] ?? {}
    request.nodes.create.push({
      tempId,
      name: node.name,
      nodeTypeId: mapped.nodeTypeId,
      parentNodeId,
      attrs: serializeNodeAttrs(
        makeNodeAttrs(params.notationId, mapped.componentId, treeOrder, typeDefaults, componentDefaults)
      ),
    })
    nodeTempBySourceElementId.set(node.sourceElementId, tempId)
  }

  for (const link of params.draft.links) {
    const mapped = params.mapping.relationshipTypeMap[link.sourceType]
    if (!mapped?.linkTypeId || !mapped.relationId) {
      warnings.push({
        code: 'linkTypeNotMapped',
        sourceType: link.sourceType,
        sourceId: link.sourceRelationshipId,
        message: `No relationship mapping for source type "${link.sourceType}"`,
      })
      continue
    }
    const sourceId = nodeTempBySourceElementId.get(link.sourceElementId)
    const targetId = nodeTempBySourceElementId.get(link.targetElementId)
    if (!sourceId || !targetId) {
      warnings.push({
        code: 'linkMissingNode',
        sourceId: link.sourceRelationshipId,
        message: `Link "${link.sourceRelationshipId}" skipped because source/target node is unavailable`,
      })
      continue
    }
    const tempId = makeStableTempId('oef-link', link.sourceRelationshipId, usedIds)
    const relationDefaults = params.relationPropertyDefaultsById?.[mapped.relationId] ?? {}
    request.links.create.push({
      tempId,
      sourceId,
      targetId,
      linkTypeId: mapped.linkTypeId,
      attrs: serializeLinkAttrs(makeLinkAttrs(params.notationId, mapped.relationId, relationDefaults)),
    })
    linkTempBySourceRelationshipId.set(link.sourceRelationshipId, tempId)
  }

  for (const diagram of params.draft.diagrams) {
    const diagramTempId = makeStableTempId('oef-diagram', diagram.sourceViewId, usedIds)
    const nodeInstanceIdBySourceNodeId = new Map<string, string>()
    const diagramNodes: DiagramAttrs['instances']['nodes'] = []
    const diagramEdges: DiagramAttrs['instances']['edges'] = []

    for (const instance of diagram.nodeInstances) {
      if (instance.isNote) {
        const instanceId = makeStableTempId(
          'oef-inst-note',
          `${diagram.sourceViewId}-${instance.sourceNodeId}`,
          usedIds
        )
        nodeInstanceIdBySourceNodeId.set(instance.sourceNodeId, instanceId)
        const noteInstance: DiagramNodeInstance = {
          id: instanceId,
          modelNodeId: `${NOTE_NODE_PREFIX}${instanceId}`,
          x: instance.x,
          y: instance.y,
          width: typeof instance.width === 'number' ? instance.width : 220,
          height: typeof instance.height === 'number' ? instance.height : 120,
          attrs: {
            isNote: true,
            noteText: instance.noteText?.trim() || 'Заметка',
            diagramStyle: { ...DEFAULT_NOTE_DIAGRAM_STYLE },
          },
        }
        diagramNodes.push(noteInstance)
        continue
      }

      const modelNodeId = nodeTempBySourceElementId.get(instance.sourceElementId)
      if (!modelNodeId) {
        warnings.push({
          code: 'diagramNodeMissingModelNode',
          sourceId: instance.sourceNodeId,
          diagramId: diagram.sourceViewId,
          message: `Diagram node "${instance.sourceNodeId}" skipped because model node is unavailable`,
        })
        continue
      }
      const instanceId = makeStableTempId('oef-inst-node', `${diagram.sourceViewId}-${instance.sourceNodeId}`, usedIds)
      nodeInstanceIdBySourceNodeId.set(instance.sourceNodeId, instanceId)
      diagramNodes.push({
        id: instanceId,
        modelNodeId,
        x: instance.x,
        y: instance.y,
        width: typeof instance.width === 'number' ? instance.width : undefined,
        height: typeof instance.height === 'number' ? instance.height : undefined,
      })
    }

    for (const connection of diagram.connectionInstances) {
      if (connection.isNoteLink) {
        const sourceInstanceId = nodeInstanceIdBySourceNodeId.get(connection.sourceNodeId)
        const targetInstanceId = nodeInstanceIdBySourceNodeId.get(connection.targetNodeId)
        if (!sourceInstanceId || !targetInstanceId) {
          warnings.push({
            code: 'diagramConnectionMissingNodeInstance',
            sourceId: connection.sourceConnectionId,
            diagramId: diagram.sourceViewId,
            message: `Diagram note link "${connection.sourceConnectionId}" skipped because source/target node instance is unavailable`,
          })
          continue
        }
        const edgeInstanceId = makeStableTempId(
          'oef-inst-note-edge',
          `${diagram.sourceViewId}-${connection.sourceConnectionId}`,
          usedIds
        )
        const noteEdge: DiagramEdgeInstance = {
          id: edgeInstanceId,
          modelLinkId: `${NOTE_EDGE_PREFIX}${edgeInstanceId}`,
          sourceInstanceId,
          targetInstanceId,
          attrs: {
            isDiagramOnly: true,
            diagramStyle: { ...DEFAULT_NOTE_LINK_DIAGRAM_STYLE },
          },
        }
        diagramEdges.push(noteEdge)
        continue
      }

      const modelLinkId = linkTempBySourceRelationshipId.get(connection.sourceRelationshipId)
      if (!modelLinkId) {
        warnings.push({
          code: 'diagramConnectionMissingModelLink',
          sourceId: connection.sourceConnectionId,
          diagramId: diagram.sourceViewId,
          message: `Diagram connection "${connection.sourceConnectionId}" skipped because model link is unavailable`,
        })
        continue
      }
      const sourceInstanceId = nodeInstanceIdBySourceNodeId.get(connection.sourceNodeId)
      const targetInstanceId = nodeInstanceIdBySourceNodeId.get(connection.targetNodeId)
      if (!sourceInstanceId || !targetInstanceId) {
        warnings.push({
          code: 'diagramConnectionMissingNodeInstance',
          sourceId: connection.sourceConnectionId,
          diagramId: diagram.sourceViewId,
          message: `Diagram connection "${connection.sourceConnectionId}" skipped because source/target node instance is unavailable`,
        })
        continue
      }
      const edgeInstanceId = makeStableTempId(
        'oef-inst-edge',
        `${diagram.sourceViewId}-${connection.sourceConnectionId}`,
        usedIds
      )
      diagramEdges.push({
        id: edgeInstanceId,
        modelLinkId,
        sourceInstanceId,
        targetInstanceId,
      })
    }

    const diagramAttrs: DiagramAttrs = {
      instances: {
        nodes: diagramNodes,
        edges: diagramEdges,
      },
    }

    request.diagrams.create.push({
      tempId: diagramTempId,
      name: diagram.name,
      version: diagramVersion,
      notationId: params.notationId,
      nodeId: parentNodeId,
      attrs: serializeDiagramAttrs(diagramAttrs),
    })
  }

  return {
    request,
    warnings,
    createdCounts: {
      nodes: request.nodes.create.length,
      links: request.links.create.length,
      diagrams: request.diagrams.create.length,
      diagramNodeInstances: request.diagrams.create.reduce((sum, item) => {
        const attrs = parseDiagramAttrs(item.attrs)
        return sum + attrs.instances.nodes.length
      }, 0),
      diagramConnectionInstances: request.diagrams.create.reduce((sum, item) => {
        const attrs = parseDiagramAttrs(item.attrs)
        return sum + attrs.instances.edges.length
      }, 0),
    },
  }
}

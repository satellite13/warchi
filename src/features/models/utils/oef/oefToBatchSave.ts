import type { BatchSaveRequest } from '@/features/models/composables/useModelBatchSave'
import type {
  DiagramAttrs,
  DiagramEdgeInstance,
  DiagramNodeInstance,
  ModelLinkAttrs,
  ModelNodeAttrs,
} from '@/features/models/modelAttrs'
import {
  parseDiagramAttrs,
  parseNodeAttrs,
  serializeDiagramAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs,
} from '@/features/models/modelAttrs'
import {
  DEFAULT_CONTAINER_DIAGRAM_STYLE,
  DEFAULT_DIAGRAM_ONLY_LINK_STYLE,
  DEFAULT_EDGE_ANCHOR_DIAGRAM_STYLE,
  DIAGRAM_CONTAINER_NODE_PREFIX,
  DIAGRAM_EDGE_ANCHOR_NODE_PREFIX,
  DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX,
  DIAGRAM_NOTE_NODE_PREFIX,
  EDGE_ANCHOR_SIZE,
} from '../diagramOnlyInstances'
import { placeEdgeAnchorAtMidpoint } from '../edgeAnchorSync'
import type { ImportMappingState } from './mappingState'
import { buildOrganizationImportPlan } from './organizationImport'
import type { ImportDraft, ImportDraftDiagramConnectionInstance } from './types'

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

/** Matches arepos BatchNodeCreate/BatchDiagramCreate @Size(max = 255) on name. */
export const OEF_ENTITY_NAME_MAX_LENGTH = 255

export type OefImportBuildWarningCode =
  | 'nodeTypeNotMapped'
  | 'linkTypeNotMapped'
  | 'linkMissingNode'
  | 'diagramNodeMissingModelNode'
  | 'diagramConnectionMissingModelLink'
  | 'diagramConnectionMissingNodeInstance'
  | 'nameTruncated'
  | 'nameDeduplicated'
  | 'relationsBranchSkipped'
  | 'directoryTypeMissing'
  | 'directoryTypeCreated'

export function truncateOefEntityName(name: string, maxLength = OEF_ENTITY_NAME_MAX_LENGTH): string {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength)
}

/**
 * Ensure unique (name, version) within one import batch.
 * DB constraint: diagrams_model_name_version_key.
 */
export function allocateUniqueEntityName(
  rawName: string,
  version: string,
  usedNameVersions: Set<string>,
  fallback = 'Untitled',
  maxLength = OEF_ENTITY_NAME_MAX_LENGTH
): { name: string; deduplicated: boolean } {
  const base = truncateOefEntityName((rawName.trim() || fallback), maxLength)
  const keyFor = (name: string): string => `${name}\0${version}`
  if (!usedNameVersions.has(keyFor(base))) {
    usedNameVersions.add(keyFor(base))
    return { name: base, deduplicated: false }
  }
  let index = 2
  while (true) {
    const suffix = ` (${index})`
    const truncatedBase = truncateOefEntityName(base, Math.max(1, maxLength - suffix.length))
    const candidate = `${truncatedBase}${suffix}`
    if (!usedNameVersions.has(keyFor(candidate))) {
      usedNameVersions.add(keyFor(candidate))
      return { name: candidate, deduplicated: true }
    }
    index += 1
  }
}

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
  /** Directory node type id; required to import organization folders. */
  directoryNodeTypeId?: string | null
  parentNodeId?: string | null
  diagramVersion?: string
  force?: boolean
  nodeTypePropertyDefaultsById?: Record<string, Record<string, unknown>>
  componentPropertyDefaultsById?: Record<string, Record<string, unknown>>
  relationPropertyDefaultsById?: Record<string, Record<string, unknown>>
}

function makeDirectoryAttrs(treeOrder: number): string {
  return serializeNodeAttrs({
    ...parseNodeAttrs(null),
    treeOrder,
  })
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

function estimateEdgeMidpoint(
  diagramNodes: DiagramNodeInstance[],
  hostEdge: DiagramEdgeInstance
): { x: number; y: number } {
  const source = diagramNodes.find(node => node.id === hostEdge.sourceInstanceId)
  const target = diagramNodes.find(node => node.id === hostEdge.targetInstanceId)
  if (!source || !target) {
    return { x: 0, y: 0 }
  }
  const sx = source.x + (source.width ?? 0) / 2
  const sy = source.y + (source.height ?? 0) / 2
  const tx = target.x + (target.width ?? 0) / 2
  const ty = target.y + (target.height ?? 0) / 2
  return { x: (sx + tx) / 2, y: (sy + ty) / 2 }
}

function createDiagramOnlyEdge(
  edgeInstanceId: string,
  sourceInstanceId: string,
  targetInstanceId: string
): DiagramEdgeInstance {
  return {
    id: edgeInstanceId,
    modelLinkId: `${DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX}${edgeInstanceId}`,
    sourceInstanceId,
    targetInstanceId,
    attrs: {
      isDiagramOnly: true,
      diagramStyle: { ...DEFAULT_DIAGRAM_ONLY_LINK_STYLE },
    },
  }
}

export function buildOefBatchSaveRequest(params: BuildOefBatchSaveParams): OefImportBuildResult {
  const warnings: OefImportBuildWarning[] = []
  const usedIds = new Set<string>()
  const parentNodeId = params.parentNodeId ?? null
  const diagramVersion = params.diagramVersion ?? '1.0.0'
  const relationshipIds = new Set(params.draft.links.map(link => link.sourceRelationshipId))

  const request: BatchSaveRequest = {
    ...(params.force === true ? { force: true } : {}),
    nodes: { create: [], update: [], delete: [] },
    links: { create: [], update: [], delete: [] },
    diagrams: { create: [], update: [], delete: [] },
  }

  const nodeTempBySourceElementId = new Map<string, string>()
  const linkTempBySourceRelationshipId = new Map<string, string>()
  const dirTempByKey = new Map<string, string>()
  const usedDiagramNameVersions = new Set<string>()

  const orgPlan = buildOrganizationImportPlan(params.draft.organizations)
  for (const warning of orgPlan.warnings) {
    warnings.push({
      code: 'relationsBranchSkipped',
      message: warning.message,
    })
  }

  const hasOrgFolders = orgPlan.directories.length > 0
  if (hasOrgFolders && !params.directoryNodeTypeId) {
    warnings.push({
      code: 'directoryTypeMissing',
      message: 'Directory node type is required to import organization folders',
    })
  }

  const treeOrderByParent = new Map<string, number>()
  const nextTreeOrder = (parentKey: string | null): number => {
    const key = parentKey ?? '__root__'
    const current = treeOrderByParent.get(key) ?? 0
    treeOrderByParent.set(key, current + 1)
    return current
  }

  if (hasOrgFolders && params.directoryNodeTypeId) {
    for (const dir of orgPlan.directories) {
      // dir.tempKey already has a stable unique prefix from the org planner.
      const tempId = makeStableTempId('dir', dir.tempKey.replace(/^oef-dir-/, ''), usedIds)
      dirTempByKey.set(dir.tempKey, tempId)
      const parentId =
        dir.parentTempKey != null
          ? (dirTempByKey.get(dir.parentTempKey) ?? parentNodeId)
          : parentNodeId
      const name = truncateOefEntityName(dir.name)
      if (name !== dir.name) {
        warnings.push({
          code: 'nameTruncated',
          sourceId: dir.tempKey,
          message: `Directory name truncated to ${OEF_ENTITY_NAME_MAX_LENGTH} characters`,
        })
      }
      request.nodes.create.push({
        tempId,
        name: name || 'Folder',
        nodeTypeId: params.directoryNodeTypeId,
        parentNodeId: parentId,
        attrs: makeDirectoryAttrs(nextTreeOrder(dir.parentTempKey)),
      })
    }
  }

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
    const typeDefaults = params.nodeTypePropertyDefaultsById?.[mapped.nodeTypeId] ?? {}
    const componentDefaults = params.componentPropertyDefaultsById?.[mapped.componentId] ?? {}
    const name = truncateOefEntityName(node.name)
    if (name !== node.name) {
      warnings.push({
        code: 'nameTruncated',
        sourceType: node.sourceType,
        sourceId: node.sourceElementId,
        message: `Node name truncated to ${OEF_ENTITY_NAME_MAX_LENGTH} characters for "${node.sourceElementId}"`,
      })
    }
    const orgParentKey = orgPlan.elementParentTempKey.get(node.sourceElementId)
    const resolvedParent =
      orgParentKey != null && params.directoryNodeTypeId
        ? (dirTempByKey.get(orgParentKey) ?? parentNodeId)
        : parentNodeId
    request.nodes.create.push({
      tempId,
      name: name || node.sourceElementId.slice(0, OEF_ENTITY_NAME_MAX_LENGTH),
      nodeTypeId: mapped.nodeTypeId,
      parentNodeId: resolvedParent,
      attrs: serializeNodeAttrs(
        makeNodeAttrs(
          params.notationId,
          mapped.componentId,
          nextTreeOrder(orgParentKey ?? null),
          typeDefaults,
          componentDefaults
        )
      ),
    })
    nodeTempBySourceElementId.set(node.sourceElementId, tempId)
  }

  for (const link of params.draft.links) {
    const sourceIsRelationship = relationshipIds.has(link.sourceElementId)
    const targetIsRelationship = relationshipIds.has(link.targetElementId)
    if (sourceIsRelationship || targetIsRelationship) {
      // Rel→rel Association: no model link; diagram-only edges are created from views.
      continue
    }

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
    const edgeInstanceIdBySourceConnectionId = new Map<string, string>()
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
          modelNodeId: `${DIAGRAM_NOTE_NODE_PREFIX}${instanceId}`,
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

      if (instance.isContainer) {
        const instanceId = makeStableTempId(
          'oef-inst-container',
          `${diagram.sourceViewId}-${instance.sourceNodeId}`,
          usedIds
        )
        nodeInstanceIdBySourceNodeId.set(instance.sourceNodeId, instanceId)
        diagramNodes.push({
          id: instanceId,
          modelNodeId: `${DIAGRAM_CONTAINER_NODE_PREFIX}${instanceId}`,
          x: instance.x,
          y: instance.y,
          width: typeof instance.width === 'number' ? instance.width : 240,
          height: typeof instance.height === 'number' ? instance.height : 160,
          attrs: {
            isContainer: true,
            containerLabel: instance.containerLabel?.trim() || '',
            diagramStyle: { ...DEFAULT_CONTAINER_DIAGRAM_STYLE },
          },
        })
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
      const instanceId = makeStableTempId(
        'oef-inst-node',
        `${diagram.sourceViewId}-${instance.sourceNodeId}`,
        usedIds
      )
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

    const modelConnections: ImportDraftDiagramConnectionInstance[] = []
    const diagramOnlyConnections: ImportDraftDiagramConnectionInstance[] = []
    for (const connection of diagram.connectionInstances) {
      if (connection.isDiagramOnlyLink || connection.attachesToConnectionId) {
        diagramOnlyConnections.push(connection)
      } else {
        modelConnections.push(connection)
      }
    }

    for (const connection of modelConnections) {
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
      edgeInstanceIdBySourceConnectionId.set(connection.sourceConnectionId, edgeInstanceId)
      diagramEdges.push({
        id: edgeInstanceId,
        modelLinkId,
        sourceInstanceId,
        targetInstanceId,
      })
    }

    for (const connection of diagramOnlyConnections) {
      if (connection.attachesToConnectionId) {
        const hostEdgeId = edgeInstanceIdBySourceConnectionId.get(connection.attachesToConnectionId)
        if (!hostEdgeId) {
          warnings.push({
            code: 'diagramConnectionMissingModelLink',
            sourceId: connection.sourceConnectionId,
            diagramId: diagram.sourceViewId,
            message: `Diagram connection "${connection.sourceConnectionId}" skipped because host connection is unavailable`,
          })
          continue
        }
        const hostEdge = diagramEdges.find(edge => edge.id === hostEdgeId)
        if (!hostEdge) continue

        const nodeEndSourceId =
          connection.attachEndpoint === 'source' ? connection.targetNodeId : connection.sourceNodeId
        const nodeInstanceId = nodeInstanceIdBySourceNodeId.get(nodeEndSourceId)
        if (!nodeInstanceId) {
          warnings.push({
            code: 'diagramConnectionMissingNodeInstance',
            sourceId: connection.sourceConnectionId,
            diagramId: diagram.sourceViewId,
            message: `Diagram connection "${connection.sourceConnectionId}" skipped because node endpoint is unavailable`,
          })
          continue
        }

        const anchorInstanceId = makeStableTempId(
          'oef-inst-anchor',
          `${diagram.sourceViewId}-${connection.sourceConnectionId}`,
          usedIds
        )
        const midpoint = estimateEdgeMidpoint(diagramNodes, hostEdge)
        const anchorBase: DiagramNodeInstance = {
          id: anchorInstanceId,
          modelNodeId: `${DIAGRAM_EDGE_ANCHOR_NODE_PREFIX}${anchorInstanceId}`,
          x: midpoint.x,
          y: midpoint.y,
          width: EDGE_ANCHOR_SIZE,
          height: EDGE_ANCHOR_SIZE,
          attrs: {
            isEdgeAnchor: true,
            hostEdgeInstanceId: hostEdgeId,
            pathParam: 0.5,
            diagramStyle: { ...DEFAULT_EDGE_ANCHOR_DIAGRAM_STYLE },
          },
        }
        diagramNodes.push(placeEdgeAnchorAtMidpoint(anchorBase, midpoint))

        const edgeInstanceId = makeStableTempId(
          'oef-inst-note-edge',
          `${diagram.sourceViewId}-${connection.sourceConnectionId}`,
          usedIds
        )
        const sourceInstanceId =
          connection.attachEndpoint === 'source' ? anchorInstanceId : nodeInstanceId
        const targetInstanceId =
          connection.attachEndpoint === 'source' ? nodeInstanceId : anchorInstanceId
        diagramEdges.push(createDiagramOnlyEdge(edgeInstanceId, sourceInstanceId, targetInstanceId))
        continue
      }

      // Plain diagram-only / note link between two node instances.
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
      diagramEdges.push(createDiagramOnlyEdge(edgeInstanceId, sourceInstanceId, targetInstanceId))
    }

    const diagramAttrs: DiagramAttrs = {
      instances: {
        nodes: diagramNodes,
        edges: diagramEdges,
      },
    }

    if (truncateOefEntityName(diagram.name) !== diagram.name) {
      warnings.push({
        code: 'nameTruncated',
        sourceId: diagram.sourceViewId,
        diagramId: diagram.sourceViewId,
        message: `Diagram name truncated to ${OEF_ENTITY_NAME_MAX_LENGTH} characters for "${diagram.sourceViewId}"`,
      })
    }
    const { name: diagramName, deduplicated } = allocateUniqueEntityName(
      diagram.name,
      diagramVersion,
      usedDiagramNameVersions,
      diagram.sourceViewId
    )
    if (deduplicated) {
      warnings.push({
        code: 'nameDeduplicated',
        sourceId: diagram.sourceViewId,
        diagramId: diagram.sourceViewId,
        message: `Diagram name deduplicated to "${diagramName}" for "${diagram.sourceViewId}"`,
      })
    }
    const viewOrgKey = orgPlan.viewParentTempKey.get(diagram.sourceViewId)
    const diagramParentNodeId =
      viewOrgKey != null && params.directoryNodeTypeId
        ? (dirTempByKey.get(viewOrgKey) ?? parentNodeId)
        : parentNodeId
    request.diagrams.create.push({
      tempId: diagramTempId,
      name: diagramName,
      version: diagramVersion,
      notationId: params.notationId,
      nodeId: diagramParentNodeId,
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

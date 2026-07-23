import type { ComposerTranslation } from 'vue-i18n'
import {
  createId,
  parseEntityAttrs,
  parseTypeAttrs,
} from '@/domain/attrs/notationAttrs'
import { validateCompositeDiagramStyle } from '@/features/notations/utils/validationIssues'
import { mergeShapePackage } from '@/features/notations/utils/notationShapePackage'
import {
  stripShapeDocumentFileId,
  type ExportedNodeShape,
} from '@/features/notations/utils/exportedNodeShape'
import type {
  EditorComponent,
  EditorDiagramLayer,
  EditorLinkType,
  EditorNodeType,
  EditorRelation,
  EditorRelationRule,
  NotationEditorState,
} from '../types'

export type NotationImportResult = {
  state: NotationEditorState
  pendingShapes: ExportedNodeShape[]
}

export type NormalizeNotationImportContext = {
  baseOwnerId: string
  baseNotationId: string
  t: ComposerTranslation
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toStringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback

const toObjectArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

type NotationExportWrapper = Record<string, unknown> & {
  format: string
  state: Record<string, unknown>
}

const hasExportWrapper = (raw: unknown): raw is NotationExportWrapper =>
  isRecord(raw) && typeof raw.format === 'string' && isRecord(raw.state)

const normalizeDiagramLayer = (value: unknown): EditorDiagramLayer => {
  if (!isRecord(value)) return { version: 1, nodes: [], edges: [] }
  const nodes: EditorDiagramLayer['nodes'] = []
  if (Array.isArray(value.nodes)) {
    for (const node of value.nodes) {
      if (!isRecord(node)) continue
      if (
        typeof node.id === 'string' &&
        typeof node.x === 'number' &&
        typeof node.y === 'number' &&
        typeof node.width === 'number' &&
        typeof node.height === 'number'
      ) {
        nodes.push({
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          attrs: isRecord(node.attrs) ? node.attrs : undefined,
        })
      }
    }
  }
  const edges: EditorDiagramLayer['edges'] = []
  if (Array.isArray(value.edges)) {
    for (const edge of value.edges) {
      if (!isRecord(edge)) continue
      if (
        typeof edge.id === 'string' &&
        typeof edge.sourceNodeId === 'string' &&
        typeof edge.targetNodeId === 'string'
      ) {
        edges.push({
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          attrs: isRecord(edge.attrs) ? edge.attrs : undefined,
        })
      }
    }
  }
  return { version: 1, nodes, edges }
}

function parseExportedNodeShape(value: unknown): ExportedNodeShape | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id.trim() === '') return null
  if (typeof value.name !== 'string' || value.name.trim() === '') return null
  if (typeof value.outline !== 'string') return null

  const shape: ExportedNodeShape = {
    id: value.id,
    name: value.name,
    outline: value.outline,
  }

  if (value.contentArea === null) {
    shape.contentArea = null
  } else if (typeof value.contentArea === 'string') {
    shape.contentArea = value.contentArea
  }

  if (value.attrs === null) {
    shape.attrs = null
  } else if (typeof value.attrs === 'string') {
    shape.attrs = value.attrs
  }

  return shape
}

function parseExportedShapesFromRaw(raw: unknown): ExportedNodeShape[] {
  if (!hasExportWrapper(raw) || !Array.isArray(raw.shapes)) return []

  const shapes: ExportedNodeShape[] = []
  for (const item of raw.shapes) {
    const shape = parseExportedNodeShape(item)
    if (shape) shapes.push(shape)
  }
  return shapes
}

export function normalizeNotationImport(
  raw: unknown,
  context: NormalizeNotationImportContext
): NotationImportResult {
  const { baseOwnerId, baseNotationId, t } = context
  const source = isRecord(raw) && isRecord(raw.state) ? raw.state : raw
  if (!isRecord(source)) {
    throw new Error(t('notations.importFormatError'))
  }

  const nodeTypeIdMap = new Map<string, string>()
  const linkTypeIdMap = new Map<string, string>()
  const componentIdMap = new Map<string, string>()
  const relationIdMap = new Map<string, string>()

  const nodeTypes: EditorNodeType[] = toObjectArray(source.nodeTypes).map((item) => {
    const importedId = toStringOr(item.id, createId())
    const id = createId()
    nodeTypeIdMap.set(importedId, id)
    const parsedAttrs = parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId
    return {
      id,
      name: toStringOr(item.name, t('notations.defaultNodeTypeName')),
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      createdAt: null,
      updatedAt: null,
      parsedAttrs,
      _isNew: true,
    }
  })

  const linkTypes: EditorLinkType[] = toObjectArray(source.linkTypes).map((item) => {
    const importedId = toStringOr(item.id, createId())
    const id = createId()
    linkTypeIdMap.set(importedId, id)
    const parsedAttrs = parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId
    return {
      id,
      name: toStringOr(item.name, t('notations.defaultLinkTypeName')),
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      createdAt: null,
      updatedAt: null,
      parsedAttrs,
      _isNew: true,
    }
  })

  if (nodeTypes.length === 0) {
    nodeTypes.push({
      id: createId(),
      name: t('notations.defaultNodeTypeName'),
      ownerId: baseOwnerId,
      parsedAttrs: {},
      _isNew: true,
    })
  }
  if (linkTypes.length === 0) {
    linkTypes.push({
      id: createId(),
      name: t('notations.defaultLinkTypeName'),
      ownerId: baseOwnerId,
      parsedAttrs: {},
      _isNew: true,
    })
  }

  const nodeTypeIds = new Set(nodeTypes.map((item) => item.id))
  const linkTypeIds = new Set(linkTypes.map((item) => item.id))
  const defaultNodeTypeId = nodeTypes[0]!.id
  const defaultLinkTypeId = linkTypes[0]!.id

  const components: EditorComponent[] = toObjectArray(source.components).map((item) => {
    const importedComponentId = toStringOr(item.id, createId())
    const importedNodeTypeId = toStringOr(item.nodeTypeId, defaultNodeTypeId)
    const mappedNodeTypeId = nodeTypeIdMap.get(importedNodeTypeId) ?? importedNodeTypeId
    const id = createId()
    componentIdMap.set(importedComponentId, id)
    const parsedAttrs = parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId
    const issues = validateCompositeDiagramStyle(parsedAttrs.diagramStyle, t)
    const integrityError = issues.find((issue) => issue.code === 'A5_TARGET_NOT_FOUND')
    if (integrityError) {
      throw new Error(integrityError.message)
    }
    return {
      id,
      name: toStringOr(item.name, t('notations.newComponentTitle')),
      version: toStringOr(item.version, '1.0.0'),
      notationId: baseNotationId,
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      nodeTypeId: nodeTypeIds.has(mappedNodeTypeId) ? mappedNodeTypeId : defaultNodeTypeId,
      createdAt: null,
      updatedAt: null,
      parsedAttrs,
      _isNew: true,
      _isDirty: false,
      _isDeleted: false,
    }
  })

  const relations: EditorRelation[] = toObjectArray(source.relations).map((item) => {
    const importedRelationId = toStringOr(item.id, createId())
    const importedLinkTypeId = toStringOr(item.linkTypeId, defaultLinkTypeId)
    const mappedLinkTypeId = linkTypeIdMap.get(importedLinkTypeId) ?? importedLinkTypeId
    const id = createId()
    relationIdMap.set(importedRelationId, id)
    const parsedAttrs = parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId
    return {
      id,
      name: toStringOr(item.name, t('notations.defaultRelationName')),
      version: toStringOr(item.version, '1.0.0'),
      notationId: baseNotationId,
      ownerId: toStringOr(item.ownerId, baseOwnerId),
      linkTypeId: linkTypeIds.has(mappedLinkTypeId) ? mappedLinkTypeId : defaultLinkTypeId,
      createdAt: null,
      updatedAt: null,
      parsedAttrs,
      _isNew: true,
      _isDirty: false,
      _isDeleted: false,
    }
  })

  const relationRules: EditorRelationRule[] = toObjectArray(source.relationRules).reduce<
    EditorRelationRule[]
  >((acc, item) => {
    const importedFromId = toStringOr(item.fromComponentId, '')
    const importedToId = toStringOr(item.toComponentId, '')
    const fromComponentId = componentIdMap.get(importedFromId)
    const toComponentId = componentIdMap.get(importedToId)
    if (!fromComponentId || !toComponentId) return acc

    const rawRelationIds = Array.isArray(item.allowedRelationIds)
      ? item.allowedRelationIds
      : Array.isArray(item.allowedLinkTypeIds)
        ? item.allowedLinkTypeIds
        : []

    const allowedRelationIds = Array.from(
      new Set(
        rawRelationIds
          .filter((relationId): relationId is string => typeof relationId === 'string')
          .map((relationId) => relationIdMap.get(relationId) ?? relationId)
          .filter((relationId) => relations.some((relation) => relation.id === relationId))
      )
    )

    acc.push({
      id: createId(),
      fromComponentId,
      toComponentId,
      allowedRelationIds,
      _isNew: true,
      _isDirty: false,
      _isDeleted: false,
    })
    return acc
  }, [])

  const importedLayerRaw =
    (isRecord(source.diagramLayer) ? source.diagramLayer : null) ??
    (isRecord(source.editorDiagramLayer) ? source.editorDiagramLayer : null)

  const parsedShapes = parseExportedShapesFromRaw(raw)
  const pendingShapes = mergeShapePackage(
    parsedShapes.map(stripShapeDocumentFileId),
    components
  )

  return {
    state: {
      notationId: baseNotationId,
      ownerId: baseOwnerId,
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules,
      diagramLayer: normalizeDiagramLayer(importedLayerRaw),
    },
    pendingShapes,
  }
}

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
import { createEmptyEditorState } from '../types'

export type NotationImportResult = {
  state: NotationEditorState
  pendingShapes: ExportedNodeShape[]
}

export type LocalOnlyPolicy = 'keep' | 'delete'

export type NormalizeNotationImportContext = {
  baseOwnerId: string
  baseNotationId: string
  t: ComposerTranslation
  /** Current editor state to merge into. Empty/absent → create all as new. */
  baseState?: NotationEditorState
  /** What to do with entities present locally but missing from the import file. */
  localOnlyPolicy?: LocalOnlyPolicy
}

export type NotationImportLocalOnlySummary = {
  componentNames: string[]
  relationNames: string[]
  total: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toStringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback

const toObjectArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const nameKey = (name: string): string => name.trim().toLowerCase()

type NotationExportWrapper = Record<string, unknown> & {
  format: string
  state: Record<string, unknown>
}

const hasExportWrapper = (raw: unknown): raw is NotationExportWrapper =>
  isRecord(raw) && typeof raw.format === 'string' && isRecord(raw.state)

function getImportSource(
  raw: unknown,
  t: ComposerTranslation
): Record<string, unknown> {
  const source = isRecord(raw) && isRecord(raw.state) ? raw.state : raw
  if (!isRecord(source)) {
    throw new Error(t('notations.importFormatError'))
  }
  return source
}

const normalizeDiagramLayer = (
  value: unknown,
  idRemap?: Map<string, string>
): EditorDiagramLayer => {
  if (!isRecord(value)) return { version: 1, nodes: [], edges: [] }
  const remap = (id: string): string => idRemap?.get(id) ?? id

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
          id: remap(node.id),
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
          id: remap(edge.id),
          sourceNodeId: remap(edge.sourceNodeId),
          targetNodeId: remap(edge.targetNodeId),
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

export function collectImportShapes(
  raw: unknown,
  components: EditorComponent[]
): ExportedNodeShape[] {
  const parsedShapes = parseExportedShapesFromRaw(raw)
  const activeComponents = components.filter((c) => !c._isDeleted)
  return mergeShapePackage(parsedShapes.map(stripShapeDocumentFileId), activeComponents)
}

export function collectImportShapesFromRaw(
  raw: unknown,
  t: ComposerTranslation
): ExportedNodeShape[] {
  const { pendingShapes } = normalizeNotationImport(raw, {
    baseOwnerId: 'preview',
    baseNotationId: 'preview',
    t,
    baseState: createEmptyEditorState(),
    localOnlyPolicy: 'keep',
  })
  return pendingShapes
}

function claimByName<T extends { id: string; name: string; _isDeleted?: boolean }>(
  pool: T[],
  claimed: Set<string>,
  importedName: string
): T | undefined {
  const key = nameKey(importedName)
  if (!key) return undefined
  return pool.find(
    (item) => !item._isDeleted && !claimed.has(item.id) && nameKey(item.name) === key
  )
}

function collectImportedNames(items: Record<string, unknown>[], fallback: string): Set<string> {
  const names = new Set<string>()
  for (const item of items) {
    names.add(nameKey(toStringOr(item.name, fallback)))
  }
  return names
}

/**
 * Lists non-deleted local components/relations whose names are absent from the import file.
 */
export function analyzeNotationImportLocalOnly(
  raw: unknown,
  baseState: NotationEditorState,
  t: ComposerTranslation
): NotationImportLocalOnlySummary {
  const source = getImportSource(raw, t)
  const importedComponentNames = collectImportedNames(
    toObjectArray(source.components),
    t('notations.newComponentTitle')
  )
  const importedRelationNames = collectImportedNames(
    toObjectArray(source.relations),
    t('notations.defaultRelationName')
  )

  const componentNames = baseState.components
    .filter((c) => !c._isDeleted && !importedComponentNames.has(nameKey(c.name)))
    .map((c) => c.name)
  const relationNames = baseState.relations
    .filter((r) => !r._isDeleted && !importedRelationNames.has(nameKey(r.name)))
    .map((r) => r.name)

  return {
    componentNames,
    relationNames,
    total: componentNames.length + relationNames.length,
  }
}

export function normalizeNotationImport(
  raw: unknown,
  context: NormalizeNotationImportContext
): NotationImportResult {
  const {
    baseOwnerId,
    baseNotationId,
    t,
    baseState = createEmptyEditorState(),
    localOnlyPolicy = 'keep',
  } = context
  const source = getImportSource(raw, t)

  const nodeTypeIdMap = new Map<string, string>()
  const linkTypeIdMap = new Map<string, string>()
  const componentIdMap = new Map<string, string>()
  const relationIdMap = new Map<string, string>()

  const claimedNodeTypeIds = new Set<string>()
  const claimedLinkTypeIds = new Set<string>()
  const claimedComponentIds = new Set<string>()
  const claimedRelationIds = new Set<string>()

  const nodeTypes: EditorNodeType[] = []
  for (const item of toObjectArray(source.nodeTypes)) {
    const importedId = toStringOr(item.id, createId())
    const name = toStringOr(item.name, t('notations.defaultNodeTypeName'))
    const parsedAttrs = parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId

    const existing = claimByName(baseState.nodeTypes, claimedNodeTypeIds, name)
    if (existing) {
      claimedNodeTypeIds.add(existing.id)
      nodeTypeIdMap.set(importedId, existing.id)
      // Reuse catalog type id; keep local attrs (types are not updated on Save).
      nodeTypes.push({ ...existing })
    } else {
      const id = createId()
      nodeTypeIdMap.set(importedId, id)
      nodeTypes.push({
        id,
        name,
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true,
      })
    }
  }

  const linkTypes: EditorLinkType[] = []
  for (const item of toObjectArray(source.linkTypes)) {
    const importedId = toStringOr(item.id, createId())
    const name = toStringOr(item.name, t('notations.defaultLinkTypeName'))
    const parsedAttrs = parseTypeAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId

    const existing = claimByName(baseState.linkTypes, claimedLinkTypeIds, name)
    if (existing) {
      claimedLinkTypeIds.add(existing.id)
      linkTypeIdMap.set(importedId, existing.id)
      linkTypes.push({ ...existing })
    } else {
      const id = createId()
      linkTypeIdMap.set(importedId, id)
      linkTypes.push({
        id,
        name,
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true,
      })
    }
  }

  // Keep unmatched local types (shared catalog rows used by the editor).
  for (const local of baseState.nodeTypes) {
    if (!claimedNodeTypeIds.has(local.id)) {
      nodeTypes.push({ ...local })
    }
  }
  for (const local of baseState.linkTypes) {
    if (!claimedLinkTypeIds.has(local.id)) {
      linkTypes.push({ ...local })
    }
  }

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

  const components: EditorComponent[] = []
  for (const item of toObjectArray(source.components)) {
    const importedComponentId = toStringOr(item.id, createId())
    const name = toStringOr(item.name, t('notations.newComponentTitle'))
    const importedNodeTypeId = toStringOr(item.nodeTypeId, defaultNodeTypeId)
    const mappedNodeTypeId = nodeTypeIdMap.get(importedNodeTypeId) ?? importedNodeTypeId
    const nodeTypeId = nodeTypeIds.has(mappedNodeTypeId) ? mappedNodeTypeId : defaultNodeTypeId
    const parsedAttrs = parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId
    const issues = validateCompositeDiagramStyle(parsedAttrs.diagramStyle, t)
    const integrityError = issues.find((issue) => issue.code === 'A5_TARGET_NOT_FOUND')
    if (integrityError) {
      throw new Error(integrityError.message)
    }

    const existing = claimByName(baseState.components, claimedComponentIds, name)
    if (existing) {
      claimedComponentIds.add(existing.id)
      componentIdMap.set(importedComponentId, existing.id)
      components.push({
        ...existing,
        name,
        version: toStringOr(item.version, existing.version || '1.0.0'),
        notationId: baseNotationId,
        ownerId: baseOwnerId,
        nodeTypeId,
        parsedAttrs,
        _isNew: existing._isNew === true,
        _isDirty: existing._isNew === true ? false : true,
        _isDeleted: false,
      })
    } else {
      const id = createId()
      componentIdMap.set(importedComponentId, id)
      components.push({
        id,
        name,
        version: toStringOr(item.version, '1.0.0'),
        notationId: baseNotationId,
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        nodeTypeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true,
        _isDirty: false,
        _isDeleted: false,
      })
    }
  }

  for (const local of baseState.components) {
    if (claimedComponentIds.has(local.id)) continue
    if (localOnlyPolicy === 'delete') {
      if (local._isNew) continue
      components.push({ ...local, _isDeleted: true })
    } else {
      components.push({ ...local })
    }
  }

  const relations: EditorRelation[] = []
  for (const item of toObjectArray(source.relations)) {
    const importedRelationId = toStringOr(item.id, createId())
    const name = toStringOr(item.name, t('notations.defaultRelationName'))
    const importedLinkTypeId = toStringOr(item.linkTypeId, defaultLinkTypeId)
    const mappedLinkTypeId = linkTypeIdMap.get(importedLinkTypeId) ?? importedLinkTypeId
    const linkTypeId = linkTypeIds.has(mappedLinkTypeId) ? mappedLinkTypeId : defaultLinkTypeId
    const parsedAttrs = parseEntityAttrs(JSON.stringify(item.parsedAttrs ?? {}))
    delete parsedAttrs.documentFileId

    const existing = claimByName(baseState.relations, claimedRelationIds, name)
    if (existing) {
      claimedRelationIds.add(existing.id)
      relationIdMap.set(importedRelationId, existing.id)
      relations.push({
        ...existing,
        name,
        version: toStringOr(item.version, existing.version || '1.0.0'),
        notationId: baseNotationId,
        ownerId: baseOwnerId,
        linkTypeId,
        parsedAttrs,
        _isNew: existing._isNew === true,
        _isDirty: existing._isNew === true ? false : true,
        _isDeleted: false,
      })
    } else {
      const id = createId()
      relationIdMap.set(importedRelationId, id)
      relations.push({
        id,
        name,
        version: toStringOr(item.version, '1.0.0'),
        notationId: baseNotationId,
        ownerId: toStringOr(item.ownerId, baseOwnerId),
        linkTypeId,
        createdAt: null,
        updatedAt: null,
        parsedAttrs,
        _isNew: true,
        _isDirty: false,
        _isDeleted: false,
      })
    }
  }

  for (const local of baseState.relations) {
    if (claimedRelationIds.has(local.id)) continue
    if (localOnlyPolicy === 'delete') {
      if (local._isNew) continue
      relations.push({ ...local, _isDeleted: true })
    } else {
      relations.push({ ...local })
    }
  }

  const activeComponentIds = new Set(
    components.filter((c) => !c._isDeleted).map((c) => c.id)
  )
  const activeRelationIds = new Set(
    relations.filter((r) => !r._isDeleted).map((r) => r.id)
  )

  const claimedRuleKeys = new Set<string>()
  const relationRules: EditorRelationRule[] = []

  const rulePairKey = (fromId: string, toId: string): string => `${fromId}\0${toId}`

  for (const item of toObjectArray(source.relationRules)) {
    const importedFromId = toStringOr(item.fromComponentId, '')
    const importedToId = toStringOr(item.toComponentId, '')
    const fromComponentId = componentIdMap.get(importedFromId)
    const toComponentId = componentIdMap.get(importedToId)
    if (!fromComponentId || !toComponentId) continue
    if (!activeComponentIds.has(fromComponentId) || !activeComponentIds.has(toComponentId)) {
      continue
    }

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
          .filter((relationId) => activeRelationIds.has(relationId))
      )
    )

    const pairKey = rulePairKey(fromComponentId, toComponentId)
    claimedRuleKeys.add(pairKey)

    const existing = baseState.relationRules.find(
      (rule) =>
        !rule._isDeleted &&
        rule.fromComponentId === fromComponentId &&
        rule.toComponentId === toComponentId
    )

    if (existing) {
      relationRules.push({
        ...existing,
        allowedRelationIds,
        _isNew: existing._isNew === true,
        _isDirty: existing._isNew === true ? false : true,
        _isDeleted: false,
      })
    } else {
      relationRules.push({
        id: createId(),
        fromComponentId,
        toComponentId,
        allowedRelationIds,
        _isNew: true,
        _isDirty: false,
        _isDeleted: false,
      })
    }
  }

  for (const local of baseState.relationRules) {
    const pairKey = rulePairKey(local.fromComponentId, local.toComponentId)
    if (claimedRuleKeys.has(pairKey)) continue

    const endpointsAlive =
      activeComponentIds.has(local.fromComponentId) &&
      activeComponentIds.has(local.toComponentId)

    if (localOnlyPolicy === 'delete' || !endpointsAlive) {
      if (local._isNew) continue
      relationRules.push({ ...local, _isDeleted: true })
    } else {
      relationRules.push({
        ...local,
        allowedRelationIds: local.allowedRelationIds.filter((id) => activeRelationIds.has(id)),
      })
    }
  }

  const importedLayerRaw =
    (isRecord(source.diagramLayer) ? source.diagramLayer : null) ??
    (isRecord(source.editorDiagramLayer) ? source.editorDiagramLayer : null)

  // Remap diagram element ids that refer to imported component ids.
  const diagramIdRemap = new Map(componentIdMap)

  const pendingShapes = collectImportShapes(raw, components)

  return {
    state: {
      notationId: baseNotationId,
      ownerId: baseOwnerId,
      nodeTypes,
      linkTypes,
      components,
      relations,
      relationRules,
      diagramLayer: normalizeDiagramLayer(importedLayerRaw, diagramIdRemap),
    },
    pendingShapes,
  }
}

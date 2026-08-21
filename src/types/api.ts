// API response/request types

// ── Base types ──

/** Common fields on all entity responses */
export interface BaseEntityResponse {
  id: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

/** Common request fields for versioned entities (Model, Notation) */
export interface VersionedEntityRequest {
  name: string
  version: string
  ownerId: string
  attrs?: string | null
}

/** Common update fields for versioned entities */
export interface VersionedEntityUpdateRequest {
  name?: string | null
  version?: string | null
  ownerId?: string | null
  attrs?: string | null
}

/** Common response fields for versioned entities */
export interface VersionedEntityResponse extends BaseEntityResponse {
  name: string
  version: string
  ownerId: string
}

/** Common fields for owned type entities (NodeType, LinkType) */
export interface OwnedTypeRequest {
  name: string
  ownerId?: string | null
  attrs?: string | null
}

export interface OwnedTypeUpdateRequest {
  name?: string | null
  ownerId?: string | null
  attrs?: string | null
}

export interface OwnedTypeResponse extends BaseEntityResponse {
  name: string
  ownerId: string
  ownerEmail?: string | null
  ownerDisplayName?: string | null
  accessPermission?: 'OWNER' | 'EDIT' | 'VIEW' | 'ADMIN' | null
}

// ── Users ──

export interface UserRequest {
  email: string
  attrs?: string | null
}

export interface UserUpdateRequest {
  email?: string | null
  attrs?: string | null
}

// ── Models ──

export type ModelRequest = VersionedEntityRequest

export type ModelUpdateRequest = VersionedEntityUpdateRequest

// ── Diagrams ──

export interface DiagramResponse extends BaseEntityResponse {
  name: string
  version: string
  ownerId: string
  modelId: string
  nodeId?: string | null
  notationId: string
}

export interface DiagramRequest {
  name: string
  version: string
  ownerId: string
  modelId: string
  nodeId?: string | null
  notationId: string
  attrs?: string | null
}

export interface DiagramUpdateRequest {
  name?: string | null
  version?: string | null
  ownerId?: string | null
  modelId?: string | null
  nodeId?: string | null
  notationId?: string | null
  attrs?: string | null
}

/** GET /diagram-locks; POST …/acquire — всегда 200, при занятости чужим `reason: LOCKED_BY_OTHER` */
export interface DiagramLockStatusResponse {
  diagramId: string
  isLocked: boolean
  lockedByUserId?: string | null
  lockedByDisplay?: string | null
  expiresAt?: string | null
  diagramUpdatedAt?: string | null
  reason?: string | null
}

// ── Nodes ──

export interface NodeResponse extends BaseEntityResponse {
  /** Сквозной id: не меняется при копировании модели, для сопоставления узлов между версиями */
  stableId?: string
  name: string
  modelId: string
  ownerId: string
  nodeTypeId: string
  parentNodeId?: string | null
  /** Вычисляется для parent-scoped tree/ancestor ответов; в остальных ответах отсутствует. */
  hasChildren?: boolean | null
}

export interface NodeRequest {
  name: string
  modelId: string
  ownerId: string
  nodeTypeId: string
  parentNodeId?: string | null
  attrs?: string | null
}

export interface NodeUpdateRequest {
  name?: string | null
  modelId?: string | null
  ownerId?: string | null
  nodeTypeId?: string | null
  parentNodeId?: string | null
  attrs?: string | null
}

// ── Relations ──

export interface RelationResponse extends VersionedEntityResponse {
  notationId: string
  linkTypeId: string
}

export interface RelationRequest extends VersionedEntityRequest {
  notationId: string
  linkTypeId: string
}

export interface RelationUpdateRequest extends VersionedEntityUpdateRequest {
  notationId?: string | null
  linkTypeId?: string | null
}

// ── Components ──

export interface ComponentResponse extends VersionedEntityResponse {
  notationId: string
  nodeTypeId: string
}

export interface ComponentRequest extends VersionedEntityRequest {
  notationId: string
  nodeTypeId: string
}

export interface ComponentUpdateRequest extends VersionedEntityUpdateRequest {
  notationId?: string | null
  nodeTypeId?: string | null
}

// ── Links ──

export interface LinkResponse extends BaseEntityResponse {
  /** Сквозной id: не меняется при копировании модели */
  stableId?: string
  sourceId: string
  targetId: string
  modelId: string
  ownerId: string
  linkTypeId: string
}

export interface LinkRequest {
  sourceId: string
  targetId: string
  modelId: string
  ownerId: string
  linkTypeId: string
  attrs?: string | null
}

export interface LinkUpdateRequest {
  sourceId?: string | null
  targetId?: string | null
  modelId?: string | null
  ownerId?: string | null
  linkTypeId?: string | null
  attrs?: string | null
}

// ── Scoped model reads ──

export interface ModelNodeResolveRequest {
  nodeIds: string[]
}

export interface ModelNodeResolveResponse {
  nodes: NodeResponse[]
  missingIds: string[]
}

export interface ModelLinkResolveRequest {
  linkIds: string[]
  endpointNodeIds: string[]
}

export interface ModelLinkResolveResponse {
  links: LinkResponse[]
  missingLinkIds: string[]
}

export interface ModelSearchHit {
  kind: 'node' | 'link' | 'diagram'
  id: string
  name?: string | null
  typeName?: string | null
  parentId?: string | null
  sourceId?: string | null
  targetId?: string | null
  sourceName?: string | null
  targetName?: string | null
  notationName?: string | null
}

export interface ModelSearchResponse {
  modelId: string
  q: string
  limit: number
  totalEstimate: number
  hits: ModelSearchHit[]
}

export interface GraphNeighborResponse {
  link: LinkResponse
  node: NodeResponse
}

// ── Notations ──

export type NotationRequest = VersionedEntityRequest

export type NotationUpdateRequest = VersionedEntityUpdateRequest

export type NotationResponse = VersionedEntityResponse

export interface NotationMetaResponse {
  id: string
  name: string
  version: string
  ownerId: string
  ownerEmail: string
  ownerDisplayName: string
  deleted?: boolean
}

// ── Node Types ──

export type NodeTypeResponse = OwnedTypeResponse

export type NodeTypeRequest = OwnedTypeRequest

export type NodeTypeUpdateRequest = OwnedTypeUpdateRequest

// ── Link Types ──

export type LinkTypeResponse = OwnedTypeResponse

export type LinkTypeRequest = OwnedTypeRequest

export type LinkTypeUpdateRequest = OwnedTypeUpdateRequest

// ── Node Shapes (custom node outline catalog) ──

export interface NodeShapeResponse extends BaseEntityResponse {
  name: string
  ownerId: string
  outline: string | null
  contentArea?: string | null
  accessPermission?: 'OWNER' | 'EDIT' | 'VIEW' | 'ADMIN' | null
}

export interface NodeShapeRequest {
  name: string
  outline?: string | null
  contentArea?: string | null
  attrs?: string | null
}

export interface NodeShapeUpdateRequest {
  name?: string | null
  outline?: string | null
  contentArea?: string | null
  attrs?: string | null
}

// ── Validation Scripts ──

export interface ValidationScriptResponse extends BaseEntityResponse {
  name: string
  description?: string | null
  source: string
  ownerId: string
  accessPermission?: 'OWNER' | 'EDIT' | 'VIEW' | 'ADMIN' | null
}

export interface ValidationScriptRequest {
  name: string
  description?: string | null
  source: string
  attrs?: string | null
}

export interface ValidationScriptUpdateRequest {
  name?: string | null
  description?: string | null
  source?: string | null
  attrs?: string | null
}

// ── Relation Rules ──

export interface RelationRuleResponse extends BaseEntityResponse {
  relationId: string
  fromComponentId: string
  toComponentId: string
  ownerId: string
}

export interface RelationRuleRequest {
  relationId: string
  fromComponentId: string
  toComponentId: string
  ownerId: string
  attrs?: string | null
}

export interface RelationRuleUpdateRequest {
  relationId?: string | null
  fromComponentId?: string | null
  toComponentId?: string | null
  ownerId?: string | null
  attrs?: string | null
}

// ── Audit Log ──

export interface AuditLogResponse {
  id: string
  tableName: string
  operation: string
  rowId: string
  oldValues?: string | null
  newValues?: string | null
  changedById?: string | null
  changedAt?: string | null
}

// ── Permissions ──

export type PermissionResourceType =
  | 'MODEL'
  | 'NOTATION'
  | 'DIAGRAM'
  | 'NODE_TYPE'
  | 'LINK_TYPE'
  | 'NODE_SHAPE'
  | 'VALIDATION_SCRIPT'
  | 'FILE'
  | 'SHARE'
  | 'ADMIN_PANEL'
export type PermissionAction = 'VIEW' | 'EDIT' | 'MANAGE'

export interface PermissionCheckRequest {
  resourceType: PermissionResourceType
  resourceId: string
  actions: PermissionAction[]
}

export interface PermissionCheckResponse {
  resourceType: PermissionResourceType
  resourceId: string
  decisions: Record<string, boolean>
}

// ── Access shares ──

export type ShareResourceType = 'MODEL' | 'NOTATION' | 'NODE_TYPE' | 'LINK_TYPE' | 'NODE_SHAPE' | 'VALIDATION_SCRIPT'
export type SharePermission = 'VIEW' | 'EDIT'

export interface AccessShareRequest {
  resourceType: ShareResourceType
  resourceId: string
  granteeUserId?: string | null
  permission: SharePermission
}

export interface AccessShareResponse {
  id: string
  resourceType: ShareResourceType
  resourceId: string
  granteeUserId?: string | null
  grantedByUserId: string
  permission: SharePermission
  createdAt?: string | null
  updatedAt?: string | null
}

// ── Files ──

export interface FileUploadResponse {
  id: string
  url: string
  filename: string
  contentType: string
  size: number
}

export interface UploadMarkdownRequest {
  content: string
  filename?: string
}

export interface FileVersionResponse {
  versionNumber: number
  createdAt: string
  createdBy: string
  size: number
}

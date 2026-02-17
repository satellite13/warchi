// API response/request types

// Users

export interface UserRequest {
  email: string
  attrs?: string | null
}

export interface UserUpdateRequest {
  email?: string | null
  attrs?: string | null
}

// Models

export interface ModelRequest {
  name: string
  version: string
  ownerId: string
  attrs?: string | null
}

export interface ModelUpdateRequest {
  name?: string | null
  version?: string | null
  ownerId?: string | null
  attrs?: string | null
}

// Diagrams

export interface DiagramResponse {
  id: string
  name: string
  version: string
  ownerId: string
  modelId: string
  nodeId?: string | null
  notationId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
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

// Nodes

export interface NodeResponse {
  id: string
  name: string
  modelId: string
  ownerId: string
  nodeTypeId: string
  parentNodeId?: string | null
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
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

// Relations

export interface RelationResponse {
  id: string
  name: string
  version: string
  notationId: string
  ownerId: string
  linkTypeId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface RelationRequest {
  name: string
  version: string
  notationId: string
  ownerId: string
  linkTypeId: string
  attrs?: string | null
}

export interface RelationUpdateRequest {
  name?: string | null
  version?: string | null
  notationId?: string | null
  ownerId?: string | null
  linkTypeId?: string | null
  attrs?: string | null
}

// Components

export interface ComponentResponse {
  id: string
  name: string
  version: string
  notationId: string
  ownerId: string
  nodeTypeId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface ComponentRequest {
  name: string
  version: string
  notationId: string
  ownerId: string
  nodeTypeId: string
  attrs?: string | null
}

export interface ComponentUpdateRequest {
  name?: string | null
  version?: string | null
  notationId?: string | null
  ownerId?: string | null
  nodeTypeId?: string | null
  attrs?: string | null
}

// Links

export interface LinkResponse {
  id: string
  sourceId: string
  targetId: string
  modelId: string
  ownerId: string
  linkTypeId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
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

// Notations

export interface NotationRequest {
  name: string
  version: string
  ownerId: string
  attrs?: string | null
}

export interface NotationUpdateRequest {
  name?: string | null
  version?: string | null
  ownerId?: string | null
  attrs?: string | null
}

// Node Types

export interface NodeTypeResponse {
  id: string
  name: string
  ownerId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface NodeTypeRequest {
  name: string
  ownerId: string
  attrs?: string | null
}

export interface NodeTypeUpdateRequest {
  name?: string | null
  ownerId?: string | null
  attrs?: string | null
}

// Link Types

export interface LinkTypeResponse {
  id: string
  name: string
  ownerId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface LinkTypeRequest {
  name: string
  ownerId: string
  attrs?: string | null
}

export interface LinkTypeUpdateRequest {
  name?: string | null
  ownerId?: string | null
  attrs?: string | null
}

// Relation Rules

export interface RelationRuleResponse {
  id: string
  relationId: string
  fromComponentId: string
  toComponentId: string
  ownerId: string
  attrs?: string | null
  createdAt?: string | null
  updatedAt?: string | null
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

// Audit Log

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

// Error

export interface ApiError {
  status: number
  message: string
  timestamp: string
}

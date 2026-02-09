// API response/request types for node-types, link-types, components, relations

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

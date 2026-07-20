export type OefModel = {
  id: string
  name: string
}

export type OefElement = {
  id: string
  type: string
  name: string
}

export type OefRelationship = {
  id: string
  type: string
  sourceElementId: string
  targetElementId: string
}

export type OefViewNode = {
  id: string
  elementId: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  /** Text of ArchiMate diagram Label (sticky note). */
  labelText?: string
}

export type OefViewConnection = {
  id: string
  relationshipId: string
  sourceNodeId: string
  targetNodeId: string
  type: string
}

export type OefView = {
  id: string
  type: string
  name: string
  nodes: OefViewNode[]
  connections: OefViewConnection[]
}

export type OefParsedModel = {
  model: OefModel
  elements: OefElement[]
  relationships: OefRelationship[]
  views: OefView[]
}

export type ImportDraftNode = {
  sourceElementId: string
  sourceType: string
  name: string
}

export type ImportDraftLink = {
  sourceRelationshipId: string
  sourceType: string
  sourceElementId: string
  targetElementId: string
}

export type ImportDraftDiagramNodeInstance = {
  sourceNodeId: string
  sourceElementId: string
  x: number
  y: number
  width?: number
  height?: number
  isNote?: boolean
  noteText?: string
  isContainer?: boolean
  containerLabel?: string
}

export type ImportDraftDiagramConnectionInstance = {
  sourceConnectionId: string
  sourceRelationshipId: string
  sourceNodeId: string
  targetNodeId: string
  isNoteLink?: boolean
  /** One endpoint is another view connection (line-on-line). */
  attachesToConnectionId?: string
  /** Which endpoint attaches to the host connection. */
  attachEndpoint?: 'source' | 'target'
  /** Skip creating a model link; keep as diagram-only edge (rel→rel Association etc.). */
  isDiagramOnlyLink?: boolean
}

export type ImportDraftDiagram = {
  sourceViewId: string
  sourceType: string
  name: string
  nodeInstances: ImportDraftDiagramNodeInstance[]
  connectionInstances: ImportDraftDiagramConnectionInstance[]
}

export type ImportDraft = {
  sourceModelId: string
  sourceModelName: string
  nodes: ImportDraftNode[]
  links: ImportDraftLink[]
  diagrams: ImportDraftDiagram[]
  sourceElementTypes: string[]
  sourceRelationshipTypes: string[]
}

export type ImportIssueLevel = 'warning' | 'error'

export type ImportIssueCode =
  | 'duplicateElementId'
  | 'duplicateRelationshipId'
  | 'duplicateViewId'
  | 'duplicateViewNodeId'
  | 'duplicateViewConnectionId'
  | 'missingElementType'
  | 'missingRelationshipType'
  | 'relationshipMissingSource'
  | 'relationshipMissingTarget'
  | 'relationshipEndpointIsRelationship'
  | 'viewNodeMissingElementRef'
  | 'viewConnectionMissingRelationshipRef'
  | 'viewConnectionMissingSourceNode'
  | 'viewConnectionMissingTargetNode'
  | 'viewNodeMissingCoordinates'

export type ImportIssue = {
  code: ImportIssueCode
  level: ImportIssueLevel
  message: string
  entityId?: string
  viewId?: string
}

export type ImportValidationResult = {
  issues: ImportIssue[]
  hasErrors: boolean
}

export type ValidationIssueLevel = 'error' | 'warn' | 'info'

export type ValidationIssueTargetKind = 'node' | 'link' | 'diagram' | 'folder'

export type ValidationIssueTarget = {
  kind: ValidationIssueTargetKind
  id: string
}

export type ValidationIssue = {
  level: ValidationIssueLevel
  message: string
  target?: ValidationIssueTarget
}

export type SnapshotNode = {
  id: string
  name: string
  parentId: string | null
  nodeTypeId: string
  attrs: Record<string, unknown> | null
}

export type SnapshotLink = {
  id: string
  name: string
  sourceId: string
  targetId: string
  linkTypeId: string
  attrs: Record<string, unknown> | null
}

export type SnapshotFolder = {
  id: string
  name: string
  parentId: string | null
}

export type SnapshotDiagramInstance = {
  id: string
  modelNodeId: string
  x: number
  y: number
  width?: number
  height?: number
}

export type SnapshotDiagramEdge = {
  id: string
  modelLinkId: string
  sourceInstanceId: string
  targetInstanceId: string
}

export type SnapshotDiagram = {
  id: string
  name: string
  version: string
  notationId: string
  nodeIds: string[]
  linkIds: string[]
  instances?: SnapshotDiagramInstance[]
  edges?: SnapshotDiagramEdge[]
}

export type SnapshotComponent = {
  id: string
  name: string
  notationId: string
  nodeTypeId: string
}

export type SnapshotRelation = {
  id: string
  name: string
  notationId: string
  linkTypeId: string
}

export type SnapshotRelationRule = {
  id: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}

export type SnapshotNotation = {
  id: string
  name: string
  version: string
  components: SnapshotComponent[]
  relations: SnapshotRelation[]
  relationRules: SnapshotRelationRule[]
}

export type SnapshotType = {
  id: string
  name: string
  attrs: string | null
}

export type ValidationSnapshot = {
  model: {
    id: string
    name: string
    version: string
    nodes: SnapshotNode[]
    links: SnapshotLink[]
    folders: SnapshotFolder[]
    diagrams: SnapshotDiagram[]
  }
  notations: SnapshotNotation[]
  types: {
    nodeTypes: SnapshotType[]
    linkTypes: SnapshotType[]
  }
}

export type ValidationRunContext = {
  model: ValidationSnapshot['model']
  diagram: SnapshotDiagram | null
  notations: SnapshotNotation[]
  types: ValidationSnapshot['types']
}

export type ValidationRunResult = {
  issues: ValidationIssue[]
  error?: string
  timedOut?: boolean
}

export const VALIDATION_SCRIPT_TIMEOUT_MS = 5000
export const VALIDATION_SCRIPT_MAX_ISSUES = 500

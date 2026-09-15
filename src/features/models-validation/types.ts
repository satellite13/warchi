export type DuplicateNodeMember = {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
  diagramCount?: number
}

export type DuplicateNodeGroup = {
  nodeTypeId: string
  nodeTypeName: string
  name: string
  count: number
  nodes: DuplicateNodeMember[]
}

export type DuplicateLinkMember = {
  id: string
  diagramCount?: number
}

export type DuplicateLinkGroup = {
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
  linkTypeId: string
  linkTypeName: string
  count: number
  links: DuplicateLinkMember[]
}

export type ValidationReport = {
  modelId: string
  generatedAt: string
  duplicateNodes: DuplicateNodeGroup[]
  duplicateLinks: DuplicateLinkGroup[]
  duplicateNodesTotal?: number
  duplicateLinksTotal?: number
  diagramIssues?: DiagramIssueGroup[]
  diagramIssuesTotal?: number
  unusedNodes?: UnusedNode[]
  unusedLinks?: UnusedLink[]
  unusedNodesTotal?: number
  unusedLinksTotal?: number
}

export type UnusedNode = {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
}

export type UnusedLink = {
  id: string
  sourceName: string
  targetName: string
  linkTypeName: string
}

export type DeleteUnusedRequest = {
  nodeIds: string[]
  linkIds: string[]
}

export type DeleteUnusedResponse = {
  deletedNodeIds: string[]
  deletedLinkIds: string[]
  skippedNodeIds: string[]
  skippedLinkIds: string[]
}

export type DiagramIssue = {
  code: string
  level: 'error' | 'warning' | string
  instanceId?: string | null
  message: string
}

export type DiagramIssueGroup = {
  diagramId: string
  diagramName: string
  issues: DiagramIssue[]
}

export type DiagramRef = { diagramId: string; diagramName: string }

export type PreviewIncidentLink = {
  id: string
  linkTypeId: string
  linkTypeName: string
  direction: 'in' | 'out' | string
  otherNodeId: string
  otherNodeName: string
}

export type MergeNodesPreview = {
  keepId: string
  dropId: string
  keepTypeProperties: Record<string, unknown>
  dropTypeProperties: Record<string, unknown>
  uniqueLinks: PreviewIncidentLink[]
  linksToDelete: PreviewIncidentLink[]
  keepDiagrams: DiagramRef[]
  dropDiagrams: DiagramRef[]
  hasChildren: boolean
  hasDocuments: boolean
  diagramsToReparentCount: number
  keepUpdatedAt: string
  dropUpdatedAt: string
}

export type MergeLinksPreview = {
  keepId: string
  dropId: string
  keepTypeProperties: Record<string, unknown>
  dropTypeProperties: Record<string, unknown>
  keepDiagrams: DiagramRef[]
  dropDiagrams: DiagramRef[]
  keepUpdatedAt: string
  dropUpdatedAt: string
}

export type MergeNodesRequest = {
  keepId: string
  dropId: string
  typeProperties: Record<string, unknown>
  transferLinkIds: string[]
  reparentChildren?: boolean
  keepUpdatedAt: string
  dropUpdatedAt: string
}

export type MergeLinksRequest = {
  keepId: string
  dropId: string
  typeProperties: Record<string, unknown>
  keepUpdatedAt: string
  dropUpdatedAt: string
}

export type OefMergeDecision = {
  id: string
  oefEntityId: string
  targetNodeId: string
  signatureType: string | null
  signatureName: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type OefMergeDecisionSaveItem = {
  oefEntityId: string
  targetNodeId: string
  signatureType?: string | null
  signatureName?: string | null
}

export type OefMergeDecisionSaveRequest = {
  decisions: OefMergeDecisionSaveItem[]
}

export type OefMergeDecisionSaveResponse = {
  saved: number
  skipped: number
}

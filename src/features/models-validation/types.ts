export type DuplicateNodeMember = {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
}

export type DuplicateNodeGroup = {
  nodeTypeId: string
  nodeTypeName: string
  name: string
  count: number
  nodes: DuplicateNodeMember[]
}

export type DuplicateLinkMember = { id: string }

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

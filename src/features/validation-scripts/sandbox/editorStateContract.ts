/**
 * Neutral editor-state contract for validation / diagram script sandbox.
 * Sandbox code must depend on these shapes only — not on `@/features/models/*`.
 * Model editor types are structurally compatible and can be passed as adapters.
 */

export type ScriptHistoryCommand = {
  execute: () => void
  undo: () => void
}

export type ScriptDiagramNodeInstance = {
  id: string
  modelNodeId: string
  x: number
  y: number
  width?: number
  height?: number
  attrs?: Record<string, unknown> & {
    notationComponentId?: string
  }
}

export type ScriptDiagramEdgeInstance = {
  id: string
  modelLinkId: string
  sourceInstanceId: string
  targetInstanceId: string
  attrs?: Record<string, unknown> & {
    diagramStyle?: Record<string, unknown>
  }
}

export type ScriptEditorDiagram = {
  id: string
  name: string
  version: string
  notationId: string
  parsedAttrs: {
    instances: {
      nodes: ScriptDiagramNodeInstance[]
      edges: ScriptDiagramEdgeInstance[]
    }
  }
  _isDeleted?: boolean
}

export type ScriptEditorNode = {
  id: string
  name: string
  parentNodeId?: string | null
  nodeTypeId: string
  parsedAttrs: unknown
  _isDeleted?: boolean
}

export type ScriptEditorLink = {
  id: string
  sourceId: string
  targetId: string
  linkTypeId: string
  parsedAttrs: unknown
  _isDeleted?: boolean
}

export type ScriptNotationRef = {
  id: string
  name: string
  version: string
}

export type ScriptComponentRef = {
  id: string
  name: string
  notationId: string
  nodeTypeId: string
}

export type ScriptRelationRef = {
  id: string
  name: string
  notationId: string
  linkTypeId: string
}

export type ScriptRelationRuleRef = {
  id: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}

export type ScriptNodeTypeRef = {
  id: string
  name: string
  attrs?: string | null
}

export type ScriptLinkTypeRef = {
  id: string
  name: string
  attrs?: string | null
}

export type ScriptEditorState = {
  modelId: string
  nodes: ScriptEditorNode[]
  links: ScriptEditorLink[]
  diagrams: ScriptEditorDiagram[]
  notations: ScriptNotationRef[]
  nodeTypes: ScriptNodeTypeRef[]
  linkTypes: ScriptLinkTypeRef[]
  components: ScriptComponentRef[]
  relations: ScriptRelationRef[]
  relationRules: ScriptRelationRuleRef[]
}

export function createEmptyScriptEditorState(): ScriptEditorState {
  return {
    modelId: '',
    nodes: [],
    links: [],
    diagrams: [],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

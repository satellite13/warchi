import type {
  ComponentResponse,
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeTypeResponse,
  NodeResponse,
  RelationResponse,
  RelationRuleResponse
} from "@/types/api"
import type { NotationData } from "@/types/entities"
import type {
  DiagramAttrs,
  ModelLinkAttrs,
  ModelNodeAttrs
} from "./modelAttrs"

export type TreeParentScope = { kind: 'root' } | { kind: 'node'; nodeId: string }

export type EntityMergeMode =
  | { kind: 'partial' }
  | {
      kind: 'childrenPage'
      scope: TreeParentScope
      page: number
      total: number
      last: boolean
      token: number
    }
  | { kind: 'childrenScope'; scope: TreeParentScope; token: number }
  | { kind: 'full' }

export type ModelPartialRequestGuard = {
  generation: number
  requestKey: string
  token: number
}

export type ChildrenPageState = {
  loadedPages: Set<number>
  nextPage: number | null
  totalElements: number
}

export type EditorNode = Omit<NodeResponse, "attrs"> & {
  parsedAttrs: ModelNodeAttrs
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

export type EditorLink = Omit<LinkResponse, "attrs"> & {
  parsedAttrs: ModelLinkAttrs
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

export type TraceabilityDirection = 'outgoing' | 'incoming'

export type TraceabilityBranchQuery = {
  nodeId: string
  direction: TraceabilityDirection
  linkTypeId: string | null
}

export type TraceabilityNeighborRef = {
  linkId: string
  nodeId: string
}

export type EditorGraphNeighbor = {
  link: EditorLink
  node: EditorNode
}

export type EditorDiagram = Omit<DiagramResponse, "attrs"> & {
  parsedAttrs: DiagramAttrs
  /** true when list was loaded with includeAttrs=false — hydrate via GET /diagrams/{id}. */
  _attrsPending?: boolean
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
  /** Soft-deleted server diagram to hard-delete on save so this name+version can be reused. */
  _replaceDeletedId?: string
  /** Bumped when diagram_live is applied so in-flight GET hydration cannot clobber the canvas. */
  _liveCanvasEpoch?: number
}

export type ModelEditorState = {
  modelId: string
  ownerId: string
  nodes: EditorNode[]
  links: EditorLink[]
  diagrams: EditorDiagram[]
  notations: NotationData[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  relationRules: RelationRuleResponse[]
}

export const createEmptyModelEditorState = (): ModelEditorState => ({
  modelId: "",
  ownerId: "",
  nodes: [],
  links: [],
  diagrams: [],
  notations: [],
  nodeTypes: [],
  linkTypes: [],
  components: [],
  relations: [],
  relationRules: []
})

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

export type EditorDiagram = Omit<DiagramResponse, "attrs"> & {
  parsedAttrs: DiagramAttrs
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
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


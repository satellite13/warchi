import type {
  NodeTypeResponse,
  LinkTypeResponse,
  ComponentResponse,
  RelationResponse
} from '../../types/api'
import type { CustomProperty, DiagramStyle, NodeStyle } from './notationAttrs'

// Parsed attrs for node/link types
export interface TypeParsedAttrs {
  style?: NodeStyle
  width?: number
  height?: number
  cornerRadius?: number
  customProperties?: CustomProperty[]
}

// Parsed attrs for components/relations
export interface EntityParsedAttrs {
  tags: string[]
  customProperties: CustomProperty[]
  diagramStyle?: DiagramStyle
}

// Editor state types with parsed attrs and change tracking flags
export interface EditorNodeType extends Omit<NodeTypeResponse, 'attrs'> {
  parsedAttrs: TypeParsedAttrs
  _isNew?: boolean
}

export interface EditorLinkType extends Omit<LinkTypeResponse, 'attrs'> {
  parsedAttrs: TypeParsedAttrs
  _isNew?: boolean
}

export interface EditorComponent extends Omit<ComponentResponse, 'attrs'> {
  parsedAttrs: EntityParsedAttrs
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

export interface EditorRelation extends Omit<RelationResponse, 'attrs'> {
  parsedAttrs: EntityParsedAttrs
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

export interface EditorRelationRule {
  id: string
  fromComponentId: string
  toComponentId: string
  allowedRelationIds: string[]
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}

// Main editor state
export interface NotationEditorState {
  notationId: string
  ownerId: string
  nodeTypes: EditorNodeType[]
  linkTypes: EditorLinkType[]
  components: EditorComponent[]
  relations: EditorRelation[]
  relationRules: EditorRelationRule[]
}

// Empty state factory
export const createEmptyEditorState = (): NotationEditorState => ({
  notationId: '',
  ownerId: '',
  nodeTypes: [],
  linkTypes: [],
  components: [],
  relations: [],
  relationRules: []
})

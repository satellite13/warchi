import type {
  NodeTypeResponse,
  LinkTypeResponse,
  ComponentResponse,
  RelationResponse,
} from '@/types/api'
import type { CustomProperty, DiagramStyle, NodeStyle } from '@/domain/attrs/notationAttrs'

export interface DiagramLayerNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  attrs?: Record<string, unknown>
}

export interface DiagramLayerEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  attrs?: Record<string, unknown>
}

export interface EditorDiagramLayer {
  version: 1
  nodes: DiagramLayerNode[]
  edges: DiagramLayerEdge[]
}

// Parsed attrs for node/link types
export interface TypeParsedAttrs {
  style?: NodeStyle
  width?: number
  height?: number
  cornerRadius?: number
  defaultDirectoryPath?: string
  /** SVG icon name from public/icons/ for tree display */
  icon?: string
  documentFileId?: string
  customProperties?: CustomProperty[]
}

// Parsed attrs for components/relations
export interface EntityParsedAttrs {
  tags: string[]
  customProperties: CustomProperty[]
  diagramStyle?: DiagramStyle
  /** Группа в палитре (0 = note). По умолчанию 0. */
  paletteGroup?: number
  /** Имя символа Material Symbols для палитры (только при отсутствии diagramStyle.iconName) */
  paletteMaterialIcon?: string
  /** UUID файла markdown-документации */
  documentFileId?: string
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
  diagramLayer: EditorDiagramLayer
}

// Empty state factory
export const createEmptyEditorState = (): NotationEditorState => ({
  notationId: '',
  ownerId: '',
  nodeTypes: [],
  linkTypes: [],
  components: [],
  relations: [],
  relationRules: [],
  diagramLayer: {
    version: 1,
    nodes: [],
    edges: [],
  },
})

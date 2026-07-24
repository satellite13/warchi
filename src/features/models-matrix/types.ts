import type { ComponentResponse, LinkTypeResponse, RelationResponse } from '@/types/api'
import type { NotationData } from '@/types/entities'
import type { EditorLink, EditorNode } from '@/features/models/types'

export const UNMAPPED_ENTITY_ID = '__unmapped__'

export type RelationMatrixMode = 'types' | 'notation'
export type RelationMatrixCsvFormat = 'long' | 'wide'

export type RelationMatrixEntityOption = {
  id: string
  name: string
  kind: 'row' | 'column' | 'relation'
}

export type RelationMatrixFilters = {
  notationId: string | null
  selectedRowIds: string[]
  selectedColumnIds: string[]
  selectedRelationIds: string[]
  allowedOnly: boolean
  heatmapEnabled: boolean
  hideEmptyAxes: boolean
}

export type RelationMatrixLinkItem = {
  linkId: string
  sourceNodeId: string
  sourceNodeName: string
  targetNodeId: string
  targetNodeName: string
  sourceCustomProperties: Record<string, unknown>
  targetCustomProperties: Record<string, unknown>
  relationId: string
  relationName: string
  relationCount: number
}

export type RelationMatrixCell = {
  rowId: string
  columnId: string
  total: number
  relationCounts: Record<string, number>
  relationIds: string[]
  items: RelationMatrixLinkItem[]
  allowedByNotationRules: boolean
}

export type RelationMatrixResult = {
  mode: RelationMatrixMode
  rowOptions: RelationMatrixEntityOption[]
  columnOptions: RelationMatrixEntityOption[]
  relationOptions: RelationMatrixEntityOption[]
  rows: RelationMatrixEntityOption[]
  columns: RelationMatrixEntityOption[]
  cells: Record<string, RelationMatrixCell>
  maxCellTotal: number
}

export type RelationMatrixRuleInput = {
  relationId: string
  fromComponentId: string
  toComponentId: string
  _isDeleted?: boolean
}

export type BuildRelationMatrixInput = {
  filters: RelationMatrixFilters
  nodes: EditorNode[]
  links: EditorLink[]
  nodeTypes: Array<{ id: string; name: string }>
  linkTypes: LinkTypeResponse[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  relationRules: RelationMatrixRuleInput[]
  notations: NotationData[]
  labels?: {
    unmapped?: string
    unknownRelation?: string
  }
}

import { apiPost } from "@/api/apiClient"

export interface NotationImportApiRequest {
  notation: { name: string; version: string; attrs?: string | null }
  nodeTypes?: Array<{ id: string; name: string; attrs?: string | null }>
  linkTypes?: Array<{ id: string; name: string; attrs?: string | null }>
  components?: Array<{
    id: string
    name: string
    nodeTypeId: string
    version?: string | null
    attrs?: string | null
  }>
  relations?: Array<{
    id: string
    name: string
    linkTypeId: string
    version?: string | null
    attrs?: string | null
  }>
  relationRules?: Array<{
    fromComponentId: string
    toComponentId: string
    allowedRelationIds: string[]
  }>
  shapes?: Array<{
    id: string
    name: string
    outline?: string | null
    contentArea?: string | null
    attrs?: string | null
  }>
}

export interface NotationImportApiResponse {
  notationId: string
  nodeTypeIdMap: Record<string, string>
  linkTypeIdMap: Record<string, string>
  componentIdMap: Record<string, string>
  relationIdMap: Record<string, string>
  shapeIdMap?: Record<string, string>
}

export async function importNotationViaApi(
  request: NotationImportApiRequest
): Promise<NotationImportApiResponse | null> {
  const result = await apiPost<NotationImportApiResponse>("/notations/import", request)
  if (!result.success) return null
  return result.data
}

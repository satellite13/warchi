import { apiPost } from "@/api/apiClient"

export interface NotationImportApiResponse {
  notationId: string
  nodeTypeIdMap: Record<string, string>
  linkTypeIdMap: Record<string, string>
  componentIdMap: Record<string, string>
  relationIdMap: Record<string, string>
}

export async function importNotationViaApi(
  exportJson: unknown
): Promise<NotationImportApiResponse | null> {
  const result = await apiPost<NotationImportApiResponse>(
    "/notations/import",
    exportJson
  )
  if (!result.success) return null
  return result.data
}

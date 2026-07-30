import { apiPost } from '@/api/apiClient'
import type { NotationImportApiResponse } from './useNotationImportApi'

export type NotationExportImportResult =
  | { ok: true; notationId: string }
  | {
      ok: false
      status: number
      message: string
      code?: 'CONFLICT' | 'BAD_REQUEST'
    }

export async function uploadNotationExportJson(file: File): Promise<NotationExportImportResult> {
  let document: unknown
  try {
    document = JSON.parse(await file.text())
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON', code: 'BAD_REQUEST' }
  }

  const result = await apiPost<NotationImportApiResponse>('/notations/import', document)
  if (!result.success) {
    const status = result.error.status
    if (status === 409) {
      return { ok: false, status, message: result.error.message, code: 'CONFLICT' }
    }
    if (status === 400) {
      return { ok: false, status, message: result.error.message, code: 'BAD_REQUEST' }
    }
    return { ok: false, status, message: result.error.message }
  }
  if (!result.data?.notationId) {
    return { ok: false, status: 0, message: 'Invalid response', code: 'BAD_REQUEST' }
  }
  return { ok: true, notationId: result.data.notationId }
}

import type { ApiResult } from '@/api/apiClient'
import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import type { BatchConflictItem } from '../composables'

export type ApiGetFn = <T>(path: string) => Promise<ApiResult<T>>

export type ServerConflictEntity = NodeResponse | LinkResponse | DiagramResponse

export async function fetchServerConflictEntity(
  c: BatchConflictItem,
  apiGet: ApiGetFn
): Promise<{ ok: true; data: ServerConflictEntity } | { ok: false; error: string }> {
  const enc = encodeURIComponent(c.id)
  if (c.kind === 'node') {
    const r = await apiGet<NodeResponse>(`/nodes/${enc}`)
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message }
  }
  if (c.kind === 'link') {
    const r = await apiGet<LinkResponse>(`/links/${enc}`)
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message }
  }
  if (c.kind === 'diagram') {
    const r = await apiGet<DiagramResponse>(`/diagrams/${enc}`)
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message }
  }
  return { ok: false, error: 'unknown kind' }
}

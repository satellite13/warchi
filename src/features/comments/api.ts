import { apiUpload } from '@/api/apiClient'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, type ApiResult } from '@/composables/useApi'
import type {
  CommentCounts,
  CommentCreatePayload,
  CommentLinkPreviewData,
  CommentMessage as CommentThreadMessage,
  CommentStatusFilter,
  CommentThread,
  CommentThreadsResponse,
  CommentUploadResult,
} from './types'

export function fetchCommentThreads(
  diagramId: string,
  filters: { status?: CommentStatusFilter; targetType?: string; instanceId?: string } = {}
): Promise<ApiResult<CommentThreadsResponse>> {
  const params = new URLSearchParams()
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.targetType) params.set('targetType', filters.targetType)
  if (filters.instanceId) params.set('instanceId', filters.instanceId)
  const qs = params.toString()
  return apiGet<CommentThreadsResponse>(`/diagrams/${diagramId}/comments${qs ? `?${qs}` : ''}`)
}

export function fetchCommentCounts(diagramId: string): Promise<ApiResult<CommentCounts>> {
  return apiGet<CommentCounts>(`/diagrams/${diagramId}/comments/counts`)
}

export function createComment(
  diagramId: string,
  payload: CommentCreatePayload
): Promise<ApiResult<CommentThread>> {
  return apiPost<CommentThread>(`/diagrams/${diagramId}/comments`, payload)
}

export function updateComment(
  commentId: string,
  payload: { bodyMd?: string; attachmentFileIds?: string[] }
): Promise<ApiResult<CommentThreadMessage>> {
  return apiPatch<CommentThreadMessage>(`/comments/${commentId}`, payload)
}

export function deleteComment(commentId: string): Promise<ApiResult<void>> {
  return apiDelete(`/comments/${commentId}`)
}

export function resolveCommentThread(commentId: string): Promise<ApiResult<void>> {
  return apiPost(`/comments/${commentId}/resolve`, {})
}

export function unresolveCommentThread(commentId: string): Promise<ApiResult<void>> {
  return apiPost(`/comments/${commentId}/unresolve`, {})
}

export function addCommentReaction(commentId: string, emoji: string): Promise<ApiResult<void>> {
  return apiPut(`/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, {})
}

export function removeCommentReaction(commentId: string, emoji: string): Promise<ApiResult<void>> {
  return apiDelete(`/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`)
}

export function markCommentsRead(
  diagramId: string,
  lastReadAt: string
): Promise<ApiResult<{ lastReadAt: string; unreadCount: number }>> {
  return apiPost(`/diagrams/${diagramId}/comments/read-state`, { lastReadAt })
}

export function uploadCommentAttachment(
  diagramId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<ApiResult<CommentUploadResult>> {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<CommentUploadResult>(
    `/diagrams/${diagramId}/comments/attachments`,
    formData,
    onProgress ? { onProgress: (p: { percent: number }) => onProgress(p.percent) } : undefined
  )
}

export function resolveLinkPreview(url: string): Promise<ApiResult<CommentLinkPreviewData>> {
  return apiPost<CommentLinkPreviewData>('/link-previews/resolve', { url })
}

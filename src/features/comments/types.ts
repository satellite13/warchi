export type CommentTargetType = 'diagram' | 'node' | 'edge'

export interface CommentAuthor {
  id: string
  displayName: string
}

export interface CommentAttachment {
  fileId: string
  filename: string
  contentType: string
  size: number
  url: string
}

export interface CommentReaction {
  emoji: string
  count: number
  viewerReacted: boolean
}

export interface CommentLinkPreviewData {
  url: string
  title: string | null
  description: string | null
  siteName: string | null
  imageUrl: string | null
}

export interface CommentMessage {
  id: string
  author: CommentAuthor
  bodyMd: string
  mentions: string[]
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  attachments: CommentAttachment[]
  reactions: CommentReaction[]
  linkPreview: CommentLinkPreviewData | null
}

export interface CommentThread {
  id: string
  targetType: CommentTargetType
  instanceId: string | null
  elementName: string | null
  elementExists: boolean
  isResolved: boolean
  resolvedAt: string | null
  resolvedReason: 'manual' | 'element_removed' | null
  lastActivityAt: string
  replyCount: number
  message: CommentMessage
  replies: CommentMessage[]
}

export interface CommentThreadsResponse {
  threads: CommentThread[]
  totalCount: number
}

export interface CommentCounts {
  diagramId: string
  totalCount: number
  unreadCount: number
  byInstance: Record<string, number>
  byInstanceUnresolved?: Record<string, number>
}

export type CommentStatusFilter = 'all' | 'active' | 'resolved'

export interface CommentCreatePayload {
  bodyMd: string
  targetType: CommentTargetType
  instanceId?: string | null
  elementName?: string | null
  threadId?: string | null
  attachmentFileIds?: string[]
}

export interface CommentUploadResult {
  fileId: string
  filename: string
  contentType: string
  size: number
  url: string
}

export type CommentWsEvent = {
  type: 'diagram_comment'
  action: 'created' | 'updated' | 'deleted' | 'resolved' | 'reaction'
  diagramId: string
  commentId?: string
  threadId?: string
  instanceId?: string
  actorUserId?: string
}

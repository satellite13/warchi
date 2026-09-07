import { computed, ref, watch, type Ref } from 'vue'
import {
  addCommentReaction,
  createComment,
  deleteComment,
  fetchCommentCounts,
  fetchCommentThreads,
  markCommentsRead,
  removeCommentReaction,
  resolveCommentThread,
  unresolveCommentThread,
  updateComment,
} from './api'
import type { CommentCounts, CommentStatusFilter, CommentThread } from './types'

const READ_STATE_DEBOUNCE_MS = 1500

/**
 * Состояние комментариев активной диаграммы (module-level, паттерн проекта —
 * composition functions вместо глобального стора).
 */
const threads = ref<CommentThread[]>([])
const counts = ref<CommentCounts | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const statusFilter = ref<CommentStatusFilter>('all')
const mentionsOnly = ref(false)
const loadedDiagramId = ref<string | null>(null)

let readStateTimer: ReturnType<typeof setTimeout> | null = null
const lastLoadedAt = ref<string | null>(null)

export function useComments(options: {
  diagramId: Ref<string | null | undefined>
  currentUserId: Ref<string | null | undefined>
  /** Таб комментариев виден — можно обновлять read-state */
  isActive: Ref<boolean>
}) {
  const { diagramId, currentUserId, isActive } = options

  const visibleThreads = computed(() => {
    let list = threads.value
    if (statusFilter.value === 'active') list = list.filter(t => !t.isResolved)
    if (statusFilter.value === 'resolved') list = list.filter(t => t.isResolved)
    if (mentionsOnly.value) {
      const me = currentUserId.value
      list = list.filter(t =>
        me ? [t.message, ...t.replies].some(m => m.mentions.includes(me)) : false
      )
    }
    return list
  })

  async function load(): Promise<void> {
    const id = diagramId.value
    if (!id) {
      threads.value = []
      counts.value = null
      return
    }
    loading.value = true
    error.value = null
    const [threadsResult, countsResult] = await Promise.all([
      fetchCommentThreads(id),
      fetchCommentCounts(id),
    ])
    if (diagramId.value !== id) return
    if (threadsResult.success) {
      threads.value = threadsResult.data.threads
      loadedDiagramId.value = id
    } else {
      error.value = threadsResult.error.message
    }
    if (countsResult.success) {
      counts.value = countsResult.data
    }
    loading.value = false
    lastLoadedAt.value = new Date().toISOString()
    scheduleMarkRead()
  }

  function handleBroadcast(msg: Record<string, unknown>): void {
    if (msg.type !== 'diagram_comment') return
    const diagram = diagramId.value
    if (!diagram || msg.diagramId !== diagram) return
    // Оптимистичные свои события уже применены — перезагружаем список лениво
    const action = msg.action
    if (action === 'reaction') {
      // Реакции не меняют набор сообщений — тихое обновление
      void refreshCountsOnly()
      window.setTimeout(() => void refreshCountsOnly(), 400)
      return
    }
    void load()
  }

  async function refreshCountsOnly(): Promise<void> {
    const id = diagramId.value
    if (!id) return
    const result = await fetchCommentCounts(id)
    if (result.success && diagramId.value === id) {
      counts.value = result.data
    }
  }

  async function create(payload: {
    bodyMd: string
    targetType: 'diagram' | 'node' | 'edge'
    instanceId?: string | null
    elementName?: string | null
    threadId?: string | null
    attachmentFileIds?: string[]
  }): Promise<{ ok: boolean; error?: string }> {
    const id = diagramId.value
    if (!id) return { ok: false, error: 'No diagram selected' }
    const result = await createComment(id, payload)
    if (!result.success) return { ok: false, error: result.error.message }
    await load()
    return { ok: true }
  }

  async function edit(
    commentId: string,
    payload: { bodyMd?: string; attachmentFileIds?: string[] }
  ): Promise<{ ok: boolean; error?: string }> {
    const result = await updateComment(commentId, payload)
    if (!result.success) return { ok: false, error: result.error.message }
    await load()
    return { ok: true }
  }

  async function remove(commentId: string): Promise<{ ok: boolean; error?: string }> {
    const result = await deleteComment(commentId)
    if (!result.success) return { ok: false, error: result.error.message }
    await load()
    return { ok: true }
  }

  async function setResolved(thread: CommentThread, resolved: boolean): Promise<void> {
    const result = resolved
      ? await resolveCommentThread(thread.id)
      : await unresolveCommentThread(thread.id)
    if (result.success) await load()
  }

  async function toggleReaction(commentId: string, emoji: string): Promise<void> {
    const existing = threads.value
      .flatMap(t => [t.message, ...t.replies])
      .find(m => m.id === commentId)
      ?.reactions.find(r => r.emoji === emoji)
    if (existing?.viewerReacted) {
      await removeCommentReaction(commentId, emoji)
    } else {
      await addCommentReaction(commentId, emoji)
    }
    await load()
  }

  function scheduleMarkRead(): void {
    if (!isActive.value) return
    if (readStateTimer) clearTimeout(readStateTimer)
    readStateTimer = setTimeout(() => void markReadNow(), READ_STATE_DEBOUNCE_MS)
  }

  async function markReadNow(): Promise<void> {
    const id = diagramId.value
    if (!id || !isActive.value) return
    const me = currentUserId.value
    // непрочитанные: чужие сообщения новее last_read
    const othersNewer = threads.value
      .flatMap(t => [t.message, ...t.replies])
      .filter(m => m.author.id !== me)
      .map(m => m.createdAt)
      .sort()
    const latest = lastLoadedAt.value ?? othersNewer.at(-1)
    if (!latest) return
    const result = await markCommentsRead(id, latest)
    if (result.success) {
      counts.value = counts.value
        ? { ...counts.value, unreadCount: result.data.unreadCount }
        : counts.value
    }
  }

  watch(isActive, visible => {
    if (visible) scheduleMarkRead()
  })

  watch(diagramId, id => {
    if (id !== loadedDiagramId.value) {
      threads.value = []
      counts.value = null
      error.value = null
    }
  })

  return {
    threads,
    visibleThreads,
    counts,
    loading,
    error,
    statusFilter,
    mentionsOnly,
    load,
    create,
    edit,
    remove,
    setResolved,
    toggleReaction,
    handleBroadcast,
    scheduleMarkRead,
    refreshCountsOnly,
  }
}

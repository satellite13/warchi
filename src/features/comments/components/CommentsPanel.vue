<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import CommentComposer from './CommentComposer.vue'
import CommentThreadItem from './CommentThreadItem.vue'
import { uploadCommentAttachment } from '../api'
import { useComments } from '../useComments'
import type { CommentThread } from '../types'

const props = defineProps<{
  diagramId: string
  canEdit: boolean
  currentUserId: string | null
  /** Имя выбранного на холсте элемента (для контекста) */
  selectedInstance?: {
    instanceId: string
    targetType: 'node' | 'edge'
    label: string
  } | null
  /** Активен ли таб (для read-state) */
  isActive?: boolean
  /** Тред, к которому нужно проскроллиться и подсветить (deep-link с главной) */
  focusThreadId?: string | null
}>()

const emit = defineEmits<{
  focusInstance: [instanceId: string, targetType: 'node' | 'edge']
  threadsChanged: []
}>()

const { t } = useI18n()

const isActive = computed(() => props.isActive !== false)

const {
  threads,
  visibleThreads,
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
} = useComments({
  diagramId: computed(() => props.diagramId),
  currentUserId: computed(() => props.currentUserId),
  isActive,
})

onMounted(() => void load())

/** Скролл к запрошенному треду и подсветка (deep-link) */
watch(
  () => [props.focusThreadId ?? null, threads.value.length] as const,
  async ([threadId, count]) => {
    if (!threadId || !count) return
    await nextTick()
    const el = document.querySelector<HTMLElement>(`[data-thread-id="${threadId}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('thread--highlighted')
    window.setTimeout(() => el.classList.remove('thread--highlighted'), 2500)
  },
  { immediate: true }
)

defineExpose({ load, handleBroadcast, scheduleMarkRead })

const scope = computed(() =>
  props.selectedInstance
    ? { targetType: props.selectedInstance.targetType, instanceId: props.selectedInstance.instanceId }
    : { targetType: 'diagram' as const, instanceId: null as string | null }
)

const scopedThreads = computed(() =>
  props.selectedInstance
    ? visibleThreads.value.filter(
        t => t.instanceId === props.selectedInstance?.instanceId
      )
    : visibleThreads.value
)

const listScope = ref<'all' | 'selected'>('all')

const shownThreads = computed(() => {
  if (props.selectedInstance && listScope.value === 'selected') {
    return scopedThreads.value
  }
  return visibleThreads.value
})

const contextLabel = computed(() =>
  props.selectedInstance
    ? props.selectedInstance.label
    : t('comments.targetDiagram')
)

const editingMessage = ref<{ id: string; bodyMd: string } | null>(null)
const replyThread = ref<string | null>(null)

async function onSend(payload: { bodyMd: string; attachmentFileIds: string[] }): Promise<void> {
  if (editingMessage.value) {
    const target = editingMessage.value
    editingMessage.value = null
    await edit(target.id, { bodyMd: payload.bodyMd, attachmentFileIds: payload.attachmentFileIds })
    emit('threadsChanged')
    return
  }
  const result = await create({
    bodyMd: payload.bodyMd,
    targetType: replyThread.value ? 'diagram' : scope.value.targetType,
    instanceId: replyThread.value ? null : scope.value.instanceId,
    elementName: replyThread.value ? null : props.selectedInstance?.label ?? null,
    threadId: replyThread.value,
    attachmentFileIds: payload.attachmentFileIds,
  })
  if (result.ok) {
    replyThread.value = null
  }
  emit('threadsChanged')
}

async function onRemove(id: string): Promise<void> {
  await remove(id)
  emit('threadsChanged')
}

async function onResolveToggle(thread: CommentThread): Promise<void> {
  await setResolved(thread, !thread.isResolved)
  emit('threadsChanged')
}

async function onReact(commentId: string, emoji: string): Promise<void> {
  await toggleReaction(commentId, emoji)
  emit('threadsChanged')
}

async function onUpload(file: File, onProgress: (percent: number) => void): Promise<void> {
  const result = await uploadCommentAttachment(props.diagramId, file, onProgress)
  if (!result.success) {
    window.alert(result.error.message)
  }
}

function startEdit(message: { id: string; bodyMd: string }): void {
  replyThread.value = null
  editingMessage.value = message
}

function startReply(threadId: string): void {
  editingMessage.value = null
  replyThread.value = threadId
}

function cancelEdit(): void {
  editingMessage.value = null
  replyThread.value = null
}

function onFocusInstance(thread: { instanceId: string | null; targetType: string }): void {
  if (thread.instanceId && (thread.targetType === 'node' || thread.targetType === 'edge')) {
    emit('focusInstance', thread.instanceId, thread.targetType)
  }
}
</script>

<template>
  <div class="comments-panel">
    <div class="comments-panel__toolbar">
      <select v-model="statusFilter" class="comments-panel__filter">
        <option value="all">{{ t('comments.filterAll') }}</option>
        <option value="active">{{ t('comments.filterActive') }}</option>
        <option value="resolved">{{ t('comments.filterResolved') }}</option>
      </select>
      <label class="comments-panel__mentions">
        <input v-model="mentionsOnly" type="checkbox" />
        <UiIcon name="alternate_email" />
      </label>
      <select
        v-if="selectedInstance"
        v-model="listScope"
        class="comments-panel__filter comments-panel__filter--scope"
      >
        <option value="all">{{ t('comments.scopeAll') }}</option>
        <option value="selected">{{ t('comments.scopeSelected') }}</option>
      </select>
      <span class="comments-panel__spacer" />
      <button type="button" class="comments-panel__refresh" :title="t('common.retry')" @click="load">
        <UiIcon name="refresh" :class="{ spin: loading }" />
      </button>
    </div>

    <div v-if="error" class="comments-panel__error">
      {{ error }}
      <button type="button" class="btn btn--secondary btn--sm" @click="load">{{ t('common.retry') }}</button>
    </div>

    <div class="comments-panel__list">
      <div v-if="loading && !threads.length" class="comments-panel__empty">
        <UiIcon name="sync" class="spin" />
      </div>
      <div v-else-if="!shownThreads.length" class="comments-panel__empty">
        <UiIcon name="forum" class="comments-panel__empty-icon" />
        <p>{{ selectedInstance ? t('comments.emptyElement') : t('comments.emptyDiagram') }}</p>
      </div>
      <template v-else>
        <CommentThreadItem
          v-for="thread in shownThreads"
          :key="thread.id"
          :thread="thread"
          :can-edit="canEdit"
          :current-user-id="currentUserId"
          @react="(commentId, emoji) => onReact(commentId, emoji)"
          @edit="startEdit"
          @remove="onRemove"
          @reply="p => { startReply(thread.id); onSend(p) }"
          @upload-file="onUpload"
          @focus-instance="onFocusInstance"
          @resolve-toggle="onResolveToggle"
        />
      </template>
    </div>

    <div class="comments-panel__composer">
      <div v-if="editingMessage || replyThread" class="comments-panel__editing-hint">
        <span>{{ editingMessage ? t('comments.editingMessage') : t('comments.replyingToThread') }}</span>
        <button type="button" @click="cancelEdit">
          <UiIcon name="close" />
        </button>
      </div>
      <CommentComposer
        :can-edit="canEdit"
        :context-target="selectedInstance ? selectedInstance.targetType : 'diagram'"
        :context-label="contextLabel"
        :placeholder="t('comments.inputPlaceholder')"
        :auto-focus="false"
        @send="onSend"
        @upload-file="onUpload"
      />
    </div>
  </div>
</template>

<style scoped>
.comments-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface);
}

.comments-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #eceae5);
}

.comments-panel__filter {
  border: 1px solid var(--border, #e5e2dd);
  background: var(--surface);
  color: var(--base-text);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
}

.comments-panel__filter--scope {
  max-width: 130px;
}

.comments-panel__mentions {
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
}

.comments-panel__spacer {
  flex: 1;
}

.comments-panel__refresh {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  padding: 4px;
  border-radius: 6px;
}

.comments-panel__refresh:hover {
  background: var(--surface-muted);
  color: var(--base-text);
}

.comments-panel__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  color: var(--danger);
  font-size: 12px;
}

.comments-panel__list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.comments-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-subtle);
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
}

.comments-panel__empty-icon {
  font-size: 28px;
  opacity: 0.5;
}

.comments-panel__composer {
  border-top: 1px solid var(--border, #eceae5);
}

.comments-panel__editing-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--primary);
  padding: 6px 10px 0;
}

.comments-panel__editing-hint button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
}

.spin {
  animation: comments-spin 1s linear infinite;
}

@keyframes comments-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

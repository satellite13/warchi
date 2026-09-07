<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import CommentComposer from './CommentComposer.vue'
import CommentMessage from './CommentMessage.vue'
import type { CommentThread } from '../types'

const props = defineProps<{
  thread: CommentThread
  canEdit: boolean
  currentUserId: string | null
}>()

const emit = defineEmits<{
  react: [commentId: string, emoji: string]
  edit: [message: { id: string; bodyMd: string }]
  remove: [messageId: string]
  reply: [payload: { bodyMd: string; attachmentFileIds: string[] }]
  uploadFile: [file: File, onProgress: (percent: number) => void]
  focusInstance: [thread: CommentThread]
  'resolve-toggle': [thread: CommentThread]
}>()

const { t } = useI18n()
const repliesOpen = ref(false)
const replyComposerRef = ref<InstanceType<typeof CommentComposer> | null>(null)

const targetIcon = computed(() =>
  props.thread.targetType === 'edge' ? 'timeline' : props.thread.targetType === 'node' ? 'category' : 'dashboard'
)

const isOrphan = computed(
  () => props.thread.targetType !== 'diagram' && !props.thread.elementExists
)

async function openReply(): Promise<void> {
  repliesOpen.value = true
  await nextTick()
  replyComposerRef.value?.focus()
}
</script>

<template>
  <div class="thread" :data-thread-id="thread.id" :class="{ 'thread--resolved': thread.isResolved }">
    <div class="thread__target" :title="thread.elementName || t('comments.targetDiagram')">
      <button
        v-if="thread.targetType !== 'diagram'"
        type="button"
        class="thread__target-btn"
        @click="emit('focusInstance', thread)"
      >
        <UiIcon :name="targetIcon" />
        <span class="thread__target-name">
          {{ thread.elementName || t('comments.elementUnknown') }}
        </span>
      </button>
      <span v-else class="thread__target-btn thread__target-btn--static">
        <UiIcon name="dashboard" />
        <span class="thread__target-name">{{ t('comments.targetDiagram') }}</span>
      </span>
      <span v-if="isOrphan" class="thread__orphan">{{ t('comments.elementRemoved') }}</span>
      <span class="thread__spacer" />
      <button
        v-if="canEdit"
        type="button"
        class="thread__resolve"
        :title="thread.isResolved ? t('comments.reopen') : t('comments.resolve')"
        @click="emit('resolve-toggle', thread)"
      >
        <UiIcon :name="thread.isResolved ? 'restart_alt' : 'check_circle'" />
      </button>
    </div>

    <CommentMessage
      :message="thread.message"
      :can-edit="canEdit"
      :current-user-id="currentUserId"
      @react="emoji => emit('react', thread.message.id, emoji)"
      @edit="m => emit('edit', m)"
      @remove="m => emit('remove', m.id)"
      @reply="openReply"
    />

    <div v-if="thread.replies.length" class="thread__replies">
      <button type="button" class="thread__replies-toggle" @click="repliesOpen = !repliesOpen">
        <UiIcon :name="repliesOpen ? 'expand_less' : 'expand_more'" />
        {{ t('comments.repliesCount', { count: thread.replyCount }) }}
      </button>
      <div v-if="repliesOpen" class="thread__replies-list">
        <CommentMessage
          v-for="reply in thread.replies"
          :key="reply.id"
          :message="reply"
          :can-edit="canEdit"
          :current-user-id="currentUserId"
          compact
          @react="emoji => emit('react', reply.id, emoji)"
          @edit="m => emit('edit', m)"
          @remove="m => emit('remove', m.id)"
          @reply="openReply"
        />
      </div>
    </div>

    <div v-if="repliesOpen && canEdit" class="thread__reply-composer">
      <CommentComposer
        ref="replyComposerRef"
        :can-edit="canEdit"
        context-target="diagram"
        :context-label="t('comments.replyPlaceholder')"
        :placeholder="t('comments.replyPlaceholder')"
        @send="p => emit('reply', p)"
        @upload-file="(file, onProgress) => emit('uploadFile', file, onProgress)"
      />
    </div>
  </div>
</template>

<style scoped>
.thread {
  border-bottom: 1px solid var(--border, #eceae5);
  padding: 10px 12px 8px;
}

.thread--resolved {
  opacity: 0.65;
}

.thread--highlighted {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  box-shadow: inset 3px 0 0 var(--primary);
  transition: background 0.6s ease;
}

.thread__target {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.thread__target-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: var(--surface-muted);
  border-radius: 6px;
  padding: 2px 7px;
  cursor: pointer;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  max-width: 100%;
}

.thread__target-btn--static {
  cursor: default;
}

.thread__target-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread__orphan {
  color: var(--warning);
  font-size: 10px;
  border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  border-radius: 6px;
  padding: 0 5px;
}

.thread__spacer {
  flex: 1;
}

.thread__resolve {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  padding: 2px;
  border-radius: 6px;
}

.thread__resolve:hover {
  background: var(--surface-muted);
  color: var(--success);
}

.thread__replies {
  margin-left: 36px;
}

.thread__replies-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: none;
  background: transparent;
  color: var(--primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}

.thread__replies-toggle:hover {
  background: var(--surface-muted);
}

.thread__replies-list {
  border-left: 2px solid var(--border, #eceae5);
  padding-left: 8px;
  margin-top: 4px;
}

.thread__reply-composer {
  margin-left: 36px;
  border-top: none;
  border: 1px solid var(--border, #eceae5);
  border-radius: 8px;
  margin-bottom: 6px;
}
</style>

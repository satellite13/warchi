<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import { renderCommentHtml } from '../commentMarkdown'
import type { CommentMessage as CommentMessageType } from '../types'

const props = withDefaults(
  defineProps<{
    message: CommentMessageType
    canEdit: boolean
    currentUserId: string | null
    compact?: boolean
  }>(),
  { compact: false }
)

const emit = defineEmits<{
  react: [emoji: string]
  edit: [message: CommentMessageType]
  remove: [message: CommentMessageType]
  reply: [message: CommentMessageType]
}>()

const { t, locale } = useI18n()
const reactionsOpen = ref(false)

const html = computed(() =>
  props.message.deletedAt ? '' : renderCommentHtml(props.message.bodyMd)
)

const timeLabel = computed(() => {
  const date = new Date(props.message.createdAt)
  return date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
})

const fullDateLabel = computed(() => new Date(props.message.createdAt).toLocaleString(locale.value))

const isImage = (contentType: string) => contentType.startsWith('image/')

const quickEmoji = ['👍', '🎉', '👀', '✅', '❓', '🚀']

const isOwnMessage = computed(() => props.currentUserId === props.message.author.id)
</script>

<template>
  <div class="comment-message" :class="{ 'comment-message--deleted': !!message.deletedAt }">
    <div class="comment-message__avatar" :title="message.author.displayName">
      {{ message.author.displayName.charAt(0).toUpperCase() }}
    </div>
    <div class="comment-message__main">
      <div class="comment-message__head">
        <span class="comment-message__author">{{ message.author.displayName }}</span>
        <span class="comment-message__time" :title="fullDateLabel">{{ timeLabel }}</span>
        <span v-if="message.editedAt" class="comment-message__edited">(изм.)</span>
      </div>

      <div v-if="message.deletedAt" class="comment-message__deleted-text">
        {{ t('comments.deletedMessage') }}
      </div>
      <!-- html уже санитизирован (sanitizeMarkdownHtml: DOMPurify + allowlist) -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="comment-message__body markdown-body" v-html="html" />

      <div v-if="message.linkPreview" class="comment-message__preview">
        <a :href="message.linkPreview.url" target="_blank" rel="noopener noreferrer" class="comment-message__preview-card">
          <img
            v-if="message.linkPreview.imageUrl"
            :src="message.linkPreview.imageUrl"
            class="comment-message__preview-image"
            alt=""
            loading="lazy"
          />
          <div class="comment-message__preview-text">
            <div class="comment-message__preview-title">{{ message.linkPreview.title || message.linkPreview.url }}</div>
            <div v-if="message.linkPreview.description" class="comment-message__preview-desc">
              {{ message.linkPreview.description }}
            </div>
            <div class="comment-message__preview-site">{{ message.linkPreview.siteName }}</div>
          </div>
        </a>
      </div>

      <div v-if="message.attachments.length" class="comment-message__attachments">
        <template v-for="a in message.attachments" :key="a.fileId">
          <a
            v-if="isImage(a.contentType)"
            :href="a.url"
            target="_blank"
            rel="noopener noreferrer"
            class="comment-message__image-chip"
          >
            <img :src="a.url" :alt="a.filename" loading="lazy" />
          </a>
          <a v-else :href="a.url" target="_blank" rel="noopener noreferrer" class="comment-message__file-chip">
            <UiIcon name="description" />
            <span class="comment-message__file-name">{{ a.filename }}</span>
          </a>
        </template>
      </div>

      <div class="comment-message__footer">
        <div class="comment-message__reactions">
          <button
            v-for="r in message.reactions"
            :key="r.emoji"
            type="button"
            class="comment-message__reaction"
            :class="{ 'comment-message__reaction--mine': r.viewerReacted }"
            @click="emit('react', r.emoji)"
          >
            {{ r.emoji }} <span>{{ r.count }}</span>
          </button>
        </div>
        <div v-if="canEdit && !message.deletedAt" class="comment-message__actions">
          <div class="comment-message__actions-wrap">
            <button
              type="button"
              class="comment-message__action"
              :title="t('comments.addReaction')"
              @click="reactionsOpen = !reactionsOpen"
            >
              <UiIcon name="add_reaction" />
            </button>
            <div v-if="reactionsOpen" class="comment-message__quick-reactions">
              <button
                v-for="emoji in quickEmoji"
                :key="emoji"
                type="button"
                class="comment-message__quick-reaction"
                @click="emit('react', emoji); reactionsOpen = false"
              >
                {{ emoji }}
              </button>
            </div>
          </div>
          <button type="button" class="comment-message__action" :title="t('comments.reply')" @click="emit('reply', message)">
            <UiIcon name="reply" />
          </button>
          <button
            v-if="isOwnMessage"
            type="button"
            class="comment-message__action"
            :title="t('common.edit')"
            @click="emit('edit', message)"
          >
            <UiIcon name="edit" />
          </button>
          <button
            v-if="isOwnMessage"
            type="button"
            class="comment-message__action comment-message__action--danger"
            :title="t('common.delete')"
            @click="emit('remove', message)"
          >
            <UiIcon name="delete" />
          </button>
        </div>
        <div v-else-if="!message.deletedAt" class="comment-message__actions">
          <button type="button" class="comment-message__action" :title="t('comments.reply')" @click="emit('reply', message)">
            <UiIcon name="reply" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comment-message {
  display: flex;
  gap: 8px;
  padding: 6px 0;
}

.comment-message--deleted {
  opacity: 0.55;
}

.comment-message__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex: none;
  margin-top: 2px;
}

.comment-message__main {
  flex: 1;
  min-width: 0;
}

.comment-message__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
}

.comment-message__author {
  font-weight: 600;
  color: var(--base-text);
}

.comment-message__time,
.comment-message__edited {
  color: var(--text-subtle);
  font-size: 11px;
}

.comment-message__deleted-text {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.comment-message__body {
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

.comment-message__body :deep(p) {
  margin: 2px 0;
}

.comment-message__body :deep(pre) {
  background: var(--surface-muted);
  border-radius: 6px;
  padding: 6px 8px;
  overflow-x: auto;
  font-size: 12px;
}

.comment-message__body :deep(code) {
  background: var(--surface-muted);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 12px;
}

.comment-message__body :deep(a) {
  color: var(--primary);
  word-break: break-all;
}

.comment-message__body :deep(.comment-mention) {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
  border-radius: 4px;
  padding: 0 3px;
  font-weight: 600;
}

.comment-message__body :deep(ul),
.comment-message__body :deep(ol) {
  margin: 2px 0;
  padding-left: 18px;
}

.comment-message__preview {
  margin-top: 6px;
}

.comment-message__preview-card {
  display: flex;
  gap: 8px;
  border: 1px solid var(--border, #e5e2dd);
  border-radius: 8px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  background: var(--surface-muted);
}

.comment-message__preview-image {
  width: 76px;
  height: 76px;
  object-fit: cover;
  flex: none;
}

.comment-message__preview-text {
  padding: 6px 8px;
  min-width: 0;
}

.comment-message__preview-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.comment-message__preview-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.comment-message__preview-site {
  font-size: 10px;
  color: var(--text-subtle);
  margin-top: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.comment-message__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.comment-message__image-chip img {
  max-width: 180px;
  max-height: 120px;
  border-radius: 8px;
  border: 1px solid var(--border, #e5e2dd);
  display: block;
}

.comment-message__file-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--primary);
  background: var(--surface-muted);
  border: 1px solid var(--border, #e5e2dd);
  border-radius: 8px;
  padding: 5px 8px;
  text-decoration: none;
}

.comment-message__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.comment-message__reactions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.comment-message__reaction {
  border: 1px solid var(--border, #e5e2dd);
  background: transparent;
  border-radius: 10px;
  font-size: 11px;
  padding: 1px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.comment-message__reaction--mine {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.comment-message__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.comment-message:hover .comment-message__actions {
  opacity: 1;
}

.comment-message__actions-wrap {
  position: relative;
  display: flex;
}

.comment-message__action {
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 3px 5px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  font-size: 13px;
}

.comment-message__action:hover {
  background: var(--surface-muted);
  color: var(--base-text);
}

.comment-message__action--danger:hover {
  color: var(--danger);
}

.comment-message__quick-reactions {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  background: var(--surface);
  border: 1px solid var(--border, #e5e2dd);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  padding: 4px;
  gap: 2px;
  z-index: 20;
}

.comment-message__quick-reaction {
  border: none;
  background: transparent;
  font-size: 15px;
  padding: 3px 5px;
  border-radius: 6px;
  cursor: pointer;
}

.comment-message__quick-reaction:hover {
  background: var(--surface-muted);
}
</style>

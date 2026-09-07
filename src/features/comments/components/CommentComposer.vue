<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import { apiGet } from '@/composables/useApi'
import type { UserInfo } from '@/types/entities'
import type { CommentUploadResult } from '../types'

const props = withDefaults(
  defineProps<{
    canEdit: boolean
    contextLabel: string
    contextTarget: 'diagram' | 'node' | 'edge'
    placeholder?: string
    autoFocus?: boolean
  }>(),
  { placeholder: '', autoFocus: false }
)

const emit = defineEmits<{
  send: [payload: { bodyMd: string; attachmentFileIds: string[] }]
  uploadFile: [file: File, onProgress: (percent: number) => void]
}>()

const { t } = useI18n()

const body = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const attachments = ref<CommentUploadResult[]>([])
const uploadProgress = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const mentionQuery = ref<string | null>(null)
const mentionAnchor = ref<number>(-1)
const mentionResults = ref<UserInfo[]>([])
const mentionActiveIndex = ref(0)
let mentionSearchTimer: ReturnType<typeof setTimeout> | null = null

const canSend = computed(
  () => props.canEdit && (body.value.trim().length > 0 || attachments.value.length > 0)
)

const mentionActive = computed(() => mentionQuery.value !== null && mentionResults.value.length > 0)

function autoSize(): void {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`
}

function onInput(): void {
  autoSize()
  detectMention()
}

function detectMention(): void {
  const el = textarea.value
  if (!el) return
  const caret = el.selectionStart ?? 0
  const before = body.value.slice(0, caret)
  const match = /@([\w@.\-А-Яа-яёЁ]*)$/.exec(before)
  if (match && match[1].length >= 1) {
    mentionQuery.value = match[1]
    mentionAnchor.value = caret - match[0].length
    scheduleMentionSearch(match[1])
  } else {
    mentionQuery.value = null
    mentionAnchor.value = -1
    mentionResults.value = []
  }
}

function scheduleMentionSearch(query: string): void {
  if (mentionSearchTimer) clearTimeout(mentionSearchTimer)
  if (query.length < 2) {
    mentionResults.value = []
    return
  }
  mentionSearchTimer = setTimeout(async () => {
    const params = new URLSearchParams({ page: '0', size: '5', search: query })
    const result = await apiGet<{ items?: UserInfo[]; content?: UserInfo[] }>(
      `/users/public/search?${params.toString()}`
    )
    if (!result.success) return
    mentionResults.value = result.data.items ?? result.data.content ?? []
    mentionActiveIndex.value = 0
  }, 200)
}

function applyMention(user: UserInfo): void {
  const el = textarea.value
  if (!el || mentionAnchor.value < 0) return
  const caret = el.selectionStart ?? 0
  const displayName = user.email.split('@')[0] ?? user.email
  const token = `@[${displayName}](user:${user.id}) `
  body.value = body.value.slice(0, mentionAnchor.value) + token + body.value.slice(caret)
  mentionQuery.value = null
  mentionResults.value = []
  void nextTick(() => {
    el.focus()
    const pos = mentionAnchor.value + token.length
    el.setSelectionRange(pos, pos)
    autoSize()
  })
}

function openFilePicker(): void {
  fileInput.value?.click()
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const onProgress = (percent: number) => {
    uploadProgress.value = percent
  }
  emit('uploadFile', file, onProgress)
  input.value = ''
}

function defineUploadResult(result: CommentUploadResult): void {
  attachments.value = [...attachments.value, result]
  uploadProgress.value = null
}

function removeAttachment(fileId: string): void {
  attachments.value = attachments.value.filter(a => a.fileId !== fileId)
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
    return
  }
  if (mentionActive.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentionActiveIndex.value = Math.min(mentionActiveIndex.value + 1, mentionResults.value.length - 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentionActiveIndex.value = Math.max(mentionActiveIndex.value - 1, 0)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const user = mentionResults.value[mentionActiveIndex.value]
      if (user) applyMention(user)
      return
    }
  }
  if (event.key === 'Escape' && mentionQuery.value !== null) {
    mentionQuery.value = null
    mentionResults.value = []
  }
}

function submit(): void {
  if (!canSend.value) return
  emit('send', {
    bodyMd: body.value.trim(),
    attachmentFileIds: attachments.value.map(a => a.fileId),
  })
  body.value = ''
  attachments.value = []
  mentionQuery.value = null
  void nextTick(autoSize)
}

defineExpose({ applyMention, defineUploadResult, focus: () => textarea.value?.focus() })
</script>

<template>
  <div class="composer" :class="{ 'composer--disabled': !canEdit }">
    <div v-if="contextTarget !== 'diagram'" class="composer__context">
      <UiIcon :name="contextTarget === 'node' ? 'category' : 'timeline'" class="composer__context-icon" />
      <span class="composer__context-label">{{ contextLabel }}</span>
    </div>
    <div v-else class="composer__context composer__context--diagram">
      <UiIcon name="forum" class="composer__context-icon" />
      <span class="composer__context-label">{{ contextLabel }}</span>
    </div>

    <div v-if="mentionActive" class="composer__mention-list">
      <button
        v-for="(user, i) in mentionResults"
        :key="user.id"
        type="button"
        class="composer__mention-item"
        :class="{ 'composer__mention-item--active': i === mentionActiveIndex }"
        @mousedown.prevent="applyMention(user)"
      >
        <span class="composer__mention-avatar">{{ user.email.charAt(0).toUpperCase() }}</span>
        <span class="composer__mention-email">
          {{ user.email }}
          <span v-if="user.oidcSub" class="composer__mention-oidc">{{ user.oidcSub }}</span>
        </span>
      </button>
    </div>

    <textarea
      ref="textarea"
      v-model="body"
      class="composer__textarea"
      :placeholder="placeholder"
      :disabled="!canEdit"
      rows="1"
      @input="onInput"
      @keydown="onKeydown"
    />

    <div v-if="uploadProgress !== null" class="composer__progress">
      <div class="composer__progress-bar" :style="{ width: `${uploadProgress}%` }" />
    </div>

    <div v-if="attachments.length" class="composer__attachments">
      <span v-for="a in attachments" :key="a.fileId" class="composer__attachment-chip">
        <UiIcon :name="a.contentType.startsWith('image/') ? 'image' : 'description'" />
        <span class="composer__attachment-name">{{ a.filename }}</span>
        <button type="button" class="composer__attachment-remove" @click="removeAttachment(a.fileId)">
          <UiIcon name="close" />
        </button>
      </span>
    </div>

    <div class="composer__toolbar">
      <span class="composer__spacer" />
      <button type="button" class="composer__tool" :disabled="!canEdit" :title="t('comments.attachFile')" @click="openFilePicker">
        <UiIcon name="attach_file" />
      </button>
      <button type="button" class="composer__send" :disabled="!canSend" :title="t('comments.send')" @click="submit">
        <UiIcon name="send" />
      </button>
      <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx" hidden @change="onFileChange" />
    </div>
  </div>
</template>

<style scoped>
.composer {
  position: relative;
  border-top: 1px solid var(--border, #e5e2dd);
  padding: 8px 10px 10px;
  background: var(--surface);
}

.composer--disabled {
  opacity: 0.6;
}

.composer__context {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.composer__context-icon {
  font-size: 14px;
}

.composer__textarea {
  width: 100%;
  border: 1px solid var(--border, #e5e2dd);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  resize: none;
  min-height: 36px;
  max-height: 140px;
  box-sizing: border-box;
}

.composer__textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.composer__mention-list {
  position: absolute;
  bottom: calc(100% - 8px);
  left: 10px;
  z-index: 30;
  background: var(--surface);
  border: 1px solid var(--border, #e5e2dd);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  min-width: 220px;
}

.composer__mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
}

.composer__mention-item--active {
  background: var(--surface-muted);
}

.composer__mention-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex: none;
}

.composer__mention-email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer__mention-oidc {
  display: block;
  font-size: 10px;
  color: var(--text-subtle);
}

.composer__progress {
  height: 3px;
  border-radius: 2px;
  background: var(--surface-muted);
  margin-top: 6px;
  overflow: hidden;
}

.composer__progress-bar {
  height: 100%;
  background: var(--primary);
  transition: width 0.2s ease;
}

.composer__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.composer__attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  background: var(--surface-muted);
  border-radius: 6px;
  padding: 3px 6px;
  max-width: 100%;
}

.composer__attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.composer__attachment-remove {
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  padding: 0;
  color: var(--text-muted);
}

.composer__toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
}

.composer__spacer {
  flex: 1;
}

.composer__tool {
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  font-size: 13px;
}

.composer__tool:hover:not(:disabled) {
  background: var(--surface-muted);
  color: var(--base-text);
}

.composer__tool:disabled {
  cursor: default;
}

.composer__send {
  border: none;
  background: var(--primary);
  color: #fff;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.composer__send:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

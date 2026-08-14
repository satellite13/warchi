<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import { resolvePublicResourceUrl } from '@/api/resolvePublicResourceUrl'
import { createDiagramShareLink } from '@/composables/useApi'
import { waitForPublicShareUrl } from '../utils/waitForPublicShareUrl'

const props = defineProps<{
  visible: boolean
  diagramId: string | null
  diagramName: string
  modelId: string | null
  /**
   * Upload current canvas preview for the resolved target diagram id
   * (pinned version or latest-by-name). Return false to abort.
   */
  onUploadPreview?: (diagramId: string) => Promise<boolean | void>
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const shareMode = ref<'version' | 'latest'>('version')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const shareUrl = ref<string | null>(null)
const copied = ref(false)
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null

const canGetLink = computed(
  () =>
    (shareMode.value === 'version' && props.diagramId) ||
    (shareMode.value === 'latest' && props.modelId && props.diagramName)
)

const clearCopiedFeedback = () => {
  copied.value = false
  if (copiedResetTimer != null) {
    clearTimeout(copiedResetTimer)
    copiedResetTimer = null
  }
}

const getShareLink = async () => {
  if (!canGetLink.value) return
  isLoading.value = true
  errorMessage.value = null
  shareUrl.value = null
  clearCopiedFeedback()
  try {
    const payload =
      shareMode.value === 'version' && props.diagramId
        ? { diagramId: props.diagramId }
        : props.modelId && props.diagramName
          ? { modelId: props.modelId, diagramName: props.diagramName, latest: true as const }
          : null
    if (!payload) return
    const result = await createDiagramShareLink(payload)
    if (!result.success) {
      errorMessage.value = result.error.message
      return
    }
    // Upload to the diagram id the public URL actually resolves to (important for latest-by-name).
    if (props.onUploadPreview) {
      const ok = await props.onUploadPreview(result.data.diagramId)
      if (ok === false) {
        errorMessage.value = t('diagramShare.uploadFailed')
        return
      }
    }
    const url = resolvePublicResourceUrl(result.data.url)
    const ready = await waitForPublicShareUrl(url)
    if (!ready) {
      errorMessage.value = t('diagramShare.linkNotReady')
      return
    }
    shareUrl.value = url
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async () => {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    // Keep the modal open: closing immediately after clipboard.writeText can drop the
    // clipboard contents in some browsers (focus/gesture lost on unmount).
    copied.value = true
    if (copiedResetTimer != null) clearTimeout(copiedResetTimer)
    copiedResetTimer = setTimeout(() => {
      copied.value = false
      copiedResetTimer = null
    }, 2000)
  } catch {
    clearCopiedFeedback()
    errorMessage.value = t('diagramShare.copyFailed')
  }
}

watch(
  () => props.visible,
  visible => {
    if (visible) {
      shareUrl.value = null
      errorMessage.value = null
      clearCopiedFeedback()
    }
  }
)

onUnmounted(() => {
  clearCopiedFeedback()
})
</script>

<template>
  <BaseModal
    :visible="visible"
    :title="t('diagramShare.title')"
    @close="emit('close')"
  >
    <div class="diagram-share-modal">
      <p class="diagram-share-modal__hint">{{ t('diagramShare.hint') }}</p>
      <div class="diagram-share-modal__options">
        <label class="diagram-share-modal__option">
          <input v-model="shareMode" type="radio" value="version" />
          <span>{{ t('diagramShare.versionThis') }}</span>
        </label>
        <label class="diagram-share-modal__option">
          <input v-model="shareMode" type="radio" value="latest" />
          <span>{{ t('diagramShare.versionLatest') }}</span>
        </label>
      </div>
      <p v-if="shareMode === 'latest'" class="diagram-share-modal__warning">
        {{ t('diagramShare.latestWarning') }}
      </p>
      <div v-if="errorMessage" class="diagram-share-modal__error">
        {{ errorMessage }}
      </div>
      <div class="diagram-share-modal__actions">
        <button
          type="button"
          class="diagram-share-modal__btn diagram-share-modal__btn--primary"
          :disabled="!canGetLink || isLoading"
          @click="getShareLink"
        >
          {{ isLoading ? t('common.loading') : t('diagramShare.getLink') }}
        </button>
        <button
          v-if="shareUrl"
          type="button"
          class="diagram-share-modal__btn diagram-share-modal__btn--secondary"
          @click="copyToClipboard"
        >
          {{ copied ? t('diagramShare.copied') : t('diagramShare.copyLink') }}
        </button>
        <a
          v-if="shareUrl"
          class="diagram-share-modal__btn diagram-share-modal__btn--secondary"
          :href="shareUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('diagramShare.openLink') }}
        </a>
      </div>
      <a
        v-if="shareUrl"
        class="diagram-share-modal__url"
        :href="shareUrl"
        :title="shareUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ shareUrl }}
      </a>
    </div>
  </BaseModal>
</template>

<style scoped>
.diagram-share-modal {
  min-width: 360px;
}
.diagram-share-modal__hint {
  margin: 0 0 1rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.diagram-share-modal__options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.diagram-share-modal__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
.diagram-share-modal__option input {
  margin: 0;
}
.diagram-share-modal__warning {
  margin: 0 0 1rem;
  padding: 0.5rem;
  background: var(--surface-muted);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.diagram-share-modal__error {
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: var(--danger);
  color: white;
  border-radius: 6px;
  font-size: 0.9rem;
}
.diagram-share-modal__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.diagram-share-modal__btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--text-subtle);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.9rem;
  color: inherit;
  text-decoration: none;
  box-sizing: border-box;
}
.diagram-share-modal__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.diagram-share-modal__btn--primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.diagram-share-modal__btn--primary:disabled {
  background: var(--text-subtle);
  border-color: var(--text-subtle);
}
.diagram-share-modal__btn--secondary {
  background: var(--surface-muted);
}
.diagram-share-modal__url {
  display: block;
  margin: 1rem 0 0;
  padding: 0.5rem;
  background: var(--surface-muted);
  border-radius: 6px;
  font-size: 0.8rem;
  word-break: break-all;
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.diagram-share-modal__url:hover {
  color: var(--primary-hover);
}
</style>

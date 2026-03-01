<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import { buildApiUrl } from '@/api/config'
import { createDiagramShareLink } from '@/composables/useApi'

const props = defineProps<{
  visible: boolean
  diagramId: string | null
  diagramName: string
  modelId: string | null
  /** Called before creating the link to upload current diagram preview. If it returns false, link creation is skipped. */
  onBeforeGetLink?: () => Promise<boolean | void>
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const shareMode = ref<'version' | 'latest'>('version')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const shareUrl = ref<string | null>(null)

const canGetLink = computed(
  () =>
    (shareMode.value === 'version' && props.diagramId) ||
    (shareMode.value === 'latest' && props.modelId && props.diagramName)
)

const getShareLink = async () => {
  if (!canGetLink.value) return
  isLoading.value = true
  errorMessage.value = null
  shareUrl.value = null
  try {
    if (props.onBeforeGetLink) {
      const ok = await props.onBeforeGetLink()
      if (ok === false) {
        errorMessage.value = t('diagramShare.uploadFailed')
        return
      }
    }
    const payload =
      shareMode.value === 'version' && props.diagramId
        ? { diagramId: props.diagramId }
        : props.modelId && props.diagramName
          ? { modelId: props.modelId, diagramName: props.diagramName, latest: true as const }
          : null
    if (!payload) return
    const result = await createDiagramShareLink(payload)
    if (result.success) {
      const url = buildApiUrl(result.data.url)
      shareUrl.value =
        typeof window !== 'undefined' && url.startsWith('/')
          ? `${window.location.origin}${url}`
          : url
    } else {
      errorMessage.value = result.error.message
    }
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async () => {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    emit('close')
  } catch {
    errorMessage.value = t('diagramShare.copyFailed')
  }
}

watch(
  () => props.visible,
  visible => {
    if (visible) {
      shareUrl.value = null
      errorMessage.value = null
    }
  }
)
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
          {{ t('diagramShare.copyLink') }}
        </button>
      </div>
      <p v-if="shareUrl" class="diagram-share-modal__url" :title="shareUrl">
        {{ shareUrl }}
      </p>
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
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--text-subtle);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.9rem;
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
  margin: 1rem 0 0;
  padding: 0.5rem;
  background: var(--surface-muted);
  border-radius: 6px;
  font-size: 0.8rem;
  word-break: break-all;
  color: var(--text-muted);
}
</style>

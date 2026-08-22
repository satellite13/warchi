<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { ModelEditorLoadProgress } from '../utils/modelEditorLoadProgress'

const props = defineProps<{
  progress: ModelEditorLoadProgress
}>()

const { t } = useI18n()

const label = computed(() => {
  const params = {
    loaded: props.progress.loaded.toLocaleString(),
    total: props.progress.total.toLocaleString(),
  }
  switch (props.progress.phase) {
    case 'nodes':
      return t('models.modelLoadNodes', params)
    case 'diagrams':
      return t('models.modelLoadDiagrams', params)
    case 'catalog':
      return t('models.modelLoadCatalog')
    case 'links':
      return t('models.modelLoadLinks', params)
    case 'preparing':
      return t('models.modelLoadPreparing', params)
    case 'complete':
      return t('models.modelLoadComplete')
  }
})
</script>

<template>
  <div
    class="model-load-progress"
    :class="
      progress.blocking
        ? 'model-load-progress--blocking'
        : 'model-load-progress--background'
    "
    aria-live="polite"
  >
    <div class="model-load-progress__card">
      <div class="model-load-progress__status">
        <UiIcon name="sync" class="model-load-progress__icon spin" />
        <span>{{ label }}</span>
        <strong>{{ progress.percent }}%</strong>
      </div>
      <div
        class="model-load-progress__track"
        role="progressbar"
        :aria-label="label"
        :aria-valuenow="progress.percent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="model-load-progress__fill"
          :style="{ width: `${progress.percent}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-load-progress {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
}

.model-load-progress--blocking {
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--base-bg) 92%, transparent);
}

.model-load-progress--background {
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
}

.model-load-progress__card {
  width: min(420px, calc(100vw - 32px));
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.model-load-progress__status {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  color: var(--base-text);
  font-size: 14px;
}

.model-load-progress__icon {
  width: 20px;
  height: 20px;
  color: var(--primary);
}

.model-load-progress__track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-muted);
}

.model-load-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
  transition: width 150ms ease-out;
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ entity: string; message: string }>()
defineEmits<{ retry: [] }>()

const { t } = useI18n()
</script>

<template>
  <section class="granular-sync-error" role="alert">
    <div>
      <strong>{{ t('models.granularSyncError', { entity }) }}</strong>
      <span>{{ message }}</span>
    </div>
    <button type="button" class="btn btn--secondary" @click="$emit('retry')">
      {{ t('models.granularSyncRetry') }}
    </button>
  </section>
</template>

<style scoped>
.granular-sync-error {
  position: fixed;
  z-index: 1201;
  right: 24px;
  bottom: 132px;
  display: flex;
  gap: 16px;
  align-items: center;
  max-width: min(620px, calc(100vw - 48px));
  padding: 12px 14px;
  color: var(--base-text);
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--surface));
  border-left: 4px solid var(--danger);
  border-radius: 10px;
  box-shadow: 0 12px 36px rgb(31 26 20 / 16%);
}

.granular-sync-error div {
  display: grid;
  gap: 3px;
}

.granular-sync-error span {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>

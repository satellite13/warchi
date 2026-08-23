<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ count: number }>()

defineEmits<{
  discard: []
  reload: []
}>()

const { t } = useI18n()
</script>

<template>
  <section class="cascade-conflict" role="alert" aria-live="assertive">
    <span class="cascade-conflict__marker" aria-hidden="true">!</span>
    <div class="cascade-conflict__content">
      <strong>{{ t('models.remoteCascadeConflictTitle', { count }) }}</strong>
      <span>{{ t('models.remoteCascadeConflictHelp') }}</span>
    </div>
    <div class="cascade-conflict__actions">
      <button type="button" class="btn btn--secondary" @click="$emit('discard')">
        {{ t('models.remoteCascadeDiscard') }}
      </button>
      <button type="button" class="btn btn--secondary" @click="$emit('reload')">
        {{ t('models.remoteCascadeReload') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.cascade-conflict {
  position: fixed;
  z-index: 1200;
  right: 24px;
  bottom: 24px;
  display: grid;
  grid-template-columns: auto minmax(240px, 1fr) auto;
  gap: 14px;
  align-items: center;
  max-width: min(760px, calc(100vw - 48px));
  padding: 14px 16px;
  color: var(--base-text);
  background: color-mix(in srgb, var(--warning) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--surface));
  border-left: 4px solid var(--warning);
  border-radius: 10px;
  box-shadow: 0 12px 36px rgb(31 26 20 / 16%);
}

.cascade-conflict__marker {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--surface);
  font-weight: 700;
  background: var(--warning);
  border-radius: 50%;
}

.cascade-conflict__content {
  display: grid;
  gap: 3px;
  font-size: 0.9rem;
}

.cascade-conflict__content span {
  color: var(--text-muted);
}

.cascade-conflict__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .cascade-conflict {
    grid-template-columns: auto 1fr;
  }

  .cascade-conflict__actions {
    grid-column: 1 / -1;
  }
}
</style>

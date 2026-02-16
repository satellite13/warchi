<script setup lang="ts">
import BaseModal from "./BaseModal.vue";

withDefaults(defineProps<{
  title: string;
  entityLabel: string;
  entityName?: string | null;
  isDeleting?: boolean;
  error?: string | null;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
}>(), {
  entityName: null,
  error: null,
  confirmLabel: "Удалить",
  confirmingLabel: "Удаление...",
  cancelLabel: "Отмена"
});

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <BaseModal :title="title" @close="emit('close')">
    <div class="delete-modal">
      <p>
        Вы уверены, что хотите удалить {{ entityLabel }}
        <strong>{{ entityName }}</strong>?
      </p>
      <p class="delete-warning">
        Это действие нельзя отменить.
      </p>
      <div v-if="error" class="form-error">
        {{ error }}
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" :disabled="isDeleting" @click="emit('close')">
        {{ cancelLabel }}
      </button>
      <button type="button" class="btn btn--danger" :disabled="isDeleting" @click="emit('confirm')">
        {{ isDeleting ? confirmingLabel : confirmLabel }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.delete-modal p {
  margin: 0 0 12px;
  color: var(--text-muted);
}

.delete-modal strong {
  color: var(--base-text);
}

.delete-warning {
  color: var(--danger) !important;
  font-size: 14px;
}

.form-error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  font-family: inherit;
  letter-spacing: 0.01em;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-strong);
  color: var(--base-text);
}

.btn--secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--danger {
  color: #fff;
  background: var(--danger);
  border: none;
}

.btn--danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn--danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

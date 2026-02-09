<script setup lang="ts">
import BaseModal from "../BaseModal.vue";

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
}

.delete-warning {
  color: var(--danger);
  font-size: 14px;
}

.form-error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.btn--secondary {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-muted);
}

.btn--secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--danger {
  color: #fff;
  background: var(--danger);
  border: none;
}

.btn--danger:hover:not(:disabled) {
  background: #9c1b13;
}

.btn--danger:disabled {
  background: #f5b5b0;
  cursor: not-allowed;
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "./BaseModal.vue";

const props = withDefaults(defineProps<{
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
  confirmLabel: undefined,
  confirmingLabel: undefined,
  cancelLabel: undefined
});

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const { t } = useI18n();

const resolvedConfirmLabel = computed(() => props.confirmLabel ?? t("common.delete"));
const resolvedConfirmingLabel = computed(() => props.confirmingLabel ?? t("common.deleting"));
const resolvedCancelLabel = computed(() => props.cancelLabel ?? t("common.cancel"));
</script>

<template>
  <BaseModal :title="props.title" @close="emit('close')">
    <div class="delete-modal">
      <p>
        {{ t("common.confirmDelete", { entity: props.entityLabel }) }}
        <strong>{{ props.entityName }}</strong>?
      </p>
      <p class="delete-warning">
        {{ t("common.deleteIrreversible") }}
      </p>
      <div v-if="props.error" class="form-error">
        {{ props.error }}
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        :disabled="props.isDeleting"
        @click="emit('close')"
      >
        {{ resolvedCancelLabel }}
      </button>
      <button
        type="submit"
        class="btn btn--danger"
        :disabled="props.isDeleting"
        @click="emit('confirm')"
      >
        {{ props.isDeleting ? resolvedConfirmingLabel : resolvedConfirmLabel }}
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
</style>

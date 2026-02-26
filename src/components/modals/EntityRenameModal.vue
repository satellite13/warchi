<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "./BaseModal.vue";

const props = withDefaults(defineProps<{
  title: string;
  name: string;
  isRenaming?: boolean;
  error?: string | null;
  namePlaceholder?: string;
}>(), {
  error: null,
  namePlaceholder: undefined
});

const emit = defineEmits<{
  close: [];
  submit: [];
  "update:name": [string];
}>();

const { t } = useI18n();

const nameModel = computed({
  get: () => props.name,
  set: (value) => emit("update:name", value)
});

const canSubmit = computed(() => !!props.name.trim() && !props.isRenaming);
</script>

<template>
  <BaseModal :title="title" @close="emit('close')">
    <form class="rename-form" @submit.prevent="emit('submit')">
      <label class="rename-form__field">
        <span class="rename-form__label">{{ t("common.name") }}</span>
        <input
          v-model="nameModel"
          class="form-input form-input--lg"
          type="text"
          :placeholder="namePlaceholder"
          :disabled="isRenaming"
          autofocus
        >
      </label>
      <div v-if="error" class="rename-form__error">{{ error }}</div>
      <div class="rename-form__actions">
        <button type="button" class="btn btn--secondary" :disabled="isRenaming" @click="emit('close')">
          {{ t("common.cancel") }}
        </button>
        <button type="submit" class="btn btn--primary" :disabled="!canSubmit">
          {{ isRenaming ? t("common.saving") : t("common.save") }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.rename-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rename-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rename-form__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
}

.rename-form__error {
  padding: 12px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: var(--radius-sm);
  font-size: 14px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.rename-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

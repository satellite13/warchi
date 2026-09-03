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
    <form id="entity-rename-form" class="rename-form" @submit.prevent="emit('submit')">
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
      <div v-if="error" class="form-error">{{ error }}</div>
    </form>
    <template #footer>
      <button
        type="button"
        class="btn btn--secondary"
        :disabled="isRenaming"
        @click="emit('close')"
      >
        {{ t("common.cancel") }}
      </button>
      <button
        type="submit"
        form="entity-rename-form"
        class="btn btn--primary"
        :disabled="!canSubmit"
      >
        {{ isRenaming ? t("common.saving") : t("common.save") }}
      </button>
    </template>
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
</style>

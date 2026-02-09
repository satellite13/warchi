<script setup lang="ts">
const nameModel = defineModel<string>("name", {default: ""});
const versionModel = defineModel<string>("version", {default: ""});

defineProps<{
  nameLabel: string;
  versionLabel: string;
  namePlaceholder?: string;
  versionPlaceholder?: string;
  nameId?: string;
  versionId?: string;
  disabled?: boolean;
}>();
</script>

<template>
  <div class="name-version-form">
    <div class="form-field">
      <label :for="nameId">{{ nameLabel }}</label>
      <input :id="nameId" v-model="nameModel" type="text" :placeholder="namePlaceholder" :disabled="disabled">
    </div>
    <div class="form-field">
      <label :for="versionId">{{ versionLabel }}</label>
      <input :id="versionId" v-model="versionModel" type="text" :placeholder="versionPlaceholder" :disabled="disabled">
    </div>
  </div>
</template>

<style scoped>
.name-version-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-field label {
  font-size: 14px;
  font-weight: 500;
  color: var(--base-text);
}

.form-field input {
  padding: 12px 16px;
  font-size: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background: var(--surface);
  color: var(--base-text);
}

.form-field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}

.form-field input:disabled {
  background: var(--surface-strong);
  color: var(--text-muted);
}
</style>

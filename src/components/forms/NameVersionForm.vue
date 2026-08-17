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
      <input
        :id="nameId"
        v-model="nameModel"
        class="form-input form-input--lg"
        type="text"
        :placeholder="namePlaceholder"
        :disabled="disabled"
      >
    </div>
    <div class="form-field">
      <label :for="versionId">{{ versionLabel }}</label>
      <input
        :id="versionId"
        v-model="versionModel"
        class="form-input form-input--lg"
        type="text"
        :placeholder="versionPlaceholder"
        :disabled="disabled"
      >
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
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
</style>

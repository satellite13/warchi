<script setup lang="ts">
import { useI18n } from "vue-i18n";

const model = defineModel<string>({ default: "" });
const { t } = useI18n();

defineProps<{
  placeholder?: string;
}>();

const clear = () => {
  model.value = "";
};
</script>

<template>
  <div class="search-box">
    <UiIcon name="search" class="search-icon" />
    <input v-model="model" type="text" class="search-input" :placeholder="placeholder || t('common.search')">
    <button v-if="model" type="button" class="clear-button" @click="clear">
      <UiIcon name="cancel" />
    </button>
  </div>
</template>

<style scoped>
.search-box {
  position: relative;
  max-width: 360px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-subtle);
  pointer-events: none;
  transition: color 0.2s ease;
  width: 20px;
  height: 20px;
}

.search-input {
  width: 100%;
  padding: 10px 38px 10px 42px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  background: var(--surface-muted);
  color: var(--base-text);
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.15);
  background: var(--surface);
}

.search-box:focus-within .search-icon {
  color: var(--primary);
}

.search-input::placeholder {
  color: var(--text-subtle);
}

.clear-button {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-subtle);
  transition: background 0.2s ease, color 0.2s ease;
}

.clear-button:hover {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.clear-button svg {
  width: 16px;
  height: 16px;
}
</style>

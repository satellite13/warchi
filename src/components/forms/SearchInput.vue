<script setup lang="ts">
const model = defineModel<string>({ default: "" });

defineProps<{
  placeholder?: string;
}>();

const clear = () => {
  model.value = "";
};
</script>

<template>
  <div class="search-box">
    <span class="material-symbols-outlined search-icon">search</span>
    <input v-model="model" type="text" class="search-input" :placeholder="placeholder || 'Поиск...'">
    <button v-if="model" type="button" class="clear-button" @click="clear">
      <span class="material-symbols-outlined">cancel</span>
    </button>
  </div>
</template>

<style scoped>
.search-box {
  position: relative;
  max-width: 320px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-subtle);
  pointer-events: none;
  transition: color 0.2s ease;
}

.search-input {
  width: 100%;
  padding: 10px 38px 10px 40px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background: var(--surface);
  color: var(--base-text);
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
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

<script setup lang="ts">
import SearchInput from "../forms/SearchInput.vue";

const model = defineModel<string>({ default: "" });

defineProps<{
  placeholder?: string;
  count?: number;
  loading?: boolean;
}>();
</script>

<template>
  <div class="list-header">
    <div class="search-row">
      <SearchInput v-model="model" :placeholder="placeholder" class="search-field"/>
      <span v-if="!loading && count !== undefined" class="result-count">
        {{ count }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.search-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 0;
  width: 100%;
}

.search-field {
  margin-top: 0;
  flex: 1;
  max-width: 360px;
}

.result-count {
  display: inline-flex;
  align-items: center;
  margin-top: 0;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  border-radius: 20px;
  font-variant-numeric: tabular-nums;
}
</style>

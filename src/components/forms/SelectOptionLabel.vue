<script setup lang="ts">
import { computed } from 'vue'
import { splitSelectLabelTail } from './selectOptionLabel'

const props = defineProps<{ label: string }>()

const parts = computed(() => splitSelectLabelTail(props.label))
</script>

<template>
  <span class="select-option-label" :title="label">
    <span class="select-option-label__head">{{ parts.head }}</span>
    <span v-if="parts.tail" class="select-option-label__tail">{{ parts.tail }}</span>
  </span>
</template>

<style scoped>
.select-option-label {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
}

.select-option-label__head {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-option-label__tail {
  flex: 0 0 auto;
}
</style>

<script setup lang="ts">
import { computed } from "vue"

/**
 * UI-иконка из public/icons/{name}.svg. Замена шрифта Material Symbols.
 */
const props = defineProps<{
  name: string
  alt?: string
}>()

const src = computed(() => `${import.meta.env.BASE_URL}icons/${props.name}.svg`)
</script>

<template>
  <img
    :src="src"
    class="ui-icon"
    :alt="alt ?? ''"
  >
</template>

<style scoped>
.ui-icon {
  display: inline-block;
  width: 24px;
  height: 24px;
  object-fit: contain;
  vertical-align: middle;
  flex-shrink: 0;
  opacity: 0.7;
}
</style>

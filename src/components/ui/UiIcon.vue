<script setup lang="ts">
/**
 * UI-иконка из public/icons/{name}.svg. Замена шрифта Material Symbols.
 */
defineProps<{
  name: string
  alt?: string
}>()
</script>

<template>
  <img
    :src="`/icons/${name}.svg`"
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

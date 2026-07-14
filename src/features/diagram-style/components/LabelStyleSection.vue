<script setup lang="ts">
import StyleSection from './StyleSection.vue'

defineProps<{
  title: string
  open: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <StyleSection :title="title" :open="open" @toggle="emit('toggle')">
    <slot />
  </StyleSection>
</template>

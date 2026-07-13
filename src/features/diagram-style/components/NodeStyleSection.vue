<script setup lang="ts">
import StyleSection from './StyleSection.vue'

defineProps<{
  title: string
  open: boolean
  pill?: string | null
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <StyleSection :title="title" :open="open" :pill="pill" @toggle="emit('toggle')">
    <slot />
  </StyleSection>
</template>

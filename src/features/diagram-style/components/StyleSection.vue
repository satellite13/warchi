<script setup lang="ts">
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue'

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
  <CollapsibleSection
    variant="style"
    :title="title"
    :open="open"
    :pill="pill"
    @toggle="emit('toggle')"
  >
    <slot />
  </CollapsibleSection>
</template>

<script setup lang="ts">
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue'

defineProps<{
  label: string
  expanded: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <CollapsibleSection
    variant="panel"
    :title="label"
    :open="expanded"
    @toggle="emit('toggle')"
  >
    <template v-if="$slots['header-extra']" #header-extra>
      <slot name="header-extra" />
    </template>
    <slot />
  </CollapsibleSection>
</template>

<script setup lang="ts">
import ResizablePanelLayout from '@/components/layout/ResizablePanelLayout.vue'

withDefaults(
  defineProps<{
    storageKey: string
    defaultLeftWidth?: number
    defaultRightWidth?: number
    leftResizerTitle: string
    rightResizerTitle: string
    collapseLeftTitle: string
    expandLeftTitle: string
    collapseRightTitle: string
    expandRightTitle: string
  }>(),
  {
    defaultLeftWidth: 320,
    defaultRightWidth: 360,
  }
)
</script>

<template>
  <ResizablePanelLayout
    :storage-key="storageKey"
    :default-left-width="defaultLeftWidth"
    :default-right-width="defaultRightWidth"
    :left-resizer-title="leftResizerTitle"
    :right-resizer-title="rightResizerTitle"
    :collapse-left-title="collapseLeftTitle"
    :expand-left-title="expandLeftTitle"
    :collapse-right-title="collapseRightTitle"
    :expand-right-title="expandRightTitle"
  >
    <template #left>
      <slot name="left" />
    </template>
    <template #default>
      <slot />
    </template>
    <template #right>
      <slot name="right" />
    </template>
  </ResizablePanelLayout>
</template>

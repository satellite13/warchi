<script setup lang="ts">
import { useI18n } from "vue-i18n"
import ResizablePanelLayout from "@/components/layout/ResizablePanelLayout.vue"

const { t } = useI18n()
</script>

<template>
  <ResizablePanelLayout
    storage-key="warchi:model-editor:workspace"
    :default-left-width="320"
    :default-right-width="360"
    :left-resizer-title="t('models.resizeLeftPanelWidth')"
    :right-resizer-title="t('models.resizeRightPanelWidth')"
    :collapse-left-title="t('models.hideLeftPanel')"
    :expand-left-title="t('models.showLeftPanel')"
    :collapse-right-title="t('models.hideRightPanel')"
    :expand-right-title="t('models.showRightPanel')"
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

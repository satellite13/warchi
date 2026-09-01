<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MainPanelLayout from '@/components/layout/MainPanelLayout.vue'

const { t } = useI18n()
</script>

<template>
  <MainPanelLayout
    storage-key="warchi:notation-editor:workspace"
    :default-left-width="320"
    :default-right-width="420"
    :left-resizer-title="t('notations.resizeElementsPanelWidth')"
    :right-resizer-title="t('notations.resizeStylesPanelWidth')"
    :collapse-left-title="t('notations.hideElementsPanel')"
    :expand-left-title="t('notations.showElementsPanel')"
    :collapse-right-title="t('notations.hideStylesPanel')"
    :expand-right-title="t('notations.showStylesPanel')"
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
  </MainPanelLayout>
</template>

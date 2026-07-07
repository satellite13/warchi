<script setup lang="ts">
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { sanitizeMarkdownHtml } from '@/utils/sanitizeMarkdownHtml'

defineProps<{
  modelValue: string
  language?: string
  id?: string
}>()
</script>

<template>
  <MdPreview
    :id="id"
    :model-value="modelValue"
    :language="language"
    :sanitize="sanitizeMarkdownHtml"
  />
</template>

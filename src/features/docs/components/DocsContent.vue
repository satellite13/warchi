<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { marked } from "marked"
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml"

const props = defineProps<{
  content: string
  isLoading: boolean
}>()
const { t } = useI18n()

const html = computed(() => {
  if (!props.content) return ""
  const parsed = marked.parse(props.content, { async: false }) as string
  return sanitizeMarkdownHtml(parsed)
})
</script>

<template>
  <div class="docs-content">
    <div v-if="isLoading" class="docs-content__loading">
      <UiIcon name="sync" class="docs-content__spinner" />
      {{ t("common.loading") }}
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="docs-content__body" v-html="html" />
  </div>
</template>

<style scoped>
.docs-content {
  flex: 1;
  min-width: 0;
  max-width: 800px;
  padding: 32px 48px;
  overflow-y: auto;
}

.docs-content__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.docs-content__spinner {
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.docs-content__body :deep(h1) {
  font-size: 28px;
  font-weight: 700;
  color: var(--base-text);
  margin: 0 0 16px;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.docs-content__body :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  color: var(--base-text);
  margin: 32px 0 12px;
  letter-spacing: -0.01em;
}

.docs-content__body :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  color: var(--base-text);
  margin: 24px 0 8px;
}

.docs-content__body :deep(p) {
  font-size: 14px;
  line-height: 1.7;
  color: var(--base-text);
  margin: 0 0 12px;
}

.docs-content__body :deep(strong) {
  font-weight: 600;
  color: var(--base-text);
}

.docs-content__body :deep(code) {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  background: var(--surface-strong);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--primary);
}

.docs-content__body :deep(pre) {
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0 16px;
}

.docs-content__body :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--base-text);
}

.docs-content__body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 16px;
  font-size: 14px;
}

.docs-content__body :deep(th) {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid var(--border);
  font-weight: 600;
  color: var(--base-text);
  background: var(--surface-muted);
}

.docs-content__body :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--base-text);
}

.docs-content__body :deep(tr:hover td) {
  background: var(--surface-muted);
}

.docs-content__body :deep(ul),
.docs-content__body :deep(ol) {
  margin: 8px 0 16px;
  padding-left: 24px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--base-text);
}

.docs-content__body :deep(li) {
  margin: 4px 0;
}

.docs-content__body :deep(blockquote) {
  margin: 12px 0 16px;
  padding: 12px 16px;
  border-left: 3px solid var(--primary);
  background: var(--surface-muted);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-muted);
  font-size: 14px;
}

.docs-content__body :deep(blockquote p) {
  margin: 0;
}

.docs-content__body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}

.docs-content__body :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.docs-content__body :deep(a:hover) {
  color: var(--primary-hover);
}

.docs-content__body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 16px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.docs-content__body :deep(figure) {
  margin: 16px 0 20px;
}

.docs-content__body :deep(figcaption) {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>

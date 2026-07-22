<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { useI18n } from "vue-i18n"
import "@/config/mdEditor"
import AppHeader from "../components/layout/AppHeader.vue"
import AppFooter from "../components/layout/AppFooter.vue"
import UiIcon from "../components/ui/UiIcon.vue"
import SafeMarkdownPreview from "@/components/markdown/SafeMarkdownPreview.vue"
import EmptyState from "@/components/list/EmptyState.vue"
import { useWikiDocuments, type DocumentWikiItem } from "../composables/useWikiDocuments"
import { useLocale } from "../composables/useLocale"

const { t } = useI18n()
const { currentLocale } = useLocale()
const { list, isLoading, error, fetchList, fetchFileContent } = useWikiDocuments()

const selectedFileId = ref<string | null>(null)
const content = ref("")
const contentLoading = ref(false)

/** Свернутые группы (entityType). Пустой Set — все развёрнуты. */
const collapsedGroups = ref(new Set<string>())

function toggleGroup(entityType: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(entityType)) next.delete(entityType)
  else next.add(entityType)
  collapsedGroups.value = next
}

function isGroupCollapsed(entityType: string): boolean {
  return collapsedGroups.value.has(entityType)
}

const editorLanguage = computed(() => {
  const map: Record<string, string> = { ru: "ru-RU", en: "en-US" }
  return map[currentLocale.value] ?? "en-US"
})

const GROUP_ORDER = [
  "nodeType",
  "linkType",
  "model",
  "notation",
  "component",
  "relation",
  "nodeShape",
  "diagram",
  "node",
  "unknown"
] as const

function entityTypeLabel(entityType: string | undefined | null): string {
  if (!entityType) return ""
  const key = `wiki.entityType.${entityType}`
  const out = t(key)
  return out !== key ? out : entityType
}

function displayLabel(item: DocumentWikiItem): string {
  const name =
    item.entityName ?? (item.entityType ? t("wiki.documentation") : item.label)
  if (item.parentName) return `${item.parentName} — ${name}`
  return name
}

const groupedList = computed(() => {
  const byType = new Map<string, DocumentWikiItem[]>()
  for (const item of list.value) {
    const type = item.entityType ?? "unknown"
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type)!.push(item)
  }
  const groups: { entityType: string; typeLabel: string; items: DocumentWikiItem[] }[] = []
  for (const entityType of GROUP_ORDER) {
    const items = byType.get(entityType)
    if (items?.length) {
      items.sort((a, b) => displayLabel(a).localeCompare(displayLabel(b)))
      groups.push({
        entityType,
        typeLabel: entityTypeLabel(entityType),
        items
      })
    }
  }
  return groups
})

async function selectDocument(item: DocumentWikiItem) {
  selectedFileId.value = item.fileId
  content.value = ""
  contentLoading.value = true
  const text = await fetchFileContent(item.fileId)
  contentLoading.value = false
  content.value = text ?? ""
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="wiki-view">
    <header class="wiki-view__header">
      <AppHeader />
    </header>
    <main class="wiki-view__body">
      <aside class="wiki-view__sidebar">
        <h2 class="wiki-view__sidebar-title">{{ t("wiki.title") }}</h2>
        <div v-if="isLoading" class="wiki-view__loading">
          <UiIcon name="sync" class="wiki-view__spinner" />
          {{ t("common.loading") }}
        </div>
        <p v-else-if="error" class="wiki-view__error">{{ error }}</p>
        <div v-else class="wiki-view__groups">
          <section
            v-for="group in groupedList"
            :key="group.entityType"
            class="wiki-view__group"
          >
            <button
              type="button"
              class="wiki-view__group-title-btn"
              :aria-expanded="!isGroupCollapsed(group.entityType)"
              @click="toggleGroup(group.entityType)"
            >
              <UiIcon
                name="expand_more"
                class="wiki-view__group-chevron"
                :class="{ 'wiki-view__group-chevron--collapsed': isGroupCollapsed(group.entityType) }"
              />
              <span class="wiki-view__group-title-text">{{ group.typeLabel }}</span>
              <span class="wiki-view__group-count">{{ group.items.length }}</span>
            </button>
            <ul
              v-show="!isGroupCollapsed(group.entityType)"
              class="wiki-view__list"
            >
              <li
                v-for="item in group.items"
                :key="item.fileId"
                class="wiki-view__item"
                :class="{ 'wiki-view__item--active': selectedFileId === item.fileId }"
              >
                <button
                  type="button"
                  class="wiki-view__item-btn"
                  @click="selectDocument(item)"
                >
                  <span class="wiki-view__item-label">{{ displayLabel(item) }}</span>
                </button>
              </li>
            </ul>
          </section>
        </div>
        <p v-if="!isLoading && !error && list.length === 0" class="wiki-view__empty">
          {{ t("wiki.empty") }}
        </p>
      </aside>
      <div class="wiki-view__content">
        <EmptyState
          v-if="!selectedFileId"
          variant="panel"
          icon="menu_book"
          :title="t('wiki.selectDocument')"
        />
        <template v-else>
          <div v-if="contentLoading" class="wiki-view__content-loading">
            <UiIcon name="sync" class="wiki-view__content-loading-spinner" />
            <span class="wiki-view__content-loading-text">{{ t("common.loading") }}</span>
          </div>
          <div v-else class="wiki-view__markdown docs-content__body">
            <SafeMarkdownPreview :model-value="content" :language="editorLanguage" />
          </div>
        </template>
      </div>
    </main>
    <footer class="wiki-view__footer">
      <AppFooter />
    </footer>
  </div>
</template>

<style scoped>
.wiki-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--base-bg);
}

.wiki-view__body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.wiki-view__sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 20px 0;
  overflow-y: auto;
  background: var(--surface);
}

.wiki-view__sidebar-title {
  margin: 0 20px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wiki-view__loading,
.wiki-view__error,
.wiki-view__empty {
  margin: 0 20px;
  font-size: 14px;
  color: var(--text-muted);
}

.wiki-view__error {
  color: var(--danger);
}

.wiki-view__groups {
  margin: 0 12px;
}

.wiki-view__group {
  margin-bottom: 20px;
}

.wiki-view__group-title-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 0 8px 8px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.wiki-view__group-title-btn:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.wiki-view__group-chevron {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.wiki-view__group-chevron--collapsed {
  transform: rotate(-90deg);
}

.wiki-view__group-title-text {
  flex: 1;
  min-width: 0;
}

.wiki-view__group-count {
  font-variant-numeric: tabular-nums;
  color: var(--text-subtle);
  font-weight: 600;
}

.wiki-view__list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
}

.wiki-view__item {
  margin: 0;
}

.wiki-view__item-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.2s ease, color 0.2s ease;
}

.wiki-view__item-btn:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.wiki-view__item--active .wiki-view__item-btn {
  background: var(--primary-soft);
  color: var(--primary);
}

.wiki-view__item-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.wiki-view__item-type {
  font-size: 11px;
  color: var(--text-subtle);
}

.wiki-view__item--active .wiki-view__item-type {
  color: var(--primary);
  opacity: 0.9;
}

.wiki-view__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 32px 48px;
  background: var(--surface);
}

.wiki-view__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--text-subtle);
  font-size: 14px;
}

.wiki-view__placeholder-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.wiki-view__content-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  color: var(--text-muted);
  font-size: 14px;
}

.wiki-view__content-loading-spinner {
  width: 48px;
  height: 48px;
  animation: wiki-spin 1s linear infinite;
}

.wiki-view__spinner {
  width: 20px;
  height: 20px;
  animation: wiki-spin 1s linear infinite;
}

@keyframes wiki-spin {
  to { transform: rotate(-360deg); }
}

.wiki-view__markdown :deep(h1) { font-size: 28px; font-weight: 700; color: var(--base-text); margin: 0 0 16px; }
.wiki-view__markdown :deep(h2) { font-size: 20px; font-weight: 600; color: var(--base-text); margin: 32px 0 12px; }
.wiki-view__markdown :deep(h3) { font-size: 16px; font-weight: 600; color: var(--base-text); margin: 24px 0 8px; }
.wiki-view__markdown :deep(p) { font-size: 14px; line-height: 1.7; color: var(--base-text); margin: 0 0 12px; }
.wiki-view__markdown :deep(strong) { font-weight: 600; color: var(--base-text); }
.wiki-view__markdown :deep(code) { font-family: "JetBrains Mono", monospace; font-size: 13px; background: var(--surface-strong); padding: 2px 6px; border-radius: 4px; color: var(--primary); }
.wiki-view__markdown :deep(pre) { background: var(--surface-strong); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px; overflow-x: auto; margin: 12px 0 16px; }
.wiki-view__markdown :deep(pre code) { background: none; padding: 0; color: var(--base-text); }
.wiki-view__markdown :deep(ul), .wiki-view__markdown :deep(ol) { margin: 8px 0 16px; padding-left: 24px; font-size: 14px; line-height: 1.7; color: var(--base-text); }
.wiki-view__markdown :deep(li) { margin: 4px 0; }
.wiki-view__markdown :deep(blockquote) { margin: 12px 0 16px; padding: 12px 16px; border-left: 3px solid var(--primary); background: var(--surface-muted); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--text-muted); font-size: 14px; }
.wiki-view__markdown :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
</style>

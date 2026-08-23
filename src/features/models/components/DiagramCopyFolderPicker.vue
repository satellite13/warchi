<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { useLazyFolderTree } from '../composables/useLazyFolderTree'
import type { TreeParentScope } from '../types'

const props = defineProps<{
  modelValue: string | null
  folderTree: ReturnType<typeof useLazyFolderTree>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const { t } = useI18n()

const folderScope = (nodeId: string): TreeParentScope => ({ kind: 'node', nodeId })
const folderScopeState = (scope: TreeParentScope) =>
  props.folderTree.scopes.value.get(scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`)

function depthStyle(depth: number): Record<string, string> {
  return { '--tree-depth': String(depth) }
}

function isExpanded(nodeId: string): boolean {
  return folderScopeState(folderScope(nodeId))?.expanded === true
}

function selectFolder(folderId: string | null): void {
  emit('update:modelValue', folderId)
}
</script>

<template>
  <fieldset class="diagram-copy-folder-picker">
    <legend>{{ t('models.diagramCopy.folder') }}</legend>

    <label class="diagram-copy-folder-picker__row diagram-copy-folder-picker__row--root">
      <input
        :checked="modelValue === null"
        type="radio"
        name="diagram-copy-folder"
        :value="null"
        @change="selectFolder(null)"
      />
      <UiIcon name="folder_open" class="diagram-copy-folder-picker__icon" />
      <span>{{ t('models.diagramCopy.rootFolder') }}</span>
    </label>

    <div
      v-if="folderScopeState({ kind: 'root' })?.loading"
      class="diagram-copy-folder-picker__status"
      role="status"
      aria-live="polite"
    >
      {{ t('models.diagramCopy.loadingFolders') }}
    </div>

    <div
      v-else-if="folderScopeState({ kind: 'root' })?.error"
      class="diagram-copy-folder-picker__status diagram-copy-folder-picker__status--error"
      role="alert"
      aria-live="assertive"
    >
      <span>{{ folderScopeState({ kind: 'root' })?.error }}</span>
      <button type="button" class="btn btn--secondary" @click="folderTree.retry({ kind: 'root' })">
        {{ t('common.retry') }}
      </button>
    </div>

    <template v-else>
      <template v-for="row in folderTree.visibleRows.value" :key="row.node.id">
        <div
          class="diagram-copy-folder-picker__row"
          :class="{ 'diagram-copy-folder-picker__row--selected': modelValue === row.node.id }"
          :style="depthStyle(row.depth)"
        >
          <button
            v-if="row.node.hasChildren !== false"
            type="button"
            class="diagram-copy-folder-picker__toggle"
            :aria-label="
              t(
                isExpanded(row.node.id)
                  ? 'models.diagramCopy.collapseFolder'
                  : 'models.diagramCopy.expandFolder'
              )
            "
            :aria-expanded="isExpanded(row.node.id)"
            @click="folderTree.toggleFolder(row.node.id)"
          >
            <UiIcon :name="isExpanded(row.node.id) ? 'expand_more' : 'chevron_right'" />
          </button>
          <span v-else class="diagram-copy-folder-picker__toggle-spacer" aria-hidden="true" />

          <label class="diagram-copy-folder-picker__choice">
            <input
              :checked="modelValue === row.node.id"
              type="radio"
              name="diagram-copy-folder"
              :value="row.node.id"
              @change="selectFolder(row.node.id)"
            />
            <UiIcon name="folder" class="diagram-copy-folder-picker__icon" />
            <span class="diagram-copy-folder-picker__name">{{ row.node.name }}</span>
          </label>
        </div>

        <div
          v-if="isExpanded(row.node.id)"
          class="diagram-copy-folder-picker__status"
          :style="depthStyle(row.depth + 1)"
        >
          <span
            v-if="folderScopeState(folderScope(row.node.id))?.loading"
            role="status"
            aria-live="polite"
          >
            {{ t('models.diagramCopy.loadingFolders') }}
          </span>
          <template v-else-if="folderScopeState(folderScope(row.node.id))?.error">
            <span role="alert" aria-live="assertive">
              {{ folderScopeState(folderScope(row.node.id))?.error }}
            </span>
            <button
              type="button"
              class="btn btn--secondary"
              @click="folderTree.retry(folderScope(row.node.id))"
            >
              {{ t('common.retry') }}
            </button>
          </template>
          <button
            v-else-if="folderScopeState(folderScope(row.node.id))?.hasMore"
            type="button"
            class="btn btn--secondary"
            @click="folderTree.loadMore(folderScope(row.node.id))"
          >
            {{ t('models.diagramCopy.loadMoreFolders') }}
          </button>
        </div>
      </template>

      <p v-if="folderTree.visibleRows.value.length === 0" class="diagram-copy-folder-picker__hint">
        {{ t('models.diagramCopy.noFolders') }}
      </p>

      <button
        v-if="
          folderScopeState({ kind: 'root' })?.hasMore && !folderScopeState({ kind: 'root' })?.error
        "
        type="button"
        class="btn btn--secondary diagram-copy-folder-picker__load-more"
        @click="folderTree.loadMore({ kind: 'root' })"
      >
        {{ t('models.diagramCopy.loadMoreFolders') }}
      </button>
    </template>
  </fieldset>
</template>

<style scoped>
.diagram-copy-folder-picker {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.diagram-copy-folder-picker legend {
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.diagram-copy-folder-picker__row {
  display: flex;
  gap: 4px;
  align-items: center;
  min-height: 32px;
  padding: 2px 6px 2px calc(var(--tree-depth, 0) * 16px + 6px);
  border-radius: 6px;
}

.diagram-copy-folder-picker__row--root {
  padding-left: 6px;
}

.diagram-copy-folder-picker__row--selected {
  background: var(--primary-soft);
}

.diagram-copy-folder-picker__choice {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
  min-width: 0;
  cursor: pointer;
}

.diagram-copy-folder-picker__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagram-copy-folder-picker__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--text-muted);
}

.diagram-copy-folder-picker__toggle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.diagram-copy-folder-picker__toggle:hover {
  background: var(--surface-muted);
  color: var(--base-text);
}

.diagram-copy-folder-picker__toggle-spacer {
  flex-shrink: 0;
  width: 24px;
}

.diagram-copy-folder-picker__status {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 28px;
  padding: 2px 6px 6px calc(var(--tree-depth, 0) * 16px + 30px);
  color: var(--text-muted);
  font-size: 12px;
}

.diagram-copy-folder-picker__status--error {
  color: var(--danger);
}

.diagram-copy-folder-picker__hint {
  margin: 4px 6px 0;
  color: var(--text-muted);
  font-size: 12px;
}

.diagram-copy-folder-picker__load-more {
  align-self: flex-start;
  margin: 6px 0 0 6px;
}
</style>

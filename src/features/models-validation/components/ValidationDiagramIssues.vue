<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { DiagramIssueGroup } from '../types'

const props = defineProps<{
  group: DiagramIssueGroup
  modelId: string
}>()

const { t } = useI18n()
const router = useRouter()

const expanded = ref(false)

const editorHref = computed(() =>
  router.resolve({
    name: 'model-editor',
    params: { id: props.modelId },
    query: { diagramId: props.group.diagramId },
  }).href
)

const errorCount = props.group.issues.filter(issue => issue.level === 'error').length

function levelClass(level: string): string {
  return `validation-diagram-issues__issue_level_${level === 'error' ? 'error' : 'warning'}`
}
</script>

<template>
  <div class="validation-diagram-issues">
    <div
      class="validation-diagram-issues__header"
      role="button"
      tabindex="0"
      @click="expanded = !expanded"
      @keydown.enter.prevent="expanded = !expanded"
    >
      <span class="validation-diagram-issues__name">{{ group.diagramName }}</span>
      <a
        class="validation-diagram-issues__open"
        :href="editorHref"
        target="_blank"
        rel="noopener"
        :title="t('models.validationDiagramOpen')"
        :aria-label="t('models.validationDiagramOpen')"
        @click.stop
      >
        <UiIcon name="open_in_new" />
      </a>
      <span
        class="validation-diagram-issues__count"
        :class="{ 'validation-diagram-issues__count_errors': errorCount > 0 }"
      >
        {{ t('models.validationReportDiagramIssuesCount', { count: group.issues.length }) }}
      </span>
      <span class="validation-diagram-issues__chevron" :class="{ _open: expanded }">▾</span>
    </div>
    <ul v-if="expanded" class="validation-diagram-issues__list">
      <li
        v-for="(issue, index) in group.issues"
        :key="`${issue.code}:${issue.instanceId ?? index}`"
        class="validation-diagram-issues__issue"
        :class="levelClass(issue.level)"
      >
        <span class="validation-diagram-issues__code">{{ issue.code }}</span>
        <span class="validation-diagram-issues__message">{{ issue.message }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.validation-diagram-issues {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.validation-diagram-issues__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.validation-diagram-issues__header:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  border-radius: 8px;
}

.validation-diagram-issues__open {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 6px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.validation-diagram-issues__open:hover {
  color: var(--primary);
}

.validation-diagram-issues__open .ui-icon {
  width: 15px;
  height: 15px;
}

.validation-diagram-issues__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.validation-diagram-issues__count {
  font-size: 12px;
  color: var(--warning);
}

.validation-diagram-issues__count_errors {
  color: var(--danger);
}

.validation-diagram-issues__chevron {
  color: var(--text-subtle);
  transition: transform 0.15s ease;
}

.validation-diagram-issues__chevron._open {
  transform: rotate(180deg);
}

.validation-diagram-issues__list {
  margin: 0;
  padding: 4px 12px 10px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.validation-diagram-issues__issue {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.validation-diagram-issues__code {
  flex-shrink: 0;
  font-family: monospace;
  color: var(--text-subtle);
}

.validation-diagram-issues__issue_level_error .validation-diagram-issues__message {
  color: var(--danger);
}

.validation-diagram-issues__issue_level_warning .validation-diagram-issues__message {
  color: var(--warning);
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import BaseModal from '@/components/modals/BaseModal.vue'
import { useValidationScripts } from '@/composables/useValidationScripts'
import type { ValidationIssue, ValidationSnapshot } from '../sandbox/types'
import { runValidationScript } from '../sandbox/runValidationScript'

const props = defineProps<{
  snapshot: ValidationSnapshot
  openDiagramId: string | null
}>()

const emit = defineEmits<{
  close: []
  selectIssue: [issue: ValidationIssue]
}>()

const { t } = useI18n()
const { list, isLoading, error, fetchList, fetchById } = useValidationScripts()

const selectedId = ref<string | null>(null)
const isRunning = ref(false)
const hasRun = ref(false)
const runError = ref<string | null>(null)
const issues = ref<ValidationIssue[]>([])
const abortController = ref<AbortController | null>(null)

const scriptOptions = computed(() =>
  list.value.map((script) => ({
    id: script.id,
    label: script.name || t('common.unnamed'),
  })),
)

const canRun = computed(
  () => !!selectedId.value && !isRunning.value && !isLoading.value && list.value.length > 0,
)

onMounted(async () => {
  await fetchList({ size: 200 })
  if (list.value.length > 0) {
    selectedId.value = list.value[0]!.id
  }
})

watch(selectedId, () => {
  issues.value = []
  runError.value = null
  hasRun.value = false
})

async function handleRun(): Promise<void> {
  if (!selectedId.value || isRunning.value) return
  runError.value = null
  issues.value = []
  hasRun.value = false
  isRunning.value = true
  const controller = new AbortController()
  abortController.value = controller
  try {
    // Always load latest saved source from API (list payload may omit/stale source).
    const script = await fetchById(selectedId.value)
    if (!script?.source?.trim()) {
      runError.value = t('validationScripts.runEmptySource')
      return
    }
    const result = await runValidationScript({
      source: script.source,
      snapshot: props.snapshot,
      openDiagramId: props.openDiagramId,
      signal: controller.signal,
    })
    issues.value = result.issues
    hasRun.value = true
    if (result.error) {
      runError.value = result.timedOut
        ? t('validationScripts.runTimeout')
        : result.error
    }
  } finally {
    isRunning.value = false
    abortController.value = null
  }
}

function handleCancel(): void {
  abortController.value?.abort()
}

function levelLabel(level: ValidationIssue['level']): string {
  if (level === 'error') return t('validationScripts.issueError')
  if (level === 'warn') return t('validationScripts.issueWarn')
  return t('validationScripts.issueInfo')
}
</script>

<template>
  <BaseModal
    :title="t('validationScripts.runTitle')"
    max-width="560px"
    @close="emit('close')"
  >
    <div class="validation-run">
      <p class="validation-run__hint">
        {{
          openDiagramId
            ? t('validationScripts.runHintWithDiagram')
            : t('validationScripts.runHintModelOnly')
        }}
      </p>

      <div v-if="isLoading" class="validation-run__status">{{ t('common.loadingDash') }}</div>
      <div v-else-if="error" class="validation-run__error">{{ error }}</div>
      <div v-else-if="list.length === 0" class="validation-run__status">
        {{ t('validationScripts.noScripts') }}
      </div>
      <template v-else>
        <label class="validation-run__label">
          <span>{{ t('validationScripts.runSelect') }}</span>
          <SearchableSelect
            class="validation-run__select"
            :model-value="selectedId ?? ''"
            :options="scriptOptions"
            :placeholder="t('validationScripts.runSelectPlaceholder')"
            :search-placeholder="t('validationScripts.searchPlaceholder')"
            :empty-text="t('common.nothingFound')"
            :disabled="isRunning"
            @update:model-value="selectedId = $event || null"
          />
        </label>

        <p v-if="runError" class="validation-run__error">{{ runError }}</p>

        <div v-if="issues.length" class="validation-run__issues-wrap">
          <div class="validation-run__issues-title">
            {{ t('validationScripts.issuesTitle', { count: issues.length }) }}
          </div>
          <ul class="validation-run__issues">
            <li
              v-for="(issue, index) in issues"
              :key="`${issue.level}-${index}-${issue.message}`"
              class="validation-run__issue"
              :class="`validation-run__issue--${issue.level}`"
              @click="emit('selectIssue', issue)"
            >
              <span class="validation-run__level">{{ levelLabel(issue.level) }}</span>
              <span class="validation-run__message">{{ issue.message }}</span>
              <span
                v-if="issue.target"
                class="validation-run__target"
                :title="issue.target.id"
              >
                {{ issue.target.kind }} · {{ issue.target.id }}
              </span>
            </li>
          </ul>
        </div>
        <p
          v-else-if="hasRun && !runError"
          class="validation-run__status"
        >
          {{ t('validationScripts.runNoIssues') }}
        </p>
      </template>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t('common.close') }}
      </button>
      <button
        v-if="isRunning"
        type="button"
        class="btn btn--secondary"
        @click="handleCancel"
      >
        {{ t('validationScripts.cancelRun') }}
      </button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!canRun"
        @click="handleRun"
      >
        {{ isRunning ? t('validationScripts.running') : t('validationScripts.run') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.validation-run {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  width: 100%;
}

.validation-run__hint,
.validation-run__status {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}

.validation-run__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.validation-run__select {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.validation-run__error {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--danger);
  word-break: break-word;
}

.validation-run__issues-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.validation-run__issues-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.validation-run__issues {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: min(40vh, 280px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-muted);
}

.validation-run__issue {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s ease;
}

.validation-run__issue:last-child {
  border-bottom: none;
}

.validation-run__issue:hover {
  background: var(--surface);
}

.validation-run__level {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.validation-run__issue--error .validation-run__level {
  color: var(--danger);
}

.validation-run__issue--warn .validation-run__level {
  color: var(--warning);
}

.validation-run__issue--info .validation-run__level {
  color: var(--text-muted);
}

.validation-run__message {
  font-size: 13px;
  line-height: 1.45;
  color: var(--base-text);
  word-break: break-word;
  white-space: pre-wrap;
}

.validation-run__target {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--text-subtle);
  word-break: break-all;
}
</style>

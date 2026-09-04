<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import {
  fetchMergeLinksPreview,
  fetchMergeNodesPreview,
  mergeLinks,
  mergeNodes,
} from '@/features/models-validation/api'
import type {
  MergeLinksPreview,
  MergeNodesPreview,
  PreviewIncidentLink,
} from '@/features/models-validation/types'
import {
  buildTypePropertyDiff,
  collectTypeProperties,
  type TypePropertyDiffRow,
} from '@/features/models-validation/utils/typePropertiesDiff'

const props = defineProps<{
  modelId: string
  kind: 'node' | 'link'
  keepId: string
  dropId: string
}>()

const emit = defineEmits<{
  close: []
  merged: []
  refresh: []
}>()

const { t } = useI18n()

type Preview = MergeNodesPreview | MergeLinksPreview
type WizardStep = 1 | 2 | 3

const loading = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const conflict = ref(false)
const preview = ref<Preview | null>(null)
const rows = ref<TypePropertyDiffRow[]>([])
const transferSelected = reactive<Record<string, boolean>>({})
const step = ref<WizardStep>(1)

const nodesPreview = computed(() => {
  const current = preview.value
  if (!current || props.kind !== 'node' || !('uniqueLinks' in current)) return null
  return current
})

const differingRows = computed(() => rows.value.filter(row => !row.same))
const sameRows = computed(() => rows.value.filter(row => row.same))

const stepTitle = computed(() => {
  if (step.value === 1) return t('models.validationReportStepProperties')
  if (step.value === 2) return t('models.validationReportStepLinks')
  return t('models.validationReportStepConfirm')
})

const isLastStep = computed(() => step.value === 3)
const canGoBack = computed(() => step.value !== 1 && !loading.value)

function isNodesPreview(value: Preview): value is MergeNodesPreview {
  return 'uniqueLinks' in value
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatIncidentLink(link: PreviewIncidentLink): string {
  const arrow = link.direction === 'in' ? '←' : '→'
  return `${link.linkTypeName} ${arrow} ${link.otherNodeName}`
}

function resetTransfer(uniqueLinks: PreviewIncidentLink[]): void {
  for (const key of Object.keys(transferSelected)) {
    delete transferSelected[key]
  }
  for (const link of uniqueLinks) {
    transferSelected[link.id] = true
  }
}

async function loadPreview(): Promise<void> {
  loading.value = true
  submitting.value = false
  error.value = null
  conflict.value = false
  preview.value = null
  rows.value = []
  step.value = 1
  resetTransfer([])

  const pair = { keepId: props.keepId, dropId: props.dropId }
  const result =
    props.kind === 'node'
      ? await fetchMergeNodesPreview(props.modelId, pair)
      : await fetchMergeLinksPreview(props.modelId, pair)

  if (!result.success) {
    error.value = result.error.message
    loading.value = false
    return
  }

  preview.value = result.data
  rows.value = buildTypePropertyDiff(result.data.keepTypeProperties, result.data.dropTypeProperties)
  if (isNodesPreview(result.data)) {
    resetTransfer(result.data.uniqueLinks)
  }
  loading.value = false
}

function goNext(): void {
  if (step.value === 1) {
    step.value = props.kind === 'link' ? 3 : 2
    return
  }
  if (step.value === 2) {
    step.value = 3
  }
}

function goBack(): void {
  if (step.value === 3) {
    step.value = props.kind === 'link' ? 1 : 2
    return
  }
  if (step.value === 2) {
    step.value = 1
  }
}

function selectedTransferLinkIds(): string[] {
  return Object.entries(transferSelected)
    .filter(([, checked]) => checked)
    .map(([id]) => id)
}

async function submit(): Promise<void> {
  const current = preview.value
  if (!current || submitting.value || conflict.value) return

  submitting.value = true
  error.value = null

  const typeProperties = collectTypeProperties(rows.value)
  const result =
    props.kind === 'node'
      ? await mergeNodes(props.modelId, {
          keepId: props.keepId,
          dropId: props.dropId,
          typeProperties,
          transferLinkIds: selectedTransferLinkIds(),
          keepUpdatedAt: current.keepUpdatedAt,
          dropUpdatedAt: current.dropUpdatedAt,
        })
      : await mergeLinks(props.modelId, {
          keepId: props.keepId,
          dropId: props.dropId,
          typeProperties,
          keepUpdatedAt: current.keepUpdatedAt,
          dropUpdatedAt: current.dropUpdatedAt,
        })

  submitting.value = false

  if (result.success) {
    emit('merged')
    return
  }

  if (result.error.status === 409) {
    conflict.value = true
    return
  }

  error.value = result.error.message
}

watch(
  () => [props.modelId, props.kind, props.keepId, props.dropId] as const,
  () => {
    void loadPreview()
  },
  { immediate: true }
)
</script>

<template>
  <BaseModal :title="stepTitle" max-width="720px" @close="emit('close')">
    <div class="validation-merge-wizard">
      <ol class="validation-merge-wizard__steps">
        <li
          class="validation-merge-wizard__step"
          :class="{ 'validation-merge-wizard__step--active': step === 1 }"
        >
          {{ t('models.validationReportStepProperties') }}
        </li>
        <li
          v-if="kind === 'node'"
          class="validation-merge-wizard__step"
          :class="{ 'validation-merge-wizard__step--active': step === 2 }"
        >
          {{ t('models.validationReportStepLinks') }}
        </li>
        <li
          class="validation-merge-wizard__step"
          :class="{ 'validation-merge-wizard__step--active': step === 3 }"
        >
          {{ t('models.validationReportStepConfirm') }}
        </li>
      </ol>

      <p v-if="loading" class="validation-merge-wizard__status">{{ t('common.loading') }}</p>
      <p
        v-else-if="conflict"
        class="validation-merge-wizard__status validation-merge-wizard__status--error"
      >
        {{ t('models.validationReportConflict') }}
      </p>
      <p
        v-else-if="error"
        class="validation-merge-wizard__status validation-merge-wizard__status--error"
      >
        {{ error }}
      </p>

      <template v-else-if="preview">
        <section v-if="step === 1" class="validation-merge-wizard__panel">
          <p class="validation-merge-wizard__hint">
            {{ t('models.validationReportPropertiesHint') }}
          </p>
          <table v-if="differingRows.length > 0" class="validation-merge-wizard__table">
            <thead>
              <tr>
                <th>{{ t('models.validationReportPropertyColumn') }}</th>
                <th>{{ t('models.validationReportKeepColumn') }}</th>
                <th>{{ t('models.validationReportDropColumn') }}</th>
                <th>{{ t('models.validationReportResultColumn') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in differingRows" :key="row.key">
                <th scope="row">{{ row.key }}</th>
                <td>{{ formatValue(row.keepValue) }}</td>
                <td>{{ formatValue(row.dropValue) }}</td>
                <td>
                  <label class="validation-merge-wizard__choice">
                    <input v-model="row.choice" type="radio" :name="`diff-${row.key}`" value="keep" />
                    {{ t('models.validationReportUseKeepValue') }}
                  </label>
                  <label class="validation-merge-wizard__choice">
                    <input v-model="row.choice" type="radio" :name="`diff-${row.key}`" value="drop" />
                    {{ t('models.validationReportUseDropValue') }}
                  </label>
                </td>
              </tr>
            </tbody>
          </table>

          <details v-if="sameRows.length > 0" class="validation-merge-wizard__same">
            <summary>{{ sameRows.length }}</summary>
            <table class="validation-merge-wizard__table">
              <thead>
                <tr>
                  <th>{{ t('models.validationReportPropertyColumn') }}</th>
                  <th>{{ t('models.validationReportKeepColumn') }}</th>
                  <th>{{ t('models.validationReportDropColumn') }}</th>
                  <th>{{ t('models.validationReportResultColumn') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in sameRows" :key="row.key">
                  <th scope="row">{{ row.key }}</th>
                  <td>{{ formatValue(row.keepValue) }}</td>
                  <td>{{ formatValue(row.dropValue) }}</td>
                  <td>{{ t('models.validationReportUseKeepValue') }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </section>

        <section v-else-if="step === 2 && nodesPreview" class="validation-merge-wizard__panel">
          <ul v-if="nodesPreview.uniqueLinks.length > 0" class="validation-merge-wizard__links">
            <li v-for="link in nodesPreview.uniqueLinks" :key="link.id">
              <label class="validation-merge-wizard__transfer">
                <input v-model="transferSelected[link.id]" type="checkbox" />
                {{ t('models.validationReportTransferLink') }}
                <span>{{ formatIncidentLink(link) }}</span>
              </label>
            </li>
          </ul>

          <div v-if="nodesPreview.linksToDelete.length > 0" class="validation-merge-wizard__delete">
            <p>{{ t('models.validationReportLinksToDelete') }}</p>
            <ul>
              <li v-for="link in nodesPreview.linksToDelete" :key="link.id">
                {{ formatIncidentLink(link) }}
              </li>
            </ul>
          </div>

          <p class="validation-merge-wizard__reparent">
            {{
              t('models.validationReportReparentDiagrams', {
                count: nodesPreview.diagramsToReparentCount,
              })
            }}
          </p>
        </section>

        <section v-else-if="step === 3" class="validation-merge-wizard__panel">
          <p>
            {{ t('models.validationReportWillKeep') }}
            {{ keepId }}
            ({{ preview.keepDiagrams.length }})
          </p>
          <p>
            {{ t('models.validationReportWillDrop') }}
            {{ dropId }}
            ({{ preview.dropDiagrams.length }})
          </p>
          <p
            v-if="nodesPreview?.hasDocuments"
            class="validation-merge-wizard__warning"
          >
            {{ t('models.validationReportDocumentsWarning') }}
          </p>
        </section>
      </template>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn btn--secondary validation-merge-wizard__cancel"
        @click="emit('close')"
      >
        {{ t('models.validationReportCancel') }}
      </button>
      <button
        v-if="canGoBack && !conflict"
        type="button"
        class="btn btn--secondary validation-merge-wizard__back"
        :disabled="submitting"
        @click="goBack"
      >
        {{ t('common.back') }}
      </button>
      <button
        v-if="conflict"
        type="button"
        class="btn btn--primary validation-merge-wizard__refresh"
        @click="emit('refresh')"
      >
        {{ t('models.validationReportRefresh') }}
      </button>
      <button
        v-else-if="!isLastStep"
        type="button"
        class="btn btn--primary validation-merge-wizard__next"
        :disabled="loading || !preview"
        @click="goNext"
      >
        {{ t('common.forward') }}
      </button>
      <button
        v-else
        type="button"
        class="btn btn--primary validation-merge-wizard__submit"
        :disabled="loading || submitting || !preview"
        @click="submit"
      >
        {{ t('models.validationReportConfirmMerge') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.validation-merge-wizard {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.validation-merge-wizard__steps {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.validation-merge-wizard__step {
  font-size: 12px;
  color: var(--text-subtle);
}

.validation-merge-wizard__step--active {
  color: var(--base-text);
  font-weight: 600;
}

.validation-merge-wizard__status {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.validation-merge-wizard__status--error {
  color: var(--danger);
}

.validation-merge-wizard__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.validation-merge-wizard__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.validation-merge-wizard__table th,
.validation-merge-wizard__table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.validation-merge-wizard__choice {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 10px;
  font-size: 12px;
}

.validation-merge-wizard__same {
  font-size: 13px;
  color: var(--text-muted);
}

.validation-merge-wizard__links,
.validation-merge-wizard__delete ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.validation-merge-wizard__delete p,
.validation-merge-wizard__reparent,
.validation-merge-wizard__hint,
.validation-merge-wizard__panel > p {
  margin: 0;
  font-size: 13px;
}

.validation-merge-wizard__hint {
  color: var(--text-muted);
}

.validation-merge-wizard__transfer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.validation-merge-wizard__warning {
  color: var(--warning);
}

.validation-merge-wizard__delete {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-muted);
}
</style>

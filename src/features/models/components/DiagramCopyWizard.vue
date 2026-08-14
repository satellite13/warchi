<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import BaseModal from '@/components/modals/BaseModal.vue'
import { apiGet } from '@/composables/useApi'
import type { NodeResponse, NodeTypeResponse } from '@/types/api'
import type { ModelData, NotationData, PaginatedResponse } from '@/types/entities'
import { paginatedContent } from '@/utils/paginatedResponse'
import {
  pickDefaultTargetNotationId,
  type DiagramCopyEdgeBlocker,
  type DiagramCopyEntityPreview,
  type DiagramCopyResolutionAction,
  type DiagramCopyWarning,
} from '../composables/diagramCopyApi'
import {
  diagramCopyBlockerI18nKey,
  diagramCopyWarningI18nKey,
} from '../composables/diagramCopyIssueText'
import { fetchAllByModelId } from '../composables/modelEditorLoadModel'
import { useDiagramCopyWizard } from '../composables/useDiagramCopyWizard'

const props = defineProps<{
  open: boolean
  sourceModelId: string
  sourceDiagramId: string
  /** Notation of the source diagram; used as the default target when still available. */
  sourceNotationId?: string | null
}>()

const emit = defineEmits<{
  close: []
  committed: [payload: { targetModelId: string; diagramId: string }]
}>()

const { t, te } = useI18n()
const wizard = useDiagramCopyWizard({
  sourceModelId: computed(() => props.sourceModelId),
})

const folders = ref<NodeResponse[]>([])
const loadingCatalog = ref(false)
const catalogError = ref<string | null>(null)

const modelOptions = computed(() =>
  wizard.availableModels.value.map(model => ({
    id: model.id,
    label: `${model.name} (${model.version})`,
  }))
)

const notationOptions = computed(() =>
  wizard.availableNotations.value.map(notation => ({
    id: notation.id,
    label: `${notation.name} (${notation.version})`,
  }))
)

const folderOptions = computed(() =>
  folders.value.map(folder => ({
    id: folder.id,
    label: folder.name,
  }))
)

const canContinueTarget = computed(
  () =>
    !!wizard.targetModelId.value &&
    !!wizard.targetNotationId.value &&
    !!wizard.diagramName.value.trim() &&
    !!wizard.diagramVersion.value.trim() &&
    !!wizard.preview.value &&
    !wizard.loading.value
)

const resolvedNodes = computed(
  () => wizard.preview.value?.nodes.filter(entity => entity.effectiveAction !== 'SKIP').length ?? 0
)
const resolvedLinks = computed(
  () => wizard.preview.value?.links.filter(entity => entity.effectiveAction !== 'SKIP').length ?? 0
)

function isEditableModel(model: ModelData): boolean {
  return model.accessPermission !== 'VIEW'
}

function formatBlocker(blocker: DiagramCopyEdgeBlocker): string {
  const key = diagramCopyBlockerI18nKey(blocker)
  return key && te(key) ? t(key) : blocker.reason
}

function formatWarning(warning: DiagramCopyWarning): string {
  const key = diagramCopyWarningI18nKey(warning)
  return te(key) ? t(key) : warning.message
}

async function loadCatalog(): Promise<void> {
  loadingCatalog.value = true
  catalogError.value = null
  try {
    const [modelsResult, notationsResult] = await Promise.all([
      apiGet<PaginatedResponse<ModelData>>('/models?page=0&size=2000'),
      apiGet<PaginatedResponse<NotationData>>('/notations?page=0&size=2000'),
    ])

    if (!modelsResult.success) throw new Error(modelsResult.error.message)
    if (!notationsResult.success) throw new Error(notationsResult.error.message)

    wizard.availableModels.value = paginatedContent(modelsResult.data).filter(
      model => model.id !== props.sourceModelId && isEditableModel(model)
    )
    wizard.availableNotations.value = paginatedContent(notationsResult.data)
  } catch (error) {
    catalogError.value =
      error instanceof Error && error.message ? error.message : t('models.diagramCopy.error')
  } finally {
    loadingCatalog.value = false
  }
}

async function loadFolders(modelId: string): Promise<void> {
  folders.value = []
  wizard.folderNodeId.value = null
  if (!modelId) return

  try {
    const nodeTypesQuery = new URLSearchParams({
      page: '0',
      size: '2000',
      modelId,
    })
    const [nodes, nodeTypesResult] = await Promise.all([
      fetchAllByModelId<NodeResponse>('/nodes', modelId),
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${nodeTypesQuery.toString()}`),
    ])
    if (!nodeTypesResult.success) throw new Error(nodeTypesResult.error.message)

    const directoryTypeIds = new Set(
      paginatedContent(nodeTypesResult.data)
        .filter(type => type.name.trim().toLowerCase() === 'directory')
        .map(type => type.id)
    )
    folders.value = nodes
      .filter(node => directoryTypeIds.has(node.nodeTypeId))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    catalogError.value =
      error instanceof Error && error.message ? error.message : t('models.diagramCopy.folderError')
  }
}

async function initialize(): Promise<void> {
  await loadCatalog()
  if (!props.open || !props.sourceDiagramId) return

  const firstModel = wizard.availableModels.value[0]
  wizard.targetModelId.value = firstModel?.id ?? ''
  wizard.targetNotationId.value = pickDefaultTargetNotationId(
    wizard.availableNotations.value,
    props.sourceNotationId
  )
  if (wizard.targetModelId.value) await loadFolders(wizard.targetModelId.value)
  await wizard.open(props.sourceDiagramId)
}

function closeWizard(): void {
  if (wizard.loading.value) return
  wizard.close()
  emit('close')
}

function setAction(entity: DiagramCopyEntityPreview, action: DiagramCopyResolutionAction): void {
  const targetId =
    action === 'MATCH'
      ? (entity.effectiveTargetId ?? entity.autoMatchTargetId ?? entity.candidates[0]?.id)
      : undefined
  if (action === 'MATCH' && !targetId) return
  wizard.setResolution(entity.sourceId, {
    sourceId: entity.sourceId,
    action,
    targetId,
    kind: entity.kind,
  })
}

function setMatchTarget(entity: DiagramCopyEntityPreview, targetId: string): void {
  if (!targetId) return
  wizard.setResolution(entity.sourceId, {
    sourceId: entity.sourceId,
    action: 'MATCH',
    targetId,
    kind: entity.kind,
  })
}

function nextStep(): void {
  if (wizard.step.value === 1 && !canContinueTarget.value) return
  wizard.step.value = Math.min(4, wizard.step.value + 1)
}

function previousStep(): void {
  wizard.step.value = Math.max(1, wizard.step.value - 1)
}

async function finish(): Promise<void> {
  if (!wizard.canFinish.value) return
  const result = await wizard.commit()
  if (!result) return
  emit('committed', result)
  wizard.close()
}

watch(
  () => props.open,
  isOpen => {
    if (isOpen) void initialize()
    else wizard.close()
  },
  { immediate: true }
)

watch(
  () => props.sourceDiagramId,
  diagramId => {
    if (props.open && diagramId && diagramId !== wizard.sourceDiagramId.value) {
      void initialize()
    }
  }
)

watch(wizard.targetModelId, modelId => {
  if (wizard.show.value) void loadFolders(modelId)
})
</script>

<template>
  <BaseModal
    v-if="open && wizard.show.value"
    :title="t('models.diagramCopy.title')"
    max-width="980px"
    @close="closeWizard"
  >
    <div class="diagram-copy" :aria-busy="wizard.loading.value || loadingCatalog">
      <div class="diagram-copy__steps">
        <div
          v-for="(label, index) in [
            t('models.diagramCopy.stepTarget'),
            t('models.diagramCopy.stepElements'),
            t('models.diagramCopy.stepNotation'),
            t('models.diagramCopy.stepConfirm'),
          ]"
          :key="label"
          class="diagram-copy__step"
          :class="{ 'diagram-copy__step--active': wizard.step.value === index + 1 }"
        >
          {{ index + 1 }}. {{ label }}
        </div>
      </div>

      <p v-if="loadingCatalog || wizard.loading.value" class="diagram-copy__hint">
        {{ t('models.diagramCopy.loading') }}
      </p>
      <p v-if="catalogError" class="diagram-copy__error">{{ catalogError }}</p>
      <p v-if="wizard.error.value" class="diagram-copy__error">{{ wizard.error.value }}</p>

      <div v-if="wizard.step.value === 1" class="diagram-copy__panel">
        <label class="diagram-copy__field">
          <span>{{ t('models.diagramCopy.targetModel') }}</span>
          <SearchableSelect
            v-model="wizard.targetModelId.value"
            :options="modelOptions"
            :placeholder="t('models.diagramCopy.selectModel')"
            :search-placeholder="t('models.diagramCopy.search')"
            :empty-text="t('models.diagramCopy.noModels')"
            :disabled="loadingCatalog || wizard.loading.value"
          />
        </label>
        <label class="diagram-copy__field">
          <span>{{ t('models.diagramCopy.targetNotation') }}</span>
          <SearchableSelect
            v-model="wizard.targetNotationId.value"
            :options="notationOptions"
            :placeholder="t('models.diagramCopy.selectNotation')"
            :search-placeholder="t('models.diagramCopy.search')"
            :empty-text="t('models.diagramCopy.noNotations')"
            :disabled="loadingCatalog || wizard.loading.value"
          />
        </label>
        <div class="diagram-copy__field-grid">
          <label class="diagram-copy__field">
            <span>{{ t('models.diagramCopy.diagramName') }}</span>
            <input v-model="wizard.diagramName.value" type="text" />
          </label>
          <label class="diagram-copy__field">
            <span>{{ t('models.diagramCopy.diagramVersion') }}</span>
            <input v-model="wizard.diagramVersion.value" type="text" />
          </label>
        </div>
        <label class="diagram-copy__field">
          <span>{{ t('models.diagramCopy.folder') }}</span>
          <SearchableSelect
            :model-value="wizard.folderNodeId.value ?? ''"
            :options="folderOptions"
            :placeholder="t('models.diagramCopy.rootFolder')"
            :search-placeholder="t('models.diagramCopy.search')"
            :empty-text="t('models.diagramCopy.noFolders')"
            allow-empty
            :empty-label="t('models.diagramCopy.rootFolder')"
            :disabled="!wizard.targetModelId.value || wizard.loading.value"
            @update:model-value="wizard.folderNodeId.value = $event || null"
          />
        </label>
      </div>

      <div v-else-if="wizard.step.value === 2" class="diagram-copy__panel">
        <section
          v-for="group in [
            { key: 'nodes', title: t('models.diagramCopy.nodes'), rows: wizard.preview.value?.nodes ?? [] },
            { key: 'links', title: t('models.diagramCopy.links'), rows: wizard.preview.value?.links ?? [] },
          ]"
          :key="group.key"
          class="diagram-copy__section"
        >
          <h4>{{ group.title }}</h4>
          <div v-for="entity in group.rows" :key="entity.sourceId" class="diagram-copy__entity">
            <div class="diagram-copy__entity-name">
              <strong>{{ entity.label }}</strong>
              <span v-if="entity.autoMatchReason" class="diagram-copy__status">
                {{ t('models.diagramCopy.autoMatched') }}
              </span>
            </div>
            <div class="diagram-copy__actions">
              <label>
                <input
                  type="radio"
                  :name="`copy-${entity.kind}-${entity.sourceId}`"
                  :checked="entity.effectiveAction === 'MATCH'"
                  :disabled="entity.candidates.length === 0"
                  @change="setAction(entity, 'MATCH')"
                />
                {{ t('models.diagramCopy.actionMatch') }}
              </label>
              <label>
                <input
                  type="radio"
                  :name="`copy-${entity.kind}-${entity.sourceId}`"
                  :checked="entity.effectiveAction === 'CREATE'"
                  @change="setAction(entity, 'CREATE')"
                />
                {{ t('models.diagramCopy.actionCreate') }}
              </label>
              <label>
                <input
                  type="radio"
                  :name="`copy-${entity.kind}-${entity.sourceId}`"
                  :checked="entity.effectiveAction === 'SKIP'"
                  @change="setAction(entity, 'SKIP')"
                />
                {{ t('models.diagramCopy.actionSkip') }}
              </label>
            </div>
            <select
              v-if="entity.effectiveAction === 'MATCH'"
              :value="entity.effectiveTargetId ?? ''"
              @change="setMatchTarget(entity, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="candidate in entity.candidates" :key="candidate.id" :value="candidate.id">
                {{ candidate.label }}
              </option>
            </select>
          </div>
        </section>

        <section v-if="wizard.preview.value?.blockers.length" class="diagram-copy__issues">
          <h4>{{ t('models.diagramCopy.blockersTitle') }}</h4>
          <ul>
            <li v-for="blocker in wizard.preview.value.blockers" :key="blocker.edgeInstanceId">
              {{ formatBlocker(blocker) }}
            </li>
          </ul>
        </section>
      </div>

      <div v-else-if="wizard.step.value === 3" class="diagram-copy__panel">
        <div v-if="wizard.preview.value" class="diagram-copy__report">
          <p>
            {{
              t('models.diagramCopy.mappedComponents', {
                count: wizard.preview.value.notationRemap.mappedComponents,
              })
            }}
          </p>
          <p>
            {{
              t('models.diagramCopy.mappedRelations', {
                count: wizard.preview.value.notationRemap.mappedRelations,
              })
            }}
          </p>
          <section v-if="wizard.preview.value.notationRemap.unmappedComponents.length">
            <h4>{{ t('models.diagramCopy.unmappedComponents') }}</h4>
            <ul>
              <li
                v-for="name in wizard.preview.value.notationRemap.unmappedComponents"
                :key="name"
              >
                {{ name }}
              </li>
            </ul>
          </section>
          <section v-if="wizard.preview.value.notationRemap.unmappedRelations.length">
            <h4>{{ t('models.diagramCopy.unmappedRelations') }}</h4>
            <ul>
              <li v-for="name in wizard.preview.value.notationRemap.unmappedRelations" :key="name">
                {{ name }}
              </li>
            </ul>
          </section>
        </div>
        <section v-if="wizard.preview.value?.warnings.length" class="diagram-copy__issues">
          <h4>{{ t('models.diagramCopy.warningsTitle') }}</h4>
          <ul>
            <li v-for="warning in wizard.preview.value.warnings" :key="`${warning.code}-${warning.message}`">
              {{ formatWarning(warning) }}
            </li>
          </ul>
        </section>
      </div>

      <div v-else class="diagram-copy__panel">
        <h4>{{ t('models.diagramCopy.confirmSummary') }}</h4>
        <p>
          {{
            t('models.diagramCopy.summary', {
              name: wizard.diagramName.value,
              version: wizard.diagramVersion.value,
              nodes: resolvedNodes,
              links: resolvedLinks,
            })
          }}
        </p>
        <section v-if="wizard.preview.value?.blockers.length" class="diagram-copy__issues">
          <h4>{{ t('models.diagramCopy.blockersTitle') }}</h4>
          <ul>
            <li v-for="blocker in wizard.preview.value.blockers" :key="blocker.edgeInstanceId">
              {{ formatBlocker(blocker) }}
            </li>
          </ul>
        </section>
      </div>

      <div class="diagram-copy__footer">
        <button type="button" class="btn btn--secondary" :disabled="wizard.loading.value" @click="closeWizard">
          {{ t('models.diagramCopy.cancel') }}
        </button>
        <button
          v-if="wizard.step.value > 1"
          type="button"
          class="btn btn--secondary"
          :disabled="wizard.loading.value"
          @click="previousStep"
        >
          {{ t('models.diagramCopy.back') }}
        </button>
        <button
          v-if="wizard.step.value < 4"
          type="button"
          class="btn btn--primary"
          :disabled="wizard.loading.value || (wizard.step.value === 1 && !canContinueTarget)"
          @click="nextStep"
        >
          {{ t('models.diagramCopy.next') }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn--primary"
          :disabled="!wizard.canFinish.value"
          @click="finish"
        >
          {{ t('models.diagramCopy.finish') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.diagram-copy {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 280px;
}

.diagram-copy__steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.diagram-copy__step {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.diagram-copy__step--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.diagram-copy__panel,
.diagram-copy__section,
.diagram-copy__report {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diagram-copy__section h4,
.diagram-copy__issues h4,
.diagram-copy__panel > h4 {
  margin: 0;
}

.diagram-copy__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.diagram-copy__field-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(140px, 1fr);
  gap: 12px;
}

.diagram-copy__field input,
.diagram-copy__entity select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  font: inherit;
}

.diagram-copy__entity {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto minmax(180px, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.diagram-copy__entity-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diagram-copy__status {
  color: var(--success);
  font-size: 11px;
}

.diagram-copy__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 12px;
}

.diagram-copy__issues {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
  border-radius: 8px;
  color: var(--warning);
}

.diagram-copy__issues ul,
.diagram-copy__report ul {
  margin: 8px 0 0;
  padding-left: 20px;
}

.diagram-copy__hint,
.diagram-copy__error,
.diagram-copy__report p,
.diagram-copy__panel > p {
  margin: 0;
  font-size: 13px;
}

.diagram-copy__hint {
  color: var(--text-muted);
}

.diagram-copy__error {
  color: var(--danger);
}

.diagram-copy__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

@media (max-width: 760px) {
  .diagram-copy__steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .diagram-copy__entity {
    grid-template-columns: 1fr;
  }
}
</style>

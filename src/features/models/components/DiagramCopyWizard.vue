<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import BaseModal from '@/components/modals/BaseModal.vue'
import { apiGet } from '@/composables/useApi'
import type { ModelData, NotationData, PaginatedResponse } from '@/types/entities'
import { paginatedContent } from '@/utils/paginatedResponse'
import {
  pickDefaultTargetNotationId,
  canMatchDiagramCopyEntity,
  diagramCopyMatchCandidates,
  type DiagramCopyEdgeBlocker,
  type DiagramCopyEntityPreview,
  type DiagramCopyResolutionAction,
  type DiagramCopyWarning,
} from '../composables/diagramCopyApi'
import {
  diagramCopyBlockerI18nKey,
  diagramCopyWarningI18nKey,
} from '../composables/diagramCopyIssueText'
import { isDiagramNameVersionConflict, useDiagramCopyWizard } from '../composables/useDiagramCopyWizard'
import { useLazyFolderTree } from '../composables/useLazyFolderTree'
import type { TreeParentScope } from '../types'

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

const loadingCatalog = ref(false)
const catalogError = ref<string | null>(null)
const folderTree = useLazyFolderTree()

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

function formatWizardError(message: string): string {
  return isDiagramNameVersionConflict(message) ? t('models.diagramCopy.nameVersionExists') : message
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
  wizard.folderNodeId.value = null
  wizard.createParentNodeId.value = null
  folderTree.setModel(modelId)
  if (!modelId) return
  await folderTree.loadRoot()
}

const folderScope = (nodeId: string): TreeParentScope => ({ kind: 'node', nodeId })
const folderScopeState = (scope: TreeParentScope) =>
  folderTree.scopes.value.get(scope.kind === 'root' ? 'root' : `node:${scope.nodeId}`)

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
      ? (entity.effectiveTargetId ??
          entity.autoMatchTargetId ??
          diagramCopyMatchCandidates(entity)[0]?.id)
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
      <p v-if="wizard.error.value" class="diagram-copy__error">{{ formatWizardError(wizard.error.value) }}</p>

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
            <input v-model="wizard.diagramName.value" class="form-input" type="text" />
          </label>
          <label class="diagram-copy__field">
            <span>{{ t('models.diagramCopy.diagramVersion') }}</span>
            <input v-model="wizard.diagramVersion.value" class="form-input" type="text" />
          </label>
        </div>
        <fieldset class="diagram-copy__field diagram-copy__folder-picker">
          <legend>{{ t('models.diagramCopy.folder') }}</legend>
          <label class="diagram-copy__folder-row">
            <input
              v-model="wizard.folderNodeId.value"
              type="radio"
              name="diagram-copy-folder"
              :value="null"
            />
            <span>{{ t('models.diagramCopy.rootFolder') }}</span>
          </label>
          <div v-if="folderScopeState({ kind: 'root' })?.loading" class="diagram-copy__hint">
            {{ t('models.diagramCopy.loadingFolders') }}
          </div>
          <div v-else-if="folderScopeState({ kind: 'root' })?.error" class="diagram-copy__folder-status">
            <span class="diagram-copy__error">{{ folderScopeState({ kind: 'root' })?.error }}</span>
            <button type="button" class="btn btn--secondary" @click="folderTree.retry({ kind: 'root' })">
              {{ t('common.retry') }}
            </button>
          </div>
          <template v-else>
            <div
              v-for="row in folderTree.visibleRows.value"
              :key="row.node.id"
              class="diagram-copy__folder-branch"
            >
              <div
                class="diagram-copy__folder-row"
                :style="{ paddingLeft: `${row.depth * 20}px` }"
              >
                <button
                  v-if="row.node.hasChildren !== false"
                  type="button"
                  class="diagram-copy__folder-toggle"
                  :aria-label="
                    t(
                      folderScopeState(folderScope(row.node.id))?.expanded
                        ? 'models.diagramCopy.collapseFolder'
                        : 'models.diagramCopy.expandFolder'
                    )
                  "
                  :aria-expanded="folderScopeState(folderScope(row.node.id))?.expanded === true"
                  @click="folderTree.toggleFolder(row.node.id)"
                >
                  {{ folderScopeState(folderScope(row.node.id))?.expanded ? '▾' : '▸' }}
                </button>
                <span v-else class="diagram-copy__folder-toggle-spacer" />
                <label>
                  <input
                    v-model="wizard.folderNodeId.value"
                    type="radio"
                    name="diagram-copy-folder"
                    :value="row.node.id"
                  />
                  <span>{{ row.node.name }}</span>
                </label>
              </div>
              <div
                v-if="folderScopeState(folderScope(row.node.id))?.expanded"
                class="diagram-copy__folder-status"
                :style="{ paddingLeft: `${(row.depth + 1) * 20}px` }"
              >
                <span v-if="folderScopeState(folderScope(row.node.id))?.loading" class="diagram-copy__hint">
                  {{ t('models.diagramCopy.loadingFolders') }}
                </span>
                <template v-else-if="folderScopeState(folderScope(row.node.id))?.error">
                  <span class="diagram-copy__error">
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
            </div>
            <p v-if="folderTree.visibleRows.value.length === 0" class="diagram-copy__hint">
              {{ t('models.diagramCopy.noFolders') }}
            </p>
            <button
              v-if="folderScopeState({ kind: 'root' })?.hasMore"
              type="button"
              class="btn btn--secondary"
              @click="folderTree.loadMore({ kind: 'root' })"
            >
              {{ t('models.diagramCopy.loadMoreFolders') }}
            </button>
          </template>
        </fieldset>
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
                  :disabled="!canMatchDiagramCopyEntity(entity)"
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
              class="form-select"
              :value="entity.effectiveTargetId ?? ''"
              @change="setMatchTarget(entity, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="candidate in diagramCopyMatchCandidates(entity)"
                :key="candidate.id"
                :value="candidate.id"
              >
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

.diagram-copy__folder-picker {
  max-height: 280px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.diagram-copy__folder-branch {
  display: flex;
  flex-direction: column;
}

.diagram-copy__folder-row,
.diagram-copy__folder-row label,
.diagram-copy__folder-status {
  display: flex;
  gap: 8px;
  align-items: center;
}

.diagram-copy__folder-row {
  min-height: 30px;
}

.diagram-copy__folder-toggle {
  width: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.diagram-copy__folder-toggle-spacer {
  width: 24px;
}

.diagram-copy__folder-status {
  min-height: 28px;
}

.diagram-copy__field-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(140px, 1fr);
  gap: 12px;
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

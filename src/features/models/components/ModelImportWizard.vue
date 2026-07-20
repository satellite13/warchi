<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type { ComponentResponse, LinkTypeResponse, NodeTypeResponse, RelationResponse } from '@/types/api'
import type { NotationData } from '@/types/entities'
import { buildImportDraft } from '../utils/oef/oefDraftBuilder'
import {
  createInitialImportMappingState,
  loadCachedImportMappingState,
  mergeImportMappingState,
  saveCachedImportMappingState,
  type ImportMappingState,
} from '../utils/oef/mappingState'
import { buildImportMappingSuggestions, type ImportMappingSuggestions } from '../utils/oef/mappingSuggestions'
import { parseOefXml } from '../utils/oef/oefParser'
import { validateParsedOefModel } from '../utils/oef/oefImportValidation'
import type { ImportDraft, ImportIssue } from '../utils/oef/types'

const props = defineProps<{
  visible: boolean
  notations: NotationData[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  importBusy?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [{ draft: ImportDraft; notationId: string; mapping: ImportMappingState }]
}>()

const { t } = useI18n()
const currentStep = ref(1)
const selectedNotationId = ref<string>('')
const selectedFileName = ref<string>('')
const draft = ref<ImportDraft | null>(null)
const issues = ref<ImportIssue[]>([])
const parseError = ref<string | null>(null)
const showOnlyUnmapped = ref(true)
const mappingState = ref<ImportMappingState>({ elementTypeMap: {}, relationshipTypeMap: {} })
const suggestions = ref<ImportMappingSuggestions>({
  elementBySourceType: {},
  relationshipBySourceType: {},
})
const bulkElementValue = ref('')
const bulkRelationshipValue = ref('')

const nodeTypeById = computed(() => new Map(props.nodeTypes.map(item => [item.id, item])))
const linkTypeById = computed(() => new Map(props.linkTypes.map(item => [item.id, item])))
const componentById = computed(() => new Map(props.components.map(item => [item.id, item])))
const relationById = computed(() => new Map(props.relations.map(item => [item.id, item])))

const hasDraft = computed(() => !!draft.value)
const hasErrors = computed(() => issues.value.some(issue => issue.level === 'error'))
const warningCount = computed(() => issues.value.filter(issue => issue.level === 'warning').length)

const elementRows = computed(() => {
  const rows = draft.value?.sourceElementTypes ?? []
  if (!showOnlyUnmapped.value) return rows
  return rows.filter(type => !mappingState.value.elementTypeMap[type]?.nodeTypeId || !mappingState.value.elementTypeMap[type]?.componentId)
})

const relationshipRows = computed(() => {
  const rows = draft.value?.sourceRelationshipTypes ?? []
  if (!showOnlyUnmapped.value) return rows
  return rows.filter(type => !mappingState.value.relationshipTypeMap[type]?.linkTypeId || !mappingState.value.relationshipTypeMap[type]?.relationId)
})

const mappedElementsCount = computed(() =>
  Object.values(mappingState.value.elementTypeMap).filter(item => !!item.nodeTypeId && !!item.componentId).length
)
const mappedRelationshipsCount = computed(() =>
  Object.values(mappingState.value.relationshipTypeMap).filter(item => !!item.linkTypeId && !!item.relationId).length
)
const bulkElementOptions = computed(() => {
  const out: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const type of draft.value?.sourceElementTypes ?? []) {
    for (const option of elementCandidates(type)) {
      if (seen.has(option.value)) continue
      seen.add(option.value)
      out.push(option)
    }
  }
  return out
})
const bulkRelationshipOptions = computed(() => {
  const out: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const type of draft.value?.sourceRelationshipTypes ?? []) {
    for (const option of relationshipCandidates(type)) {
      if (seen.has(option.value)) continue
      seen.add(option.value)
      out.push(option)
    }
  }
  return out
})

const canMoveToMappings = computed(() => hasDraft.value && !!selectedNotationId.value && !hasErrors.value)
const canMoveToPreview = computed(
  () =>
    canMoveToMappings.value &&
    mappedElementsCount.value === (draft.value?.sourceElementTypes.length ?? 0) &&
    mappedRelationshipsCount.value === (draft.value?.sourceRelationshipTypes.length ?? 0)
)
const canSubmit = computed(() => currentStep.value === 3 && canMoveToPreview.value && !props.importBusy)

function resetState(): void {
  currentStep.value = 1
  selectedFileName.value = ''
  draft.value = null
  issues.value = []
  parseError.value = null
  showOnlyUnmapped.value = true
  bulkElementValue.value = ''
  bulkRelationshipValue.value = ''
  mappingState.value = { elementTypeMap: {}, relationshipTypeMap: {} }
  suggestions.value = { elementBySourceType: {}, relationshipBySourceType: {} }
}

watch(
  () => props.visible,
  visible => {
    if (!visible) return
    if (!selectedNotationId.value && props.notations.length > 0) {
      selectedNotationId.value = props.notations[0]!.id
    }
  },
  { immediate: true }
)

watch(
  () => selectedNotationId.value,
  () => {
    if (!draft.value || !selectedNotationId.value) return
    rebuildMappings(draft.value, selectedNotationId.value)
  }
)

function rebuildMappings(nextDraft: ImportDraft, notationId: string): void {
  const nextSuggestions = buildImportMappingSuggestions({
    sourceElementTypes: nextDraft.sourceElementTypes,
    sourceRelationshipTypes: nextDraft.sourceRelationshipTypes,
    notationId,
    nodeTypes: props.nodeTypes,
    linkTypes: props.linkTypes,
    components: props.components,
    relations: props.relations,
  })
  suggestions.value = nextSuggestions
  const initial = createInitialImportMappingState({
    sourceElementTypes: nextDraft.sourceElementTypes,
    sourceRelationshipTypes: nextDraft.sourceRelationshipTypes,
    suggestions: nextSuggestions,
  })
  mappingState.value = mergeImportMappingState(initial, loadCachedImportMappingState(notationId))
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  parseError.value = null
  selectedFileName.value = file.name
  try {
    const xml = await file.text()
    const parsed = parseOefXml(xml)
    const validation = validateParsedOefModel(parsed)
    const nextDraft = buildImportDraft(parsed)
    draft.value = nextDraft
    issues.value = validation.issues
    if (!selectedNotationId.value && props.notations.length > 0) {
      selectedNotationId.value = props.notations[0]!.id
    }
    if (selectedNotationId.value) {
      rebuildMappings(nextDraft, selectedNotationId.value)
    }
    currentStep.value = 1
  } catch (error) {
    draft.value = null
    issues.value = []
    parseError.value = error instanceof Error ? error.message : t('models.oefImportReadError')
  } finally {
    input.value = ''
  }
}

function onSelectElementMapping(sourceType: string, value: string): void {
  const [nodeTypeId, componentId] = value.split('::')
  mappingState.value.elementTypeMap[sourceType] = {
    nodeTypeId: nodeTypeId || null,
    componentId: componentId || null,
  }
}

function onSelectRelationshipMapping(sourceType: string, value: string): void {
  const [linkTypeId, relationId] = value.split('::')
  mappingState.value.relationshipTypeMap[sourceType] = {
    linkTypeId: linkTypeId || null,
    relationId: relationId || null,
  }
}

function applyBulkElementMapping(): void {
  if (!bulkElementValue.value || !draft.value) return
  for (const sourceType of elementRows.value) {
    onSelectElementMapping(sourceType, bulkElementValue.value)
  }
}

function applyBulkRelationshipMapping(): void {
  if (!bulkRelationshipValue.value || !draft.value) return
  for (const sourceType of relationshipRows.value) {
    onSelectRelationshipMapping(sourceType, bulkRelationshipValue.value)
  }
}

function elementMappingValue(sourceType: string): string {
  const mapping = mappingState.value.elementTypeMap[sourceType]
  if (!mapping?.nodeTypeId || !mapping.componentId) return ''
  return `${mapping.nodeTypeId}::${mapping.componentId}`
}

function relationshipMappingValue(sourceType: string): string {
  const mapping = mappingState.value.relationshipTypeMap[sourceType]
  if (!mapping?.linkTypeId || !mapping.relationId) return ''
  return `${mapping.linkTypeId}::${mapping.relationId}`
}

function elementCandidates(sourceType: string): Array<{ value: string; label: string }> {
  const rows = suggestions.value.elementBySourceType[sourceType] ?? []
  return rows
    .filter(row => row.nodeTypeId && row.componentId)
    .map(row => {
      const nodeType = nodeTypeById.value.get(row.nodeTypeId!)
      const component = componentById.value.get(row.componentId!)
      return {
        value: `${row.nodeTypeId}::${row.componentId}`,
        label: `${nodeType?.name ?? row.nodeTypeId} / ${component?.name ?? row.componentId}`,
      }
    })
}

function relationshipCandidates(sourceType: string): Array<{ value: string; label: string }> {
  const rows = suggestions.value.relationshipBySourceType[sourceType] ?? []
  return rows
    .filter(row => row.linkTypeId && row.relationId)
    .map(row => {
      const linkType = linkTypeById.value.get(row.linkTypeId!)
      const relation = relationById.value.get(row.relationId!)
      return {
        value: `${row.linkTypeId}::${row.relationId}`,
        label: `${linkType?.name ?? row.linkTypeId} / ${relation?.name ?? row.relationId}`,
      }
    })
}

function closeWizard(): void {
  emit('close')
  resetState()
}

function prevStep(): void {
  currentStep.value = Math.max(1, currentStep.value - 1)
}

function nextStep(): void {
  if (currentStep.value === 1 && canMoveToMappings.value) {
    currentStep.value = 2
    return
  }
  if (currentStep.value === 2 && canMoveToPreview.value) {
    currentStep.value = 3
  }
}

function submitImport(): void {
  if (!draft.value || !selectedNotationId.value || !canSubmit.value) return
  saveCachedImportMappingState(selectedNotationId.value, mappingState.value)
  emit('submit', {
    draft: draft.value,
    notationId: selectedNotationId.value,
    mapping: mappingState.value,
  })
}
</script>

<template>
  <BaseModal v-if="visible" :title="t('models.oefImportTitle')" max-width="980px" @close="closeWizard">
    <div class="oef-import">
      <div class="oef-import__steps">
        <div class="oef-import__step" :class="{ 'oef-import__step--active': currentStep === 1 }">1. {{ t('models.oefImportStepAnalyze') }}</div>
        <div class="oef-import__step" :class="{ 'oef-import__step--active': currentStep === 2 }">2. {{ t('models.oefImportStepMapping') }}</div>
        <div class="oef-import__step" :class="{ 'oef-import__step--active': currentStep === 3 }">3. {{ t('models.oefImportStepPreview') }}</div>
      </div>

      <div v-if="currentStep === 1" class="oef-import__panel">
        <div class="oef-import__row">
          <label class="oef-import__label">{{ t('models.oefImportTargetNotation') }}</label>
          <select v-model="selectedNotationId" class="oef-import__select">
            <option v-for="notation in notations" :key="notation.id" :value="notation.id">
              {{ notation.name }} ({{ notation.version }})
            </option>
          </select>
        </div>

        <div class="oef-import__row">
          <label class="oef-import__label">{{ t('models.oefImportSourceFile') }}</label>
          <input class="oef-import__file" type="file" accept=".xml,text/xml,application/xml" @change="onFileChange" />
          <p v-if="selectedFileName" class="oef-import__hint">
            {{ t('models.oefImportSelectedFile', { name: selectedFileName }) }}
          </p>
        </div>

        <p v-if="parseError" class="oef-import__error">{{ parseError }}</p>

        <template v-if="hasDraft && draft">
          <div class="oef-import__stats">
            <span>{{ t('models.oefImportStatNodes', { count: draft.nodes.length }) }}</span>
            <span>{{ t('models.oefImportStatLinks', { count: draft.links.length }) }}</span>
            <span>{{ t('models.oefImportStatDiagrams', { count: draft.diagrams.length }) }}</span>
          </div>
          <p v-if="hasErrors" class="oef-import__error">{{ t('models.oefImportIssuesBlocking') }}</p>
          <div v-if="issues.length > 0" class="oef-import__issues">
            <h4>{{ t('models.oefImportIssuesTitle') }}</h4>
            <ul>
              <li
                v-for="(issue, index) in issues.slice(0, 50)"
                :key="`step1-${issue.code}-${index}`"
                :class="issue.level === 'error' ? 'oef-import__issue-error' : 'oef-import__issue-warning'"
              >
                {{ issue.message }}
              </li>
            </ul>
            <p v-if="issues.length > 50" class="oef-import__hint">
              {{ t('models.oefImportIssuesTruncated', { shown: 50, total: issues.length }) }}
            </p>
          </div>
        </template>
      </div>

      <div v-if="currentStep === 2 && hasDraft && draft" class="oef-import__panel">
        <div class="oef-import__toolbar">
          <label class="oef-import__checkbox">
            <input v-model="showOnlyUnmapped" type="checkbox" />
            <span>{{ t('models.oefImportShowOnlyUnmapped') }}</span>
          </label>
          <span class="oef-import__progress">
            {{ t('models.oefImportMappedProgress', { mapped: mappedElementsCount + mappedRelationshipsCount, total: draft.sourceElementTypes.length + draft.sourceRelationshipTypes.length }) }}
          </span>
        </div>

        <div class="oef-import__mapping">
          <h4>{{ t('models.oefImportElementMappings') }}</h4>
          <div class="oef-import__bulk">
            <select v-model="bulkElementValue" class="oef-import__select">
              <option value="">{{ t('models.oefImportBulkSelect') }}</option>
              <option v-for="option in bulkElementOptions" :key="`bulk-el-${option.value}`" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <button type="button" class="btn btn--secondary" :disabled="!bulkElementValue" @click="applyBulkElementMapping">
              {{ t('models.oefImportApplyToVisible') }}
            </button>
          </div>
          <div v-for="sourceType in elementRows" :key="`e-${sourceType}`" class="oef-import__mapping-row">
            <span class="oef-import__source">{{ sourceType }}</span>
            <select
              :value="elementMappingValue(sourceType)"
              class="oef-import__select"
              @change="onSelectElementMapping(sourceType, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('common.none') }}</option>
              <option v-for="option in elementCandidates(sourceType)" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="oef-import__mapping">
          <h4>{{ t('models.oefImportRelationshipMappings') }}</h4>
          <div class="oef-import__bulk">
            <select v-model="bulkRelationshipValue" class="oef-import__select">
              <option value="">{{ t('models.oefImportBulkSelect') }}</option>
              <option v-for="option in bulkRelationshipOptions" :key="`bulk-rel-${option.value}`" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <button type="button" class="btn btn--secondary" :disabled="!bulkRelationshipValue" @click="applyBulkRelationshipMapping">
              {{ t('models.oefImportApplyToVisible') }}
            </button>
          </div>
          <div v-for="sourceType in relationshipRows" :key="`r-${sourceType}`" class="oef-import__mapping-row">
            <span class="oef-import__source">{{ sourceType }}</span>
            <select
              :value="relationshipMappingValue(sourceType)"
              class="oef-import__select"
              @change="onSelectRelationshipMapping(sourceType, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('common.none') }}</option>
              <option v-for="option in relationshipCandidates(sourceType)" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="currentStep === 3 && hasDraft && draft" class="oef-import__panel">
        <div class="oef-import__stats">
          <span>{{ t('models.oefImportStatNodes', { count: draft.nodes.length }) }}</span>
          <span>{{ t('models.oefImportStatLinks', { count: draft.links.length }) }}</span>
          <span>{{ t('models.oefImportStatDiagrams', { count: draft.diagrams.length }) }}</span>
        </div>
        <p class="oef-import__hint">
          {{ t('models.oefImportPreviewMapped', { nodes: mappedElementsCount, links: mappedRelationshipsCount }) }}
        </p>
        <div v-if="issues.length > 0" class="oef-import__issues">
          <h4>{{ t('models.oefImportIssuesTitle') }}</h4>
          <ul>
            <li
              v-for="(issue, index) in issues"
              :key="`${issue.code}-${index}`"
              :class="issue.level === 'error' ? 'oef-import__issue-error' : 'oef-import__issue-warning'"
            >
              {{ issue.message }}
            </li>
          </ul>
        </div>
        <p v-else-if="warningCount > 0" class="oef-import__hint">{{ t('models.oefImportWarningsHint') }}</p>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn--secondary" @click="closeWizard">
        {{ t('common.cancel') }}
      </button>
      <button v-if="currentStep > 1" type="button" class="btn btn--secondary" @click="prevStep">
        {{ t('models.oefImportPrevStep') }}
      </button>
      <button
        v-if="currentStep < 3"
        type="button"
        class="btn btn--primary"
        :disabled="(currentStep === 1 && !canMoveToMappings) || (currentStep === 2 && !canMoveToPreview)"
        @click="nextStep"
      >
        {{ t('models.oefImportNextStep') }}
      </button>
      <button v-else type="button" class="btn btn--primary" :disabled="!canSubmit" @click="submitImport">
        {{ importBusy ? t('common.loading') : t('models.oefImportRun') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.oef-import {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.oef-import__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.oef-import__step {
  font-size: 12px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  text-align: center;
}

.oef-import__step--active {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-soft);
}

.oef-import__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.oef-import__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oef-import__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.oef-import__select,
.oef-import__file {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--base-text);
  padding: 7px 10px;
  font-size: 13px;
}

.oef-import__stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-muted);
}

.oef-import__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.oef-import__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.oef-import__progress {
  font-size: 12px;
  color: var(--text-muted);
}

.oef-import__mapping {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oef-import__bulk {
  display: flex;
  gap: 8px;
}

.oef-import__mapping-row {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.oef-import__source {
  font-size: 13px;
  color: var(--base-text);
}

.oef-import__issues {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.oef-import__issues ul {
  margin: 6px 0 0;
  padding-left: 16px;
}

.oef-import__issue-error {
  color: var(--danger);
}

.oef-import__issue-warning {
  color: var(--warning);
}

.oef-import__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.oef-import__error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import type {
  ComponentResponse,
  LinkTypeResponse,
  NodeTypeResponse,
  RelationResponse,
  RelationRuleResponse,
} from '@/types/api'
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
import { groupImportIssues } from '../utils/oef/groupImportIssues'
import {
  formatUploadBytes,
  normalizeOefFile,
  toOefParsedModel,
  type OefNormalizeProgress,
} from '../utils/oef/oefNormalizeApi'
import { buildOrganizationImportPlan } from '../utils/oef/organizationImport'
import {
  collectDisallowedOefLinkGroups,
  type DisallowedOefLinkGroup,
  type OefRelationRuleDecision,
} from '../utils/oef/oefRelationRuleValidation'
import type { ImportDraft, ImportIssue, ImportIssueCode } from '../utils/oef/types'

const props = withDefaults(
  defineProps<{
    visible: boolean
    modelId: string
    notations: NotationData[]
    nodeTypes: NodeTypeResponse[]
    linkTypes: LinkTypeResponse[]
    components: ComponentResponse[]
    relations: RelationResponse[]
    relationRules?: RelationRuleResponse[]
    importBusy?: boolean
    importProgress?: string | null
    /** Loads components/relations/types for a notation not yet used by model diagrams. */
    ensureNotationCatalog?: (notationId: string) => Promise<void>
  }>(),
  {
    relationRules: () => [],
  }
)

const emit = defineEmits<{
  close: []
  submit: [
    {
      draft: ImportDraft
      notationId: string
      mapping: ImportMappingState
      ruleDecisions: Record<string, OefRelationRuleDecision>
    },
  ]
}>()

const { t } = useI18n()
const currentStep = ref(1)
const selectedNotationId = ref<string>('')
const selectedFileName = ref<string>('')
const draft = ref<ImportDraft | null>(null)
const issues = ref<ImportIssue[]>([])
const parseError = ref<string | null>(null)
const isAnalyzing = ref(false)
const analyzePhase = ref<'uploading' | 'processing'>('uploading')
const uploadPercent = ref(0)
const uploadLoaded = ref(0)
const uploadTotal = ref(0)
const showOnlyUnmapped = ref(true)
const mappingState = ref<ImportMappingState>({ elementTypeMap: {}, relationshipTypeMap: {} })
const suggestions = ref<ImportMappingSuggestions>({
  elementBySourceType: {},
  relationshipBySourceType: {},
})
const bulkElementValue = ref('')
const bulkRelationshipValue = ref('')
const isLoadingCatalog = ref(false)
const catalogError = ref<string | null>(null)
const ruleDecisions = ref<Record<string, OefRelationRuleDecision>>({})
const isStepBusy = ref(false)
const stepBusyMessage = ref('')

const nodeTypeById = computed(() => new Map(props.nodeTypes.map(item => [item.id, item])))
const linkTypeById = computed(() => new Map(props.linkTypes.map(item => [item.id, item])))
const componentById = computed(() => new Map(props.components.map(item => [item.id, item])))
const relationById = computed(() => new Map(props.relations.map(item => [item.id, item])))

const hasDraft = computed(() => !!draft.value)
const hasErrors = computed(() => issues.value.some(issue => issue.level === 'error'))
const warningCount = computed(() => issues.value.filter(issue => issue.level === 'warning').length)
const groupedIssues = computed(() => groupImportIssues(issues.value))
const expandedIssueCodes = ref<Set<string>>(new Set())

function issueGroupKey(code: ImportIssueCode, level: string): string {
  return `${level}:${code}`
}

function isIssueGroupExpanded(code: ImportIssueCode, level: string): boolean {
  return expandedIssueCodes.value.has(issueGroupKey(code, level))
}

function toggleIssueGroup(code: ImportIssueCode, level: string): void {
  const key = issueGroupKey(code, level)
  const next = new Set(expandedIssueCodes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedIssueCodes.value = next
}

function issueGroupLabel(code: ImportIssueCode, sampleMessage: string): string {
  const key = `models.oefImportIssue.${code}`
  const translated = t(key)
  return translated === key ? sampleMessage : translated
}

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
const plannedFolderCount = computed(() =>
  buildOrganizationImportPlan(draft.value?.organizations).directories.length
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

const canMoveToMappings = computed(
  () =>
    hasDraft.value &&
    !!selectedNotationId.value &&
    !hasErrors.value &&
    !isAnalyzing.value &&
    !isLoadingCatalog.value
)
const disallowedLinkGroups = computed((): DisallowedOefLinkGroup[] => {
  if (!draft.value || !selectedNotationId.value) return []
  return collectDisallowedOefLinkGroups({
    draft: draft.value,
    mapping: mappingState.value,
    relationRules: props.relationRules,
  })
})

const allRelationRuleDecisionsMade = computed(() =>
  disallowedLinkGroups.value.every(group => {
    const decision = ruleDecisions.value[group.key]
    return decision === 'skip' || decision === 'import'
  })
)

const plannedLinksCount = computed(() => {
  if (!draft.value) return 0
  const skipped = new Set<string>()
  for (const group of disallowedLinkGroups.value) {
    if (ruleDecisions.value[group.key] === 'skip') {
      for (const id of group.sourceRelationshipIds) skipped.add(id)
    }
  }
  let count = 0
  const relationshipIds = new Set(draft.value.links.map(link => link.sourceRelationshipId))
  const nodeTypeByElementId = new Map(
    draft.value.nodes.map(node => [node.sourceElementId, node.sourceType])
  )
  for (const link of draft.value.links) {
    if (relationshipIds.has(link.sourceElementId) || relationshipIds.has(link.targetElementId)) {
      continue
    }
    const sourceElementType = nodeTypeByElementId.get(link.sourceElementId)
    const targetElementType = nodeTypeByElementId.get(link.targetElementId)
    if (!sourceElementType || !targetElementType) continue
    const sourceMapped = mappingState.value.elementTypeMap[sourceElementType]
    const targetMapped = mappingState.value.elementTypeMap[targetElementType]
    const relMapped = mappingState.value.relationshipTypeMap[link.sourceType]
    if (
      !sourceMapped?.componentId ||
      !targetMapped?.componentId ||
      !relMapped?.relationId ||
      !relMapped.linkTypeId
    ) {
      continue
    }
    if (skipped.has(link.sourceRelationshipId)) continue
    count += 1
  }
  return count
})

const canMoveToPreview = computed(
  () =>
    canMoveToMappings.value &&
    mappedElementsCount.value === (draft.value?.sourceElementTypes.length ?? 0) &&
    mappedRelationshipsCount.value === (draft.value?.sourceRelationshipTypes.length ?? 0) &&
    allRelationRuleDecisionsMade.value
)
const canSubmit = computed(() => currentStep.value === 3 && canMoveToPreview.value && !props.importBusy)

const showBusyOverlay = computed(
  () => isStepBusy.value || isLoadingCatalog.value || !!props.importBusy
)
const busyOverlayMessage = computed(() => {
  if (props.importBusy) {
    return props.importProgress || t('models.oefImportProgressPreparing')
  }
  if (isStepBusy.value && stepBusyMessage.value) return stepBusyMessage.value
  if (isLoadingCatalog.value) return t('models.oefImportCatalogLoading')
  return stepBusyMessage.value
})

const footerBusy = computed(() => isStepBusy.value || !!props.importBusy)

const analyzeProgressLabel = computed(() => {
  if (!isAnalyzing.value) return ''
  if (analyzePhase.value === 'processing') {
    return t('models.oefImportProcessing')
  }
  if (uploadTotal.value > 0) {
    return t('models.oefImportUploadingBytes', {
      loaded: formatUploadBytes(uploadLoaded.value),
      total: formatUploadBytes(uploadTotal.value),
      percent: uploadPercent.value,
    })
  }
  return t('models.oefImportUploading', { percent: uploadPercent.value })
})

const analyzeBarWidth = computed(() => {
  if (!isAnalyzing.value) return '0%'
  if (analyzePhase.value === 'processing') return '100%'
  return `${Math.max(0, Math.min(100, uploadPercent.value))}%`
})

function resetAnalyzeProgress(): void {
  analyzePhase.value = 'uploading'
  uploadPercent.value = 0
  uploadLoaded.value = 0
  uploadTotal.value = 0
}

function onNormalizeProgress(progress: OefNormalizeProgress): void {
  analyzePhase.value = progress.phase
  uploadPercent.value = progress.percent
  uploadLoaded.value = progress.loaded
  uploadTotal.value = progress.total
}

function resetState(): void {
  currentStep.value = 1
  selectedFileName.value = ''
  draft.value = null
  issues.value = []
  parseError.value = null
  isAnalyzing.value = false
  resetAnalyzeProgress()
  showOnlyUnmapped.value = true
  bulkElementValue.value = ''
  bulkRelationshipValue.value = ''
  isLoadingCatalog.value = false
  catalogError.value = null
  isStepBusy.value = false
  stepBusyMessage.value = ''
  mappingState.value = { elementTypeMap: {}, relationshipTypeMap: {} }
  suggestions.value = { elementBySourceType: {}, relationshipBySourceType: {} }
  expandedIssueCodes.value = new Set()
  ruleDecisions.value = {}
}

function setRuleDecision(key: string, decision: OefRelationRuleDecision): void {
  ruleDecisions.value = { ...ruleDecisions.value, [key]: decision }
}

watch(disallowedLinkGroups, groups => {
  const alive = new Set(groups.map(group => group.key))
  const next: Record<string, OefRelationRuleDecision> = {}
  for (const [key, value] of Object.entries(ruleDecisions.value)) {
    if (alive.has(key)) next[key] = value
  }
  ruleDecisions.value = next
})

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
  async notationId => {
    if (!draft.value || !notationId) return
    await ensureCatalogAndRebuild(notationId, draft.value)
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
  ruleDecisions.value = {}
}

async function ensureCatalogAndRebuild(notationId: string, nextDraft: ImportDraft): Promise<void> {
  isLoadingCatalog.value = true
  catalogError.value = null
  try {
    if (props.ensureNotationCatalog) {
      await props.ensureNotationCatalog(notationId)
      await nextTick()
    }
    rebuildMappings(nextDraft, notationId)
  } catch (error) {
    catalogError.value =
      error instanceof Error && error.message
        ? error.message
        : t('models.oefImportCatalogLoadFailed')
  } finally {
    isLoadingCatalog.value = false
  }
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!props.modelId) {
    parseError.value = t('models.oefImportNormalizeMissingModel')
    input.value = ''
    return
  }
  parseError.value = null
  selectedFileName.value = file.name
  isAnalyzing.value = true
  resetAnalyzeProgress()
  uploadTotal.value = file.size
  try {
    const result = await normalizeOefFile(props.modelId, file, onNormalizeProgress)
    if (!result.success) {
      draft.value = null
      issues.value = []
      parseError.value = result.error.message || t('models.oefImportReadError')
      return
    }
    const parsed = toOefParsedModel(result.data)
    const nextDraft = buildImportDraft(parsed)
    draft.value = nextDraft
    issues.value = (Array.isArray(result.data.issues) ? result.data.issues : []) as ImportIssue[]
    if (!selectedNotationId.value && props.notations.length > 0) {
      // Watch on selectedNotationId will load catalog + rebuild mappings.
      selectedNotationId.value = props.notations[0]!.id
    } else if (selectedNotationId.value) {
      await ensureCatalogAndRebuild(selectedNotationId.value, nextDraft)
    }
    currentStep.value = 1
  } catch (error) {
    draft.value = null
    issues.value = []
    parseError.value = error instanceof Error ? error.message : t('models.oefImportReadError')
  } finally {
    isAnalyzing.value = false
    resetAnalyzeProgress()
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

function elementOptionLabel(nodeTypeId: string, componentId: string): string {
  const nodeType = nodeTypeById.value.get(nodeTypeId)
  const component = componentById.value.get(componentId)
  return t('models.oefImportElementOptionLabel', {
    nodeType: nodeType?.name ?? nodeTypeId,
    component: component?.name ?? componentId,
  })
}

function relationshipOptionLabel(linkTypeId: string, relationId: string): string {
  const linkType = linkTypeById.value.get(linkTypeId)
  const relation = relationById.value.get(relationId)
  return t('models.oefImportRelationshipOptionLabel', {
    linkType: linkType?.name ?? linkTypeId,
    relation: relation?.name ?? relationId,
  })
}

/** Suggested matches first, then every component of the selected notation. */
function elementCandidates(sourceType: string): Array<{ value: string; label: string }> {
  const notationId = selectedNotationId.value
  const ordered: string[] = []
  const seen = new Set<string>()

  for (const row of suggestions.value.elementBySourceType[sourceType] ?? []) {
    if (!row.nodeTypeId || !row.componentId) continue
    const value = `${row.nodeTypeId}::${row.componentId}`
    if (seen.has(value)) continue
    seen.add(value)
    ordered.push(value)
  }

  const rest = props.components
    .filter(item => item.notationId === notationId)
    .map(item => `${item.nodeTypeId}::${item.id}`)
    .filter(value => !seen.has(value))
    .sort((a, b) => {
      const [aNt = '', aCmp = ''] = a.split('::')
      const [bNt = '', bCmp = ''] = b.split('::')
      return elementOptionLabel(aNt, aCmp).localeCompare(elementOptionLabel(bNt, bCmp))
    })

  return [...ordered, ...rest].map(value => {
    const [nodeTypeId = '', componentId = ''] = value.split('::')
    return { value, label: elementOptionLabel(nodeTypeId, componentId) }
  })
}

/** Suggested matches first, then every relation of the selected notation. */
function relationshipCandidates(sourceType: string): Array<{ value: string; label: string }> {
  const notationId = selectedNotationId.value
  const ordered: string[] = []
  const seen = new Set<string>()

  for (const row of suggestions.value.relationshipBySourceType[sourceType] ?? []) {
    if (!row.linkTypeId || !row.relationId) continue
    const value = `${row.linkTypeId}::${row.relationId}`
    if (seen.has(value)) continue
    seen.add(value)
    ordered.push(value)
  }

  const rest = props.relations
    .filter(item => item.notationId === notationId)
    .map(item => `${item.linkTypeId}::${item.id}`)
    .filter(value => !seen.has(value))
    .sort((a, b) => {
      const [aLt = '', aRel = ''] = a.split('::')
      const [bLt = '', bRel = ''] = b.split('::')
      return relationshipOptionLabel(aLt, aRel).localeCompare(relationshipOptionLabel(bLt, bRel))
    })

  return [...ordered, ...rest].map(value => {
    const [linkTypeId = '', relationId = ''] = value.split('::')
    return { value, label: relationshipOptionLabel(linkTypeId, relationId) }
  })
}

function closeWizard(): void {
  if (isStepBusy.value || props.importBusy) return
  emit('close')
  resetState()
}

function yieldToPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function runStepTransition(
  message: string,
  work: () => void | Promise<void>
): Promise<void> {
  if (isStepBusy.value) return
  isStepBusy.value = true
  stepBusyMessage.value = message
  await nextTick()
  await yieldToPaint()
  try {
    await work()
    await nextTick()
    await yieldToPaint()
  } finally {
    isStepBusy.value = false
    stepBusyMessage.value = ''
  }
}

async function prevStep(): Promise<void> {
  if (isStepBusy.value || props.importBusy) return
  const target = Math.max(1, currentStep.value - 1)
  if (target === currentStep.value) return
  if (target === 2) {
    await runStepTransition(t('models.oefImportPreparingMapping'), () => {
      currentStep.value = target
    })
    return
  }
  currentStep.value = target
}

async function nextStep(): Promise<void> {
  if (isStepBusy.value || props.importBusy) return
  if (currentStep.value === 1 && canMoveToMappings.value) {
    await runStepTransition(t('models.oefImportPreparingMapping'), async () => {
      if (draft.value && selectedNotationId.value) {
        await ensureCatalogAndRebuild(selectedNotationId.value, draft.value)
        if (catalogError.value) return
      }
      // Switch step under the busy overlay so footer buttons do not flicker/overlap.
      currentStep.value = 2
    })
    return
  }
  if (currentStep.value === 2 && canMoveToPreview.value) {
    await runStepTransition(t('models.oefImportPreparingPreview'), () => {
      currentStep.value = 3
    })
  }
}

async function submitImport(): Promise<void> {
  if (!draft.value || !selectedNotationId.value || !canSubmit.value) return
  if (isStepBusy.value || props.importBusy) return
  saveCachedImportMappingState(selectedNotationId.value, mappingState.value)
  emit('submit', {
    draft: draft.value,
    notationId: selectedNotationId.value,
    mapping: mappingState.value,
    ruleDecisions: { ...ruleDecisions.value },
  })
}
</script>

<template>
  <BaseModal v-if="visible" :title="t('models.oefImportTitle')" max-width="980px" @close="closeWizard">
    <div class="oef-import" :aria-busy="showBusyOverlay || isAnalyzing || !!importBusy">
      <div v-if="showBusyOverlay" class="oef-import__busy" aria-live="polite">
        <div class="oef-import__busy-spinner" aria-hidden="true" />
        <p class="oef-import__busy-text">{{ busyOverlayMessage }}</p>
      </div>
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
          <input
            class="oef-import__file"
            type="file"
            accept=".xml,text/xml,application/xml"
            :disabled="isAnalyzing || importBusy"
            @change="onFileChange"
          />
          <p v-if="selectedFileName" class="oef-import__hint">
            {{ t('models.oefImportSelectedFile', { name: selectedFileName }) }}
          </p>
          <div v-if="isAnalyzing" class="oef-import__upload-progress" aria-live="polite">
            <div class="oef-import__upload-bar" role="progressbar" :aria-valuenow="uploadPercent" aria-valuemin="0" aria-valuemax="100">
              <div
                class="oef-import__upload-fill"
                :class="{ 'oef-import__upload-fill--processing': analyzePhase === 'processing' }"
                :style="{ width: analyzeBarWidth }"
              />
            </div>
            <p class="oef-import__hint">{{ analyzeProgressLabel }}</p>
          </div>
        </div>

        <p v-if="parseError" class="oef-import__error">{{ parseError }}</p>
        <p v-if="isLoadingCatalog" class="oef-import__hint">{{ t('models.oefImportCatalogLoading') }}</p>
        <p v-if="catalogError" class="oef-import__error">{{ catalogError }}</p>

        <template v-if="hasDraft && draft">
          <div class="oef-import__stats">
            <span>{{ t('models.oefImportStatNodes', { count: draft.nodes.length }) }}</span>
            <span>{{ t('models.oefImportStatLinks', { count: draft.links.length }) }}</span>
            <span>{{ t('models.oefImportStatDiagrams', { count: draft.diagrams.length }) }}</span>
            <span v-if="plannedFolderCount > 0">{{
              t('models.oefImportStatFolders', { count: plannedFolderCount })
            }}</span>
          </div>
          <p v-if="hasErrors" class="oef-import__error">{{ t('models.oefImportIssuesBlocking') }}</p>
          <div v-if="groupedIssues.length > 0" class="oef-import__issues">
            <h4>
              {{ t('models.oefImportIssuesTitle') }}
              <span class="oef-import__issues-count">{{ issues.length }}</span>
            </h4>
            <ul class="oef-import__issue-groups">
              <li
                v-for="group in groupedIssues"
                :key="`step1-${group.level}-${group.code}`"
                :class="group.level === 'error' ? 'oef-import__issue-error' : 'oef-import__issue-warning'"
              >
                <div class="oef-import__issue-group-row">
                  <span>
                    {{ issueGroupLabel(group.code, group.sampleMessage) }}
                    <span class="oef-import__issue-badge">×{{ group.count }}</span>
                  </span>
                  <button
                    v-if="group.entityIds.length > 0"
                    type="button"
                    class="oef-import__issue-toggle"
                    @click="toggleIssueGroup(group.code, group.level)"
                  >
                    {{
                      isIssueGroupExpanded(group.code, group.level)
                        ? t('models.oefImportIssuesHideIds')
                        : t('models.oefImportIssuesShowIds')
                    }}
                  </button>
                </div>
                <p
                  v-if="isIssueGroupExpanded(group.code, group.level)"
                  class="oef-import__issue-ids"
                >
                  {{ group.entityIds.join(', ')
                  }}{{ group.count > group.entityIds.length ? '…' : '' }}
                </p>
              </li>
            </ul>
          </div>
        </template>
      </div>

      <div v-if="currentStep === 2 && hasDraft && draft" class="oef-import__panel">
        <p v-if="isLoadingCatalog" class="oef-import__hint">{{ t('models.oefImportCatalogLoading') }}</p>
        <p v-if="catalogError" class="oef-import__error">{{ catalogError }}</p>
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
          <p class="oef-import__hint">{{ t('models.oefImportElementMappingHint') }}</p>
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
          <div class="oef-import__mapping-row oef-import__mapping-row--header" aria-hidden="true">
            <span>{{ t('models.oefImportColSourceType') }}</span>
            <span>{{ t('models.oefImportColNodeTypeComponent') }}</span>
          </div>
          <div v-for="sourceType in elementRows" :key="`e-${sourceType}`" class="oef-import__mapping-row">
            <span class="oef-import__source">{{ sourceType }}</span>
            <select
              :value="elementMappingValue(sourceType)"
              class="oef-import__select"
              :aria-label="t('models.oefImportColNodeTypeComponent')"
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
          <p class="oef-import__hint">{{ t('models.oefImportRelationshipMappingHint') }}</p>
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
          <div class="oef-import__mapping-row oef-import__mapping-row--header" aria-hidden="true">
            <span>{{ t('models.oefImportColSourceType') }}</span>
            <span>{{ t('models.oefImportColLinkTypeRelation') }}</span>
          </div>
          <div v-for="sourceType in relationshipRows" :key="`r-${sourceType}`" class="oef-import__mapping-row">
            <span class="oef-import__source">{{ sourceType }}</span>
            <select
              :value="relationshipMappingValue(sourceType)"
              class="oef-import__select"
              :aria-label="t('models.oefImportColLinkTypeRelation')"
              @change="onSelectRelationshipMapping(sourceType, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('common.none') }}</option>
              <option v-for="option in relationshipCandidates(sourceType)" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div
          v-if="disallowedLinkGroups.length > 0"
          class="oef-import__mapping oef-import__relation-rules"
        >
          <h4>{{ t('models.oefImportRelationRulesTitle') }}</h4>
          <p class="oef-import__hint">{{ t('models.oefImportRelationRulesHint') }}</p>
          <p
            v-if="!allRelationRuleDecisionsMade"
            class="oef-import__hint oef-import__hint--warn"
          >
            {{ t('models.oefImportRelationRulesNeedDecision') }}
          </p>
          <div
            v-for="group in disallowedLinkGroups"
            :key="group.key"
            class="oef-import__rule-group"
          >
            <span class="oef-import__source">
              {{
                t('models.oefImportRelationRulesGroupLabel', {
                  relationshipType: group.relationshipType,
                  sourceType: group.sourceElementType,
                  targetType: group.targetElementType,
                  relationName: relationById.get(group.relationId)?.name ?? group.relationId,
                  count: group.count,
                })
              }}
            </span>
            <div class="oef-import__rule-actions">
              <label>
                <input
                  type="radio"
                  :name="`rule-${group.key}`"
                  :checked="ruleDecisions[group.key] === 'skip'"
                  @change="setRuleDecision(group.key, 'skip')"
                />
                {{ t('models.oefImportRelationRulesSkip') }}
              </label>
              <label>
                <input
                  type="radio"
                  :name="`rule-${group.key}`"
                  :checked="ruleDecisions[group.key] === 'import'"
                  @change="setRuleDecision(group.key, 'import')"
                />
                {{ t('models.oefImportRelationRulesImport') }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentStep === 3 && hasDraft && draft" class="oef-import__panel">
        <div class="oef-import__stats">
          <span>{{ t('models.oefImportStatNodes', { count: draft.nodes.length }) }}</span>
          <span>{{ t('models.oefImportStatLinksPlanned', { count: plannedLinksCount }) }}</span>
          <span>{{ t('models.oefImportStatDiagrams', { count: draft.diagrams.length }) }}</span>
          <span v-if="plannedFolderCount > 0">{{
            t('models.oefImportStatFolders', { count: plannedFolderCount })
          }}</span>
        </div>
        <p class="oef-import__hint">
          {{ t('models.oefImportPreviewMapped', { nodes: mappedElementsCount, links: mappedRelationshipsCount }) }}
        </p>
        <div v-if="groupedIssues.length > 0" class="oef-import__issues">
          <h4>
            {{ t('models.oefImportIssuesTitle') }}
            <span class="oef-import__issues-count">{{ issues.length }}</span>
          </h4>
          <p v-if="warningCount > 0 && !hasErrors" class="oef-import__hint">
            {{ t('models.oefImportWarningsHint') }}
          </p>
          <ul class="oef-import__issue-groups">
            <li
              v-for="group in groupedIssues"
              :key="`step3-${group.level}-${group.code}`"
              :class="group.level === 'error' ? 'oef-import__issue-error' : 'oef-import__issue-warning'"
            >
              <div class="oef-import__issue-group-row">
                <span>
                  {{ issueGroupLabel(group.code, group.sampleMessage) }}
                  <span class="oef-import__issue-badge">×{{ group.count }}</span>
                </span>
                <button
                  v-if="group.entityIds.length > 0"
                  type="button"
                  class="oef-import__issue-toggle"
                  @click="toggleIssueGroup(group.code, group.level)"
                >
                  {{
                    isIssueGroupExpanded(group.code, group.level)
                      ? t('models.oefImportIssuesHideIds')
                      : t('models.oefImportIssuesShowIds')
                  }}
                </button>
              </div>
              <p
                v-if="isIssueGroupExpanded(group.code, group.level)"
                class="oef-import__issue-ids"
              >
                {{ group.entityIds.join(', ')
                }}{{ group.count > group.entityIds.length ? '…' : '' }}
              </p>
            </li>
          </ul>
        </div>
      </div>

      <div class="oef-import__footer">
        <button type="button" class="btn btn--secondary" :disabled="footerBusy" @click="closeWizard">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          :class="{ 'oef-import__footer-btn--placeholder': currentStep <= 1 }"
          :disabled="currentStep <= 1 || footerBusy"
          :tabindex="currentStep <= 1 ? -1 : 0"
          :aria-hidden="currentStep <= 1"
          @click="prevStep"
        >
          {{ t('models.oefImportPrevStep') }}
        </button>
        <button
          v-if="currentStep < 3"
          type="button"
          class="btn btn--primary"
          :disabled="
            footerBusy ||
            (currentStep === 1 && !canMoveToMappings) ||
            (currentStep === 2 && !canMoveToPreview)
          "
          @click="nextStep"
        >
          {{ isStepBusy ? t('common.loading') : t('models.oefImportNextStep') }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn--primary"
          :disabled="!canSubmit || footerBusy"
          @click="submitImport"
        >
          {{ importBusy ? t('common.loading') : t('models.oefImportRun') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.oef-import {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 240px;
}

.oef-import__busy {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(1px);
  cursor: wait;
}

.oef-import__busy-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: oef-import-busy-spin 0.8s linear infinite;
}

.oef-import__busy-text {
  margin: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}

@keyframes oef-import-busy-spin {
  to {
    transform: rotate(360deg);
  }
}

.oef-import__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: nowrap;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
  margin-top: 2px;
}

.oef-import__footer-btn--placeholder {
  visibility: hidden;
  pointer-events: none;
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
  min-height: 0;
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
  max-height: min(280px, 45vh);
  overflow-y: auto;
  padding-right: 4px;
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

.oef-import__mapping-row--header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.oef-import__source {
  font-size: 13px;
  color: var(--base-text);
}

.oef-import__issues {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.oef-import__issues h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.oef-import__issues-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.oef-import__issue-groups {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(240px, 40vh);
  overflow-y: auto;
}

.oef-import__issue-groups > li {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}

.oef-import__issue-group-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.oef-import__issue-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.oef-import__issue-toggle {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.oef-import__issue-toggle:hover {
  text-decoration: underline;
}

.oef-import__issue-ids {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
  max-height: 72px;
  overflow-y: auto;
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

.oef-import__upload-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oef-import__upload-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  overflow: hidden;
}

.oef-import__upload-fill {
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: var(--primary);
  transition: width 0.15s ease-out;
}

.oef-import__upload-fill--processing {
  background: linear-gradient(90deg, var(--primary), var(--primary-hover), var(--primary));
  background-size: 200% 100%;
  animation: oef-import-upload-pulse 1.2s linear infinite;
}

@keyframes oef-import-upload-pulse {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.oef-import__error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}

.oef-import__rule-group {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border, #e5e5e5);
}

.oef-import__rule-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.oef-import__hint--warn {
  color: var(--warning, #e67e22);
}
</style>

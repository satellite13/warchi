<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/composables/useApi'
import { useAuth } from '@/composables/useAuth'
import {
  acquireAutoMergeLock,
  fetchAutoMergeLock,
  fetchValidationReport,
  releaseAutoMergeLock,
} from '@/features/models-validation/api'
import { autoMergeDuplicates } from '@/features/models-validation/utils/autoMerge'
import type { AutoMergeOptions, AutoMergeResult } from '@/features/models-validation/utils/autoMerge'
import ValidationAutoMergeDialog from '@/features/models-validation/components/ValidationAutoMergeDialog.vue'
import type { AutoMergeLock } from '@/features/models-validation/api'
import type { ValidationReport } from '@/features/models-validation/types'
import type { ModelData } from '@/types/entities'
import ValidationDuplicateGroup from '@/features/models-validation/components/ValidationDuplicateGroup.vue'
import ValidationDiagramIssues from '@/features/models-validation/components/ValidationDiagramIssues.vue'
import ValidationMergeWizard from '@/features/models-validation/components/ValidationMergeWizard.vue'
import ValidationUnusedElements from '@/features/models-validation/components/ValidationUnusedElements.vue'
import MainLayout from '@/layouts/MainLayout.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

type PendingMerge = {
  keepId: string
  dropId: string
  kind: 'node' | 'link'
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const modelId = computed(() => String(route.params.id ?? ''))
const model = ref<Pick<ModelData, 'name' | 'version'> | null>(null)
const report = ref<ValidationReport | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)
const pendingMerge = ref<PendingMerge | null>(null)
const { isAdmin, currentUser } = useAuth()

const autoMergeLock = ref<AutoMergeLock | null>(null)
const lockHeldByOther = computed(
  () =>
    (autoMergeLock.value?.locked ?? false) &&
    autoMergeLock.value?.lockedBy != null &&
    autoMergeLock.value.lockedBy !== currentUser.value?.id
)
const autoMergeDisabled = computed(() => autoMerging.value || lockHeldByOther.value)
const autoMergeLockHint = computed(() =>
  lockHeldByOther.value
    ? t('models.validationAutoMergeLockedBy', {
        name: autoMergeLock.value?.lockedByName ?? '',
      })
    : t('models.validationAutoMergeHint')
)

async function refreshAutoMergeLock(): Promise<void> {
  const result = await fetchAutoMergeLock(modelId.value)
  autoMergeLock.value = result.success ? result.data : null
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!autoMerging.value) return
  event.preventDefault()
  event.returnValue = ''
}

const diagramIssues = computed(() => report.value?.diagramIssues ?? [])
const unusedNodes = computed(() => report.value?.unusedNodes ?? [])
const unusedLinks = computed(() => report.value?.unusedLinks ?? [])
const unusedTotal = computed(
  () => (report.value?.unusedNodesTotal ?? unusedNodes.value.length) +
    (report.value?.unusedLinksTotal ?? unusedLinks.value.length)
)

type ValidationTab = 'nodes' | 'links' | 'diagrams' | 'unused'

const activeTab = ref<ValidationTab>('nodes')

const tabDesc: Record<ValidationTab, string> = {
  nodes: 'models.validationTabDescNodes',
  links: 'models.validationTabDescLinks',
  diagrams: 'models.validationTabDescDiagrams',
  unused: 'models.validationTabDescUnused',
}

const tabs = computed(() => {
  const current = report.value
  return [
    {
      key: 'nodes' as const,
      label: t('models.validationReportNodes'),
      shown: current?.duplicateNodes.length ?? 0,
      total: current?.duplicateNodesTotal,
    },
    {
      key: 'links' as const,
      label: t('models.validationReportLinks'),
      shown: current?.duplicateLinks.length ?? 0,
      total: current?.duplicateLinksTotal,
    },
    {
      key: 'diagrams' as const,
      label: t('models.validationReportDiagrams'),
      shown: diagramIssues.value.length,
      total: current?.diagramIssuesTotal,
    },
    {
      key: 'unused' as const,
      label: t('models.validationReportUnused'),
      shown: unusedNodes.value.length + unusedLinks.value.length,
      total: unusedTotal.value,
    },
  ]
})

const activeTabItem = computed(() => tabs.value.find(tab => tab.key === activeTab.value))
const activeTabCapped = computed(() => {
  const tab = activeTabItem.value
  return tab != null && tab.total != null && tab.total > tab.shown
})
const isDuplicatesTab = computed(() => activeTab.value === 'nodes' || activeTab.value === 'links')

const autoMerging = ref(false)
const autoMergeProgress = ref<string | null>(null)
const autoMergeResult = ref<AutoMergeResult | null>(null)
const autoMergeOptions = ref<AutoMergeOptions>({ includeLinks: true, propsPolicy: 'skip', childrenPolicy: 'skip' })
const showAutoMergeDialog = ref(false)
const autoMergePhase = ref<'setup' | 'running' | 'done'>('setup')
const autoMergeLive = ref<{ label: string | null; merged: number; skipped: number } | null>(null)
const autoMergeStopRequested = ref(false)
const hasDuplicates = computed(
  () =>
    (report.value?.duplicateNodes.length ?? 0) > 0 || (report.value?.duplicateLinks.length ?? 0) > 0
)

const isEmpty = computed(() => {
  const current = report.value
  if (!current) return false
  return (
    current.duplicateNodes.length === 0 &&
    current.duplicateLinks.length === 0 &&
    diagramIssues.value.length === 0 &&
    unusedNodes.value.length === 0 &&
    unusedLinks.value.length === 0
  )
})

function openAutoMergeDialog(): void {
  autoMergeResult.value = null
  showAutoMergeDialog.value = true
}

async function onAutoMergeConfirmed(options: AutoMergeOptions): Promise<void> {
  if (!report.value || autoMergePhase.value !== 'setup') return

  autoMergeOptions.value = options
  autoMergePhase.value = 'running'
  autoMergeStopRequested.value = false
  autoMergeLive.value = { label: null, merged: 0, skipped: 0 }
  autoMergeResult.value = null
  error.value = null
  success.value = null

  const acquired = await acquireAutoMergeLock(modelId.value)
  if (!acquired.success) {
    error.value = t('models.validationAutoMergeAborted', {
      message: acquired.error.message ?? 'lock unavailable',
    })
    autoMergePhase.value = 'setup'
    await refreshAutoMergeLock()
    return
  }

  let totalMerged = 0
  const allSkipped = new Map<string, AutoMergeResult['skipped'][number]>()
  let aborted: string | undefined
  let stopped = false

  try {
    const maxPasses = 30
    let pass = 0
    while (pass < maxPasses) {
      pass += 1
      if (pass > 1) {
        // Heartbeat: keep the lock fresh and fetch the next page of duplicates
        // without touching the page state (no loading spinner, no layout swap).
        await acquireAutoMergeLock(modelId.value)
        const fresh = await fetchValidationReport(modelId.value)
        if (!fresh.success) break
        report.value = fresh.data
      }
      const current = report.value
      if (!current) break
      const linkGroups = options.includeLinks ? current.duplicateLinks : []
      if (current.duplicateNodes.length === 0 && linkGroups.length === 0) break

      const result = await autoMergeDuplicates({
        modelId: modelId.value,
        nodeGroups: current.duplicateNodes,
        linkGroups,
        options,
        shouldStop: () => autoMergeStopRequested.value,
        onProgress: progress => {
          autoMergeLive.value = {
            label: `${t('models.validationAutoMergePassLabel', { pass })} · ${t(
              'models.validationAutoMergeProgress',
              { done: progress.done, total: progress.total }
            )}`,
            merged: totalMerged,
            skipped: allSkipped.size,
          }
        },
      })
      totalMerged += result.mergedGroups
      for (const item of result.skipped) {
        allSkipped.set(`${item.title}:${item.reason}`, item)
      }
      if (result.aborted) {
        aborted = result.aborted
        break
      }
      if (result.stoppedByUser) {
        stopped = true
        break
      }
      if (result.mergedGroups === 0) break
    }

    autoMergeResult.value = {
      mergedGroups: totalMerged,
      skipped: [...allSkipped.values()],
      ...(stopped ? { stoppedByUser: true } : {}),
      ...(aborted ? { aborted } : {}),
    }
  } finally {
    await releaseAutoMergeLock(modelId.value)
    await refreshAutoMergeLock()
  }

  autoMergePhase.value = 'done'
  if (aborted) {
    error.value = t('models.validationAutoMergeAborted', { message: aborted })
  }
}

function onAutoMergeDialogClosed(): void {
  showAutoMergeDialog.value = false
  const result = autoMergeResult.value
  if (result) {
    if (result.stoppedByUser) {
      success.value = t('models.validationAutoMergeStopped', { merged: result.mergedGroups })
    } else if (result.aborted) {
      // error already set
    } else if (result.skipped.length > 0) {
      success.value = t('models.validationAutoMergeDoneWithSkips', {
        merged: result.mergedGroups,
        skipped: result.skipped.length,
      })
    } else {
      success.value = t('models.validationAutoMergeDone', { merged: result.mergedGroups })
    }
  }
  autoMergePhase.value = 'setup'
  autoMergeLive.value = null
  void load()
}

function groupCountLabel(shown: number, total?: number): string {
  if (total != null && total > shown) {
    return t('models.validationReportShownOf', { shown, total })
  }
  return String(shown)
}

function pickDefaultTab(): void {
  if ((report.value?.duplicateNodes.length ?? 0) > 0) activeTab.value = 'nodes'
  else if ((report.value?.duplicateLinks.length ?? 0) > 0) activeTab.value = 'links'
  else if (diagramIssues.value.length > 0) activeTab.value = 'diagrams'
  else if (unusedNodes.value.length > 0 || unusedLinks.value.length > 0) activeTab.value = 'unused'
  else activeTab.value = 'nodes'
}

async function load(): Promise<void> {
  const id = modelId.value
  if (!id) return

  loading.value = true
  error.value = null
  report.value = null

  const [modelResult, reportResult] = await Promise.all([
    apiGet<ModelData>(`/models/${encodeURIComponent(id)}`),
    fetchValidationReport(id),
  ])

  model.value = modelResult.success
    ? { name: modelResult.data.name, version: modelResult.data.version }
    : null

  if (reportResult.success) {
    report.value = reportResult.data
    pickDefaultTab()
  } else {
    const serverMessage = reportResult.error.message?.trim()
    error.value = serverMessage
      ? `${t('models.validationReportLoadError')}: ${serverMessage}`
      : t('models.validationReportLoadError')
  }

  loading.value = false
}

watch(
  () => modelId.value,
  value => {
    if (value) {
      void load()
      void refreshAutoMergeLock()
    }
  },
  { immediate: true }
)

window.addEventListener('beforeunload', onBeforeUnload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

function onMerge(payload: PendingMerge): void {
  success.value = null
  pendingMerge.value = payload
}

function onWizardClose(): void {
  pendingMerge.value = null
}

async function onMerged(): Promise<void> {
  pendingMerge.value = null
  success.value = t('common.saved')
  await load()
}

async function onUnusedDeleted(): Promise<void> {
  success.value = t('models.validationReportUnusedDeleted')
  await load()
}

async function onWizardRefresh(): Promise<void> {
  pendingMerge.value = null
  success.value = null
  await load()
}
</script>

<template>
  <MainLayout>
    <template #header>
      <AppHeader />
    </template>
    <template #default>
      <div class="model-validation">
        <div class="model-validation__topbar">
          <button
            class="model-validation__back"
            type="button"
            :title="t('toolbar.backToModels')"
            @click="router.push({ name: 'model-editor', params: { id: modelId } })"
          >
            <UiIcon name="arrow_back" />
          </button>
          <div class="model-validation__titles">
            <h1 class="model-validation__title">{{ t('models.validationReportTitle') }}</h1>
            <p class="model-validation__subtitle">{{ model?.name }} {{ model?.version }}</p>
          </div>
        </div>

        <p v-if="success" class="model-validation__success">{{ success }}</p>
        <p v-if="error" class="model-validation__error">{{ error }}</p>
        <p v-else-if="loading" class="model-validation__loading">{{ t('common.loading') }}</p>
        <p v-else-if="isEmpty" class="model-validation__empty">{{ t('models.validationReportEmpty') }}</p>
        <div v-else-if="report" class="model-validation__content">
          <div v-if="isAdmin && hasDuplicates && isDuplicatesTab" class="model-validation__automerge">
            <button
              type="button"
              class="model-validation__automerge-btn"
              :disabled="autoMergeDisabled"
              :title="autoMergeLockHint"
              @click="openAutoMergeDialog"
            >
              {{ t('models.validationAutoMerge') }}
            </button>
            <p v-if="autoMergeProgress" class="model-validation__automerge-progress">
              {{ autoMergeProgress }}
            </p>
            <template v-else-if="autoMergeResult">
              <ul class="model-validation__automerge-skips">
                <li v-for="(item, idx) in autoMergeResult.skipped" :key="idx">
                  <span class="model-validation__automerge-skip-title">{{ item.title }}</span>
                  — {{ t(`models.validationAutoMergeSkip.${item.reason}`) }}
                  <span v-if="item.message">: {{ item.message }}</span>
                </li>
              </ul>
            </template>
          </div>

          <div class="model-validation__tabs" role="tablist">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              role="tab"
              class="model-validation__tab"
              :class="{ _active: activeTab === tab.key }"
              :aria-selected="activeTab === tab.key"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
              <span class="model-validation__tab-count">{{ tab.shown }}</span>
            </button>
          </div>

          <div class="model-validation__panel" role="tabpanel">
            <div class="model-validation__desc">
              <p class="model-validation__desc-text">{{ t(tabDesc[activeTab]) }}</p>
              <p v-if="activeTabCapped && activeTabItem" class="model-validation__desc-count">
                {{ groupCountLabel(activeTabItem.shown, activeTabItem.total) }}
              </p>
            </div>

            <template v-if="activeTab === 'nodes'">
              <div v-if="report.duplicateNodes.length > 0" class="model-validation__groups">
                <ValidationDuplicateGroup
                  v-for="group in report.duplicateNodes"
                  :key="`${group.nodeTypeId}:${group.name}`"
                  kind="node"
                  :model-id="modelId"
                  :title="`${group.nodeTypeName} · ${group.name}`"
                  :count="group.count"
                  :node-members="group.nodes"
                  @merge="onMerge"
                />
              </div>
              <p v-else class="model-validation__tabempty">{{ t('models.validationTabEmpty') }}</p>
            </template>

            <template v-else-if="activeTab === 'links'">
              <div v-if="report.duplicateLinks.length > 0" class="model-validation__groups">
                <ValidationDuplicateGroup
                  v-for="group in report.duplicateLinks"
                  :key="`${group.sourceId}:${group.targetId}:${group.linkTypeId}`"
                  kind="link"
                  :model-id="modelId"
                  :title="`${group.sourceName} → ${group.targetName} · ${group.linkTypeName}`"
                  :count="group.count"
                  :link-members="group.links"
                  @merge="onMerge"
                />
              </div>
              <p v-else class="model-validation__tabempty">{{ t('models.validationTabEmpty') }}</p>
            </template>

            <template v-else-if="activeTab === 'diagrams'">
              <div v-if="diagramIssues.length > 0" class="model-validation__groups">
                <ValidationDiagramIssues
                  v-for="group in diagramIssues"
                  :key="group.diagramId"
                  :group="group"
                  :model-id="modelId"
                />
              </div>
              <p v-else class="model-validation__tabempty">{{ t('models.validationTabEmpty') }}</p>
            </template>

            <template v-else>
              <ValidationUnusedElements
                v-if="unusedNodes.length > 0 || unusedLinks.length > 0"
                :model-id="modelId"
                :nodes="unusedNodes"
                :links="unusedLinks"
                @deleted="onUnusedDeleted"
              />
              <p v-else class="model-validation__tabempty">{{ t('models.validationTabEmpty') }}</p>
            </template>
          </div>
        </div>

        <ValidationAutoMergeDialog
          v-if="showAutoMergeDialog && report"
          :node-groups="report.duplicateNodes.length"
          :link-groups="report.duplicateLinks.length"
          :initial-options="autoMergeOptions"
          :phase="autoMergePhase"
          :live="autoMergeLive"
          :result="autoMergeResult"
          @close="onAutoMergeDialogClosed"
          @confirm="onAutoMergeConfirmed"
          @abort="autoMergeStopRequested = true"
        />

        <ValidationMergeWizard
          v-if="pendingMerge"
          :model-id="modelId"
          :kind="pendingMerge.kind"
          :keep-id="pendingMerge.keepId"
          :drop-id="pendingMerge.dropId"
          @close="onWizardClose"
          @merged="onMerged"
          @refresh="onWizardRefresh"
        />
      </div>
    </template>
    <template #footer>
      <AppFooter />
    </template>
  </MainLayout>
</template>

<style scoped>
.model-validation {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--base-bg);
}

.model-validation__topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.model-validation__back {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
}

.model-validation__titles {
  min-width: 0;
}

.model-validation__title {
  margin: 0;
  font-size: 16px;
}

.model-validation__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.model-validation__success,
.model-validation__error,
.model-validation__loading,
.model-validation__empty {
  margin: 0;
  padding: 14px 16px;
  color: var(--text-muted);
}

.model-validation__success {
  color: var(--success);
}

.model-validation__error {
  color: var(--danger);
}

.model-validation__content {
  padding: 16px;
  overflow: auto;
}

.model-validation__automerge {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.model-validation__automerge-btn {
  padding: 6px 14px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: transparent;
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
}

.model-validation__automerge-btn:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
}

.model-validation__automerge-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.model-validation__automerge-progress {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.model-validation__automerge-skips {
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--text-muted);
}

.model-validation__automerge-skip-title {
  color: var(--text-base, inherit);
  font-weight: 500;
}

.model-validation__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.model-validation__tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: -1px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.model-validation__tab:hover:not(._active) {
  color: var(--text-base, inherit);
}

.model-validation__tab._active {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text-base, inherit);
  font-weight: 500;
}

.model-validation__tab-count {
  min-width: 20px;
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  text-align: center;
}

.model-validation__tab._active .model-validation__tab-count {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.model-validation__panel {
  padding-top: 2px;
}

.model-validation__desc {
  margin-bottom: 14px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: 8px;
  background: var(--surface);
}

.model-validation__desc-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.model-validation__desc-count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-subtle);
}

.model-validation__tabempty {
  margin: 0;
  padding: 10px 2px;
  font-size: 13px;
  color: var(--text-muted);
}

.model-validation__groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>

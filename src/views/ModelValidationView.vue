<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/composables/useApi'
import { fetchValidationReport } from '@/features/models-validation/api'
import type { ValidationReport } from '@/features/models-validation/types'
import type { ModelData } from '@/types/entities'
import ValidationDuplicateGroup from '@/features/models-validation/components/ValidationDuplicateGroup.vue'
import ValidationMergeWizard from '@/features/models-validation/components/ValidationMergeWizard.vue'
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

const isEmpty = computed(() => {
  const current = report.value
  if (!current) return false
  return current.duplicateNodes.length === 0 && current.duplicateLinks.length === 0
})

function groupCountLabel(shown: number, total?: number): string {
  if (total != null && total > shown) {
    return t('models.validationReportShownOf', { shown, total })
  }
  return String(shown)
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
    if (value) void load()
  },
  { immediate: true }
)

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
          <section class="model-validation__section">
            <h2 class="model-validation__heading">
              {{ t('models.validationReportNodes') }}
              {{ groupCountLabel(report.duplicateNodes.length, report.duplicateNodesTotal) }}
            </h2>
            <div class="model-validation__groups">
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
          </section>
          <section class="model-validation__section">
            <h2 class="model-validation__heading">
              {{ t('models.validationReportLinks') }}
              {{ groupCountLabel(report.duplicateLinks.length, report.duplicateLinksTotal) }}
            </h2>
            <div class="model-validation__groups">
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
          </section>
        </div>

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

.model-validation__section + .model-validation__section {
  margin-top: 20px;
}

.model-validation__heading {
  margin: 0 0 8px;
  font-size: 14px;
}

.model-validation__groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>

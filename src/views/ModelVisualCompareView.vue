<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/composables/useApi'
import { listParams } from '@/api/queryHelpers'
import type { ModelData, PaginatedResponse } from '@/types/entities'
import type {
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
} from '@/types/api'
import { type CompareSharedData, loadCompareSharedData } from '@/api/loadCompareSharedData'
import SearchableSelect from '@/components/forms/SearchableSelect.vue'
import DualDiagramCompareView from '@/features/models/components/DualDiagramCompareView.vue'
import { compareVersions } from '@/utils/version'
import { paginatedContent } from '@/utils/paginatedResponse'
import {
  toEditorDiagram,
} from '@/features/models/composables/useComparisonDiff'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const modelId = computed(() => route.params.id as string)

const relatedVersions = ref<ModelData[]>([])
const leftVersionId = ref<string>('')
const rightVersionId = ref<string>('')
const diagramName = ref<string>('')

const leftData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const rightData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const sharedData = ref<CompareSharedData | null>(null)

const loading = ref(false)
const error = ref<string | null>(null)

async function loadRelatedVersions(): Promise<void> {
  const id = modelId.value
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const res = await apiGet<PaginatedResponse<ModelData>>(`/models/${id}/related-versions`)
    if (res.success) {
      const versions = paginatedContent(res.data)
      relatedVersions.value = versions
      if (versions.length >= 2 && !leftVersionId.value && !rightVersionId.value) {
        leftVersionId.value = versions[versions.length - 1]!.id
        rightVersionId.value = versions[0]!.id
      }
    } else {
      relatedVersions.value = []
      error.value = res.error.message
    }
  } catch (e) {
    relatedVersions.value = []
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

async function loadVersionData(versionId: string): Promise<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null> {
  const listQuery = listParams()
  const [nodesRes, linksRes, diagramsRes, nodeTypesRes, linkTypesRes] = await Promise.all([
    apiGet<PaginatedResponse<NodeResponse>>(
      `/nodes?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`,
    ),
    apiGet<PaginatedResponse<LinkResponse>>(
      `/links?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`,
    ),
    apiGet<PaginatedResponse<DiagramResponse>>(
      `/diagrams?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`,
    ),
    apiGet<PaginatedResponse<NodeTypeResponse>>(
      `/node-types?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`,
    ),
    apiGet<PaginatedResponse<LinkTypeResponse>>(
      `/link-types?modelId=${encodeURIComponent(versionId)}&${listQuery.toString()}`,
    ),
  ])
  if (!nodesRes.success || !linksRes.success || !diagramsRes.success) return null
  return {
    nodes: nodesRes.data.content ?? [],
    links: linksRes.data.content ?? [],
    diagrams: diagramsRes.data.content ?? [],
    nodeTypes: nodeTypesRes.success ? (nodeTypesRes.data.content ?? []) : [],
    linkTypes: linkTypesRes.success ? (linkTypesRes.data.content ?? []) : [],
  }
}

async function loadSharedData(): Promise<void> {
  sharedData.value = await loadCompareSharedData()
}

async function loadBothVersions(): Promise<void> {
  const leftId = leftVersionId.value
  const rightId = rightVersionId.value
  if (!leftId || !rightId || leftId === rightId) {
    leftData.value = null
    rightData.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    const [left, right] = await Promise.all([loadVersionData(leftId), loadVersionData(rightId)])
    leftData.value = left
    rightData.value = right
    if (left?.diagrams.length && !diagramName.value) {
      diagramName.value = left.diagrams[0]!.name
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

/** Выбирает диаграмму с именем name с максимальной версией (как в редакторе модели). */
function getLatestDiagramByName(
  diagrams: DiagramResponse[],
  name: string,
): DiagramResponse | undefined {
  const sameName = diagrams.filter(d => d.name.trim() === name.trim())
  if (sameName.length === 0) return undefined
  return [...sameName].sort((a, b) => compareVersions(b.version, a.version))[0]
}

const diagramNames = computed(() => {
  const names = new Set<string>()
  leftData.value?.diagrams.forEach(d => names.add(d.name))
  rightData.value?.diagrams.forEach(d => names.add(d.name))
  return Array.from(names).sort()
})

const diagramOptions = computed(() => diagramNames.value.map(name => ({ id: name, label: name })))

const leftDiagram = computed(() => {
  const list = leftData.value?.diagrams ?? []
  const d = getLatestDiagramByName(list, diagramName.value)
  return d ? toEditorDiagram(d) : null
})

const rightDiagram = computed(() => {
  const list = rightData.value?.diagrams ?? []
  const d = getLatestDiagramByName(list, diagramName.value)
  return d ? toEditorDiagram(d) : null
})

const swapDisabled = computed(
  () => !leftVersionId.value || !rightVersionId.value || loading.value,
)

function handleBack(): void {
  router.push({ name: 'model-editor', params: { id: modelId.value } })
}

watch(
  [modelId, leftVersionId, rightVersionId],
  () => {
    if (modelId.value) void loadRelatedVersions()
    if (leftVersionId.value && rightVersionId.value) void loadBothVersions()
  },
  { immediate: true },
)

watch(
  () => modelId.value,
  () => void loadSharedData(),
  { immediate: true },
)
</script>

<template>
  <DualDiagramCompareView
    :error="error"
    props-panel-storage-key="warchi:model-visual-compare:props-panel-height"
    :swap-disabled="swapDisabled"
    :left-data="leftData"
    :right-data="rightData"
    :left-diagram="leftDiagram"
    :right-diagram="rightDiagram"
    :shared-data="sharedData"
    @back="handleBack"
  >
    <template #before-swap>
      <div class="ddc-pick">
        <span class="ddc-pick__label">{{ t('models.compareVersionLeft') }}</span>
        <select v-model="leftVersionId" class="ddc-pick__select" :disabled="loading">
          <option value="">{{ t('models.compareSelectVersion') }}</option>
          <option
            v-for="v in relatedVersions"
            :key="v.id"
            :value="v.id"
            :disabled="v.id === rightVersionId"
          >
            {{ v.name }} {{ v.version }}
          </option>
        </select>
      </div>
    </template>

    <template #after-swap>
      <div class="ddc-pick">
        <span class="ddc-pick__label">{{ t('models.compareVersionRight') }}</span>
        <select v-model="rightVersionId" class="ddc-pick__select" :disabled="loading">
          <option value="">{{ t('models.compareSelectVersion') }}</option>
          <option
            v-for="v in relatedVersions"
            :key="v.id"
            :value="v.id"
            :disabled="v.id === leftVersionId"
          >
            {{ v.name }} {{ v.version }}
          </option>
        </select>
      </div>
    </template>

    <template #topbar-extra>
      <div class="ddc-pick">
        <span class="ddc-pick__label">{{ t('models.compareDiagramName') }}</span>
        <SearchableSelect
          v-model="diagramName"
          class="ddc-pick__searchable"
          :options="diagramOptions"
          :disabled="loading"
          :placeholder="t('models.compareDiagramName')"
          :search-placeholder="t('common.search')"
          :empty-text="t('common.nothingFound')"
        />
      </div>
    </template>
  </DualDiagramCompareView>
</template>

<style scoped>
.ddc-pick__searchable {
  min-width: 220px;
}
.ddc-pick__searchable :deep(.searchable-select__control) {
  height: 32px;
  min-height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
  font-size: 13px;
  font-weight: 500;
}
.ddc-pick__searchable :deep(.searchable-select__control:hover) {
  border-color: var(--border-strong);
}
.ddc-pick__searchable :deep(.searchable-select__control:focus-within) {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
</style>

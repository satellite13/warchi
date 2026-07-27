<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/composables/useApi'
import { listParams } from '@/api/queryHelpers'
import type { PaginatedResponse } from '@/types/entities'
import type {
  DiagramResponse,
  LinkResponse,
  LinkTypeResponse,
  NodeResponse,
  NodeTypeResponse,
} from '@/types/api'
import { type CompareSharedData, loadCompareSharedData } from '@/api/loadCompareSharedData'
import DualDiagramCompareView from '@/features/models/components/DualDiagramCompareView.vue'
import { fetchAllByModelId } from '@/features/models/composables/modelEditorLoadModel'
import { compareVersions } from '@/utils/version'
import {
  toEditorDiagram,
} from '@/features/models/composables/useComparisonDiff'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

/** id версии модели (как в редакторе). */
const versionId = computed(() => route.params.id as string)
const diagramNameFromQuery = computed(() => (route.query.diagram as string) ?? '')

const versionData = ref<{
  nodes: NodeResponse[]
  links: LinkResponse[]
  diagrams: DiagramResponse[]
  nodeTypes: NodeTypeResponse[]
  linkTypes: LinkTypeResponse[]
} | null>(null)
const diagramName = ref<string>('')
const leftDiagramId = ref<string>('')
const rightDiagramId = ref<string>('')

const sharedData = ref<CompareSharedData | null>(null)

const loading = ref(false)
const error = ref<string | null>(null)

async function loadVersionData(): Promise<void> {
  const id = versionId.value
  if (!id) return
  loading.value = true
  error.value = null
  try {
    const typesQuery = listParams()
    const [nodes, links, diagrams, nodeTypesRes, linkTypesRes] = await Promise.all([
      fetchAllByModelId<NodeResponse>('/nodes', id),
      fetchAllByModelId<LinkResponse>('/links', id),
      fetchAllByModelId<DiagramResponse>('/diagrams', id),
      apiGet<PaginatedResponse<NodeTypeResponse>>(
        `/node-types?modelId=${encodeURIComponent(id)}&${typesQuery.toString()}`,
      ),
      apiGet<PaginatedResponse<LinkTypeResponse>>(
        `/link-types?modelId=${encodeURIComponent(id)}&${typesQuery.toString()}`,
      ),
    ])
    versionData.value = {
      nodes,
      links,
      diagrams,
      nodeTypes: nodeTypesRes.success ? (nodeTypesRes.data.content ?? []) : [],
      linkTypes: linkTypesRes.success ? (linkTypesRes.data.content ?? []) : [],
    }
    if (versionData.value.diagrams.length > 0 && !diagramName.value) {
      diagramName.value = diagramNameFromQuery.value.trim() || versionData.value.diagrams[0]!.name
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки'
  } finally {
    loading.value = false
  }
}

async function loadSharedData(): Promise<void> {
  sharedData.value = await loadCompareSharedData()
}

/** Версии диаграммы с выбранным именем, по убыванию версии. */
const diagramsWithName = computed((): DiagramResponse[] => {
  const list = versionData.value?.diagrams ?? []
  const name = diagramName.value.trim()
  if (!name) return []
  return list
    .filter(d => d.name.trim() === name)
    .sort((a, b) => compareVersions(b.version, a.version))
})

const diagramNames = computed(() => {
  const names = new Set<string>()
  versionData.value?.diagrams.forEach(d => names.add(d.name))
  return Array.from(names).sort()
})

const leftDiagramRaw = computed((): DiagramResponse | null => {
  const list = versionData.value?.diagrams ?? []
  if (!leftDiagramId.value) return null
  return list.find(d => d.id === leftDiagramId.value) ?? null
})

const rightDiagramRaw = computed((): DiagramResponse | null => {
  const list = versionData.value?.diagrams ?? []
  if (!rightDiagramId.value) return null
  return list.find(d => d.id === rightDiagramId.value) ?? null
})

/** Синтетические данные для diff: слева — только левая диаграмма, справа — только правая. */
const leftData = computed(() => {
  const v = versionData.value
  const left = leftDiagramRaw.value
  if (!v || !left) return null
  return { ...v, diagrams: [left] }
})

const rightData = computed(() => {
  const v = versionData.value
  const right = rightDiagramRaw.value
  if (!v || !right) return null
  return { ...v, diagrams: [right] }
})

const leftDiagram = computed(() => {
  const d = leftDiagramRaw.value
  return d ? toEditorDiagram(d) : null
})

const rightDiagram = computed(() => {
  const d = rightDiagramRaw.value
  return d ? toEditorDiagram(d) : null
})

const swapDisabled = computed(
  () => !leftDiagramId.value || !rightDiagramId.value || loading.value,
)

function handleBack(): void {
  router.push({ name: 'model-editor', params: { id: versionId.value } })
}

watch(
  [versionId, diagramName],
  () => {
    if (versionId.value) void loadVersionData()
  },
  { immediate: true },
)

watch(
  () => versionId.value,
  () => void loadSharedData(),
  { immediate: true },
)

watch(
  [diagramsWithName, diagramName],
  () => {
    const list = diagramsWithName.value
    if (list.length === 0) {
      leftDiagramId.value = ''
      rightDiagramId.value = ''
      return
    }
    const firstId = list[0]!.id
    const secondId = list[1]?.id ?? firstId
    if (!leftDiagramId.value || !list.some(d => d.id === leftDiagramId.value)) {
      leftDiagramId.value = firstId
    }
    if (!rightDiagramId.value || !list.some(d => d.id === rightDiagramId.value)) {
      rightDiagramId.value = secondId
    }
  },
  { immediate: true },
)

watch(
  () => diagramNameFromQuery.value,
  q => {
    if (q && diagramNames.value.includes(q)) diagramName.value = q
  },
  { immediate: true },
)
</script>

<template>
  <DualDiagramCompareView
    :error="error"
    props-panel-storage-key="warchi:diagram-versions-compare:props-panel-height"
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
        <span class="ddc-pick__label">{{ t('models.compareDiagramName') }}</span>
        <select v-model="diagramName" class="ddc-pick__select">
          <option v-for="name in diagramNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </div>

      <div class="ddc-pick">
        <span class="ddc-pick__label">{{ t('models.compareVersionLeft') }}</span>
        <select
          v-model="leftDiagramId"
          class="ddc-pick__select"
          :disabled="loading || !diagramsWithName.length"
        >
          <option v-for="d in diagramsWithName" :key="d.id" :value="d.id">{{ d.version }}</option>
        </select>
      </div>
    </template>

    <template #after-swap>
      <div class="ddc-pick">
        <span class="ddc-pick__label">{{ t('models.compareVersionRight') }}</span>
        <select
          v-model="rightDiagramId"
          class="ddc-pick__select"
          :disabled="loading || !diagramsWithName.length"
        >
          <option v-for="d in diagramsWithName" :key="d.id" :value="d.id">{{ d.version }}</option>
        </select>
      </div>
    </template>
  </DualDiagramCompareView>
</template>

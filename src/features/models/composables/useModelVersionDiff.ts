import { computed, ref } from "vue"
import { apiGet } from "@/composables/useApi"
import { listParams } from '@/api/queryHelpers'
import type { ModelData } from "@/types/entities"
import type { PaginatedResponse } from "@/types/entities"
import type {
  DiagramResponse,
  LinkResponse,
  NodeResponse,
} from "@/types/api"
import {
  computeModelDiff,
  type ModelVersionDiff,
} from "@/utils/modelDiff"

export type ModelVersionDiffState = {
  relatedVersions: ModelData[]
  relatedVersionsLoading: boolean
  relatedVersionsError: string | null
  compareTargetId: string | null
  compareTargetData: {
    nodes: NodeResponse[]
    links: LinkResponse[]
    diagrams: DiagramResponse[]
  } | null
  compareTargetLoading: boolean
  compareTargetError: string | null
}

/**
 * Сравнение текущей версии модели с другой: база всегда снимок с API (`loadBaseFromApi`),
 * а не несохранённый state редактора — иначе attrs диаграммы на строке объекта расходятся с `parsedAttrs`
 * (live sync / холст), и diff по диаграммам считался бы не от фактического состояния на сервере.
 */
export function useModelVersionDiff() {
  const relatedVersions = ref<ModelData[]>([])
  const relatedVersionsLoading = ref(false)
  const relatedVersionsError = ref<string | null>(null)

  const baseData = ref<{
    nodes: NodeResponse[]
    links: LinkResponse[]
    diagrams: DiagramResponse[]
  } | null>(null)

  const compareTargetId = ref<string | null>(null)
  const compareTargetData = ref<{
    nodes: NodeResponse[]
    links: LinkResponse[]
    diagrams: DiagramResponse[]
  } | null>(null)
  const compareTargetLoading = ref(false)
  const compareTargetError = ref<string | null>(null)

  async function loadBaseFromApi(modelId: string): Promise<void> {
    baseData.value = null
    const listQuery = listParams()
    const [nodesRes, linksRes, diagramsRes] = await Promise.all([
      apiGet<PaginatedResponse<NodeResponse>>(
        `/nodes?modelId=${encodeURIComponent(modelId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<LinkResponse>>(
        `/links?modelId=${encodeURIComponent(modelId)}&${listQuery.toString()}`
      ),
      apiGet<PaginatedResponse<DiagramResponse>>(
        `/diagrams?modelId=${encodeURIComponent(modelId)}&${listQuery.toString()}`
      ),
    ])
    const nodes = nodesRes.success ? nodesRes.data.content ?? [] : []
    const links = linksRes.success ? linksRes.data.content ?? [] : []
    const diagrams = diagramsRes.success ? diagramsRes.data.content ?? [] : []
    baseData.value = { nodes, links, diagrams }
  }

  async function fetchRelatedVersions(modelId: string): Promise<void> {
    relatedVersionsLoading.value = true
    relatedVersionsError.value = null
    try {
      const result = await apiGet<ModelData[]>(
        `/models/${modelId}/related-versions`
      )
      if (result.success) {
        relatedVersions.value = result.data
      } else {
        relatedVersions.value = []
        relatedVersionsError.value = result.error.message
      }
    } catch (e) {
      relatedVersions.value = []
      relatedVersionsError.value =
        e instanceof Error ? e.message : "Не удалось загрузить версии"
    } finally {
      relatedVersionsLoading.value = false
    }
  }

  async function loadCompareTarget(otherModelId: string): Promise<boolean> {
    compareTargetId.value = otherModelId
    compareTargetLoading.value = true
    compareTargetError.value = null
    compareTargetData.value = null
    try {
      const listQuery = listParams()
      const [nodesRes, linksRes, diagramsRes] = await Promise.all([
        apiGet<PaginatedResponse<NodeResponse>>(
          `/nodes?modelId=${encodeURIComponent(otherModelId)}&${listQuery.toString()}`
        ),
        apiGet<PaginatedResponse<LinkResponse>>(
          `/links?modelId=${encodeURIComponent(otherModelId)}&${listQuery.toString()}`
        ),
        apiGet<PaginatedResponse<DiagramResponse>>(
          `/diagrams?modelId=${encodeURIComponent(otherModelId)}&${listQuery.toString()}`
        ),
      ])
      const nodes = nodesRes.success ? nodesRes.data.content ?? [] : []
      const links = linksRes.success ? linksRes.data.content ?? [] : []
      const diagrams = diagramsRes.success ? diagramsRes.data.content ?? [] : []
      compareTargetData.value = { nodes, links, diagrams }
      return true
    } catch (e) {
      compareTargetError.value =
        e instanceof Error ? e.message : "Не удалось загрузить данные версии"
      return false
    } finally {
      compareTargetLoading.value = false
    }
  }

  function clearCompare(): void {
    baseData.value = null
    compareTargetId.value = null
    compareTargetData.value = null
    compareTargetError.value = null
  }

  const diff = computed<ModelVersionDiff | null>(() => {
    const target = compareTargetData.value
    const base = baseData.value
    if (!target || !base) return null
    return computeModelDiff(base, target)
  })

  return {
    relatedVersions,
    relatedVersionsLoading,
    relatedVersionsError,
    compareTargetId,
    compareTargetData,
    compareTargetLoading,
    compareTargetError,
    diff,
    fetchRelatedVersions,
    loadBaseFromApi,
    loadCompareTarget,
    clearCompare,
  }
}

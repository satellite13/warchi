import { computed, ref } from "vue"
import { apiGet } from "@/composables/useApi"
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
import { paginatedContent } from "@/utils/paginatedResponse"
import { fetchAllByModelId } from "./modelEditorLoadModel"

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
    try {
      const [nodes, links, diagrams] = await Promise.all([
        fetchAllByModelId<NodeResponse>('/nodes', modelId),
        fetchAllByModelId<LinkResponse>('/links', modelId),
        fetchAllByModelId<DiagramResponse>('/diagrams', modelId),
      ])
      baseData.value = { nodes, links, diagrams }
    } catch {
      baseData.value = { nodes: [], links: [], diagrams: [] }
    }
  }

  async function fetchRelatedVersions(modelId: string): Promise<void> {
    relatedVersionsLoading.value = true
    relatedVersionsError.value = null
    try {
      const result = await apiGet<PaginatedResponse<ModelData>>(
        `/models/${modelId}/related-versions`
      )
      if (result.success) {
        relatedVersions.value = paginatedContent(result.data)
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
      const [nodes, links, diagrams] = await Promise.all([
        fetchAllByModelId<NodeResponse>('/nodes', otherModelId),
        fetchAllByModelId<LinkResponse>('/links', otherModelId),
        fetchAllByModelId<DiagramResponse>('/diagrams', otherModelId),
      ])
      compareTargetData.value = { nodes, links, diagrams }
      return true
    } catch (e) {
      compareTargetData.value = null
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

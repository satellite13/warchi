import { ref, computed, onMounted } from "vue"
import { apiGet } from "./useApi"
import { pagedListParams } from "@/api/queryHelpers"
import { paginatedContent } from "@/utils/paginatedResponse"
import type { PaginatedResponse } from "../types/entities"
import type { ModelData, NotationData } from "../types/entities"
import type { NodeTypeResponse, LinkTypeResponse, DiagramResponse } from "../types/api"

export interface DashboardStats {
  models: number
  notations: number
  nodeTypes: number
  linkTypes: number
}

export interface DashboardRecentDiagram {
  id: string
  name: string
  version: string
  modelId: string
  modelName: string
  updatedAt: string | null
}

interface DashboardStatsApiResponse {
  models: number
  notations: number
  nodeTypes: number
  linkTypes: number
}

interface DashboardRecentApiResponse {
  models: Array<{
    id: string
    name: string
    version: string
    ownerId: string
    updatedAt: string | null
  }>
  notations: Array<{
    id: string
    name: string
    version: string
    ownerId: string
    updatedAt: string | null
  }>
  diagrams: DashboardRecentDiagram[]
}

function isValidDashboardStats(data: unknown): data is DashboardStatsApiResponse {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.models === 'number' &&
    typeof d.notations === 'number' &&
    typeof d.nodeTypes === 'number' &&
    typeof d.linkTypes === 'number'
  )
}

function isValidDashboardRecent(data: unknown): data is DashboardRecentApiResponse {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return Array.isArray(d.models) && Array.isArray(d.notations) && Array.isArray(d.diagrams)
}

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const da = getDate(a) ? new Date(getDate(a)!).getTime() : 0
    const db = getDate(b) ? new Date(getDate(b)!).getTime() : 0
    return db - da
  })
}

export function useDashboard() {
  const isLoading = ref(true)
  const models = ref<ModelData[]>([])
  const notations = ref<NotationData[]>([])
  const nodeTypes = ref<NodeTypeResponse[]>([])
  const linkTypes = ref<LinkTypeResponse[]>([])
  const diagrams = ref<DashboardRecentDiagram[]>([])
  const statsOverride = ref<DashboardStats | null>(null)

  const stats = computed<DashboardStats>(() => {
    if (statsOverride.value) return statsOverride.value
    return {
      models: new Set(models.value.map(m => m.name)).size,
      notations: new Set(notations.value.map(n => n.name)).size,
      nodeTypes: nodeTypes.value.length,
      linkTypes: linkTypes.value.length,
    }
  })

  const totalVersions = computed(() => ({
    models: models.value.length,
    notations: notations.value.length
  }))

  const recentModels = computed(() =>
    sortByDateDesc(models.value, (m) => m.updatedAt).slice(0, 5)
  )

  const recentNotations = computed(() =>
    sortByDateDesc(notations.value, (n) => n.updatedAt).slice(0, 5)
  )

  const recentDiagrams = computed(() =>
    sortByDateDesc(diagrams.value, (d) => d.updatedAt).slice(0, 5)
  )

  const loadAll = async () => {
    isLoading.value = true

    const [dashStatsRes, dashRecentRes] = await Promise.all([
      apiGet<DashboardStatsApiResponse>('/dashboard/stats'),
      apiGet<DashboardRecentApiResponse>('/dashboard/recent?limit=5'),
    ])

    if (
      dashStatsRes.success &&
      isValidDashboardStats(dashStatsRes.data) &&
      dashRecentRes.success &&
      isValidDashboardRecent(dashRecentRes.data)
    ) {
      statsOverride.value = dashStatsRes.data
      models.value = dashRecentRes.data.models as ModelData[]
      notations.value = dashRecentRes.data.notations as NotationData[]
      diagrams.value = dashRecentRes.data.diagrams
      nodeTypes.value = []
      linkTypes.value = []
      isLoading.value = false
      return
    }

    statsOverride.value = null
    const modelsQuery = pagedListParams(0)
    const notationsQuery = pagedListParams(0)
    const nodeTypesQuery = pagedListParams(0)
    const linkTypesQuery = pagedListParams(0)
    const diagramsQuery = pagedListParams(0, 5)

    const [modelsRes, notationsRes, nodeTypesRes, linkTypesRes, diagramsRes] = await Promise.all([
      apiGet<PaginatedResponse<ModelData>>(`/models?${modelsQuery.toString()}`),
      apiGet<PaginatedResponse<NotationData>>(`/notations?${notationsQuery.toString()}`),
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${nodeTypesQuery.toString()}`),
      apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${linkTypesQuery.toString()}`),
      apiGet<PaginatedResponse<DiagramResponse>>(`/diagrams?${diagramsQuery.toString()}`),
    ])

    if (modelsRes.success) models.value = paginatedContent(modelsRes.data)
    if (notationsRes.success) notations.value = paginatedContent(notationsRes.data)
    if (nodeTypesRes.success) nodeTypes.value = paginatedContent(nodeTypesRes.data)
    if (linkTypesRes.success) linkTypes.value = paginatedContent(linkTypesRes.data)

    const modelNameById = new Map(models.value.map((m) => [m.id, m.name]))
    if (diagramsRes.success) {
      diagrams.value = paginatedContent(diagramsRes.data).map((d) => ({
        id: d.id,
        name: d.name,
        version: d.version,
        modelId: d.modelId,
        modelName: modelNameById.get(d.modelId) ?? '',
        updatedAt: d.updatedAt ?? null,
      }))
    }

    isLoading.value = false
  }

  onMounted(loadAll)

  return {
    isLoading,
    stats,
    totalVersions,
    recentModels,
    recentNotations,
    recentDiagrams,
  }
}

import { ref, computed, onMounted } from "vue"
import { apiGet } from "./useApi"
import type { PaginatedResponse } from "../types/entities"
import type { ModelData, NotationData } from "../types/entities"
import type { NodeTypeResponse, LinkTypeResponse, AuditLogResponse } from "../types/api"

export interface DashboardStats {
  models: number
  notations: number
  nodeTypes: number
  linkTypes: number
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
  activity: Array<{
    id: string
    tableName: string
    operation: string
    rowId: string
    changedById: string | null
    changedAt: string | null
  }>
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
  return Array.isArray(d.models) && Array.isArray(d.notations) && Array.isArray(d.activity)
}

export function useDashboard() {
  const isLoading = ref(true)
  const models = ref<ModelData[]>([])
  const notations = ref<NotationData[]>([])
  const nodeTypes = ref<NodeTypeResponse[]>([])
  const linkTypes = ref<LinkTypeResponse[]>([])
  const auditLogs = ref<AuditLogResponse[]>([])
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
    [...models.value]
      .sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return db - da
      })
      .slice(0, 5)
  )

  const recentNotations = computed(() =>
    [...notations.value]
      .sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return db - da
      })
      .slice(0, 5)
  )

  const recentActivity = computed(() =>
    [...auditLogs.value]
      .sort((a, b) => {
        const da = a.changedAt ? new Date(a.changedAt).getTime() : 0
        const db = b.changedAt ? new Date(b.changedAt).getTime() : 0
        return db - da
      })
      .slice(0, 12)
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
      auditLogs.value = dashRecentRes.data.activity as AuditLogResponse[]
      nodeTypes.value = []
      linkTypes.value = []
      isLoading.value = false
      return
    }

    statsOverride.value = null
    const modelsQuery = new URLSearchParams({ page: "0", size: "50" })
    const notationsQuery = new URLSearchParams({ page: "0", size: "50" })
    const nodeTypesQuery = new URLSearchParams({ page: "0", size: "50" })
    const linkTypesQuery = new URLSearchParams({ page: "0", size: "50" })

    const [modelsRes, notationsRes, nodeTypesRes, linkTypesRes, auditRes] = await Promise.all([
      apiGet<PaginatedResponse<ModelData>>(`/models?${modelsQuery.toString()}`),
      apiGet<PaginatedResponse<NotationData>>(`/notations?${notationsQuery.toString()}`),
      apiGet<PaginatedResponse<NodeTypeResponse>>(`/node-types?${nodeTypesQuery.toString()}`),
      apiGet<PaginatedResponse<LinkTypeResponse>>(`/link-types?${linkTypesQuery.toString()}`),
      apiGet<PaginatedResponse<AuditLogResponse>>("/audit-log?page=0&size=20")
    ])

    if (modelsRes.success) models.value = modelsRes.data.content ?? []
    if (notationsRes.success) notations.value = notationsRes.data.content ?? []
    if (nodeTypesRes.success) nodeTypes.value = nodeTypesRes.data.content ?? []
    if (linkTypesRes.success) linkTypes.value = linkTypesRes.data.content ?? []
    if (auditRes.success) auditLogs.value = auditRes.data.content ?? []

    isLoading.value = false
  }

  onMounted(loadAll)

  return {
    isLoading,
    stats,
    totalVersions,
    recentModels,
    recentNotations,
    recentActivity
  }
}

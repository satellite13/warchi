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

export function useDashboard() {
  const isLoading = ref(true)
  const models = ref<ModelData[]>([])
  const notations = ref<NotationData[]>([])
  const nodeTypes = ref<NodeTypeResponse[]>([])
  const linkTypes = ref<LinkTypeResponse[]>([])
  const auditLogs = ref<AuditLogResponse[]>([])

  const stats = computed<DashboardStats>(() => ({
    models: new Set(models.value.map(m => m.name)).size,
    notations: new Set(notations.value.map(n => n.name)).size,
    nodeTypes: nodeTypes.value.length,
    linkTypes: linkTypes.value.length
  }))

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
    const [modelsRes, notationsRes, nodeTypesRes, linkTypesRes, auditRes] = await Promise.all([
      apiGet<PaginatedResponse<ModelData>>("/models?page=0&size=50"),
      apiGet<PaginatedResponse<NotationData>>("/notations?page=0&size=50"),
      apiGet<PaginatedResponse<NodeTypeResponse>>("/node-types?page=0&size=50"),
      apiGet<PaginatedResponse<LinkTypeResponse>>("/link-types?page=0&size=50"),
      apiGet<PaginatedResponse<AuditLogResponse>>("/audit-logs?page=0&size=20")
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

import { apiGet } from '@/composables/useApi'
import type { PaginatedResponse, NotationData } from '@/types/entities'
import type { ComponentResponse, RelationResponse, RelationRuleResponse } from '@/types/api'

export type CompareSharedData = {
  notations: NotationData[]
  components: ComponentResponse[]
  relations: RelationResponse[]
  relationRules: RelationRuleResponse[]
}

export async function loadCompareSharedData(): Promise<CompareSharedData> {
  const listQuery = new URLSearchParams({ size: '1000' })
  const [notationsRes, componentsRes, relationsRes, relationRulesRes] = await Promise.all([
    apiGet<PaginatedResponse<NotationData>>(`/notations?${listQuery.toString()}`),
    apiGet<PaginatedResponse<ComponentResponse>>(`/components?${listQuery.toString()}`),
    apiGet<PaginatedResponse<RelationResponse>>(`/relations?${listQuery.toString()}`),
    apiGet<PaginatedResponse<RelationRuleResponse>>(`/relation-rules?${listQuery.toString()}`),
  ])
  return {
    notations: notationsRes.success ? notationsRes.data.content ?? [] : [],
    components: componentsRes.success ? componentsRes.data.content ?? [] : [],
    relations: relationsRes.success ? relationsRes.data.content ?? [] : [],
    relationRules: relationRulesRes.success ? relationRulesRes.data.content ?? [] : [],
  }
}

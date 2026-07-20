import { apiGet, apiPost } from '@/composables/useApi'
import { listParams, PAGE_SIZE_NOTATION } from '@/api/queryHelpers'
import { formatEntitySaveError } from '@/utils/formatEntityError'
import type { PaginatedResponse } from '@/types/entities'

type NotationBoundEntityLike = {
  id: string
  name: string
  version: string
  _isNew?: boolean
}

type NotationBoundEntityResponse = {
  id: string
  name: string
  version: string
}

export type ResolveNewNotationBoundEntitiesOptions<T extends NotationBoundEntityLike> = {
  entities: T[]
  notationId: string
  ownerId: string
  apiEndpoint: '/components' | '/relations'
  entityTypeName: string
  buildCreateRequest: (entity: T) => Record<string, unknown>
  onRemapId: (oldId: string, newId: string) => void
  onProgress: (msg: string) => void
}

function entityKey(name: string, version: string): string {
  return `${name}\u0000${version}`
}

function indexByNameVersion(
  content: NotationBoundEntityResponse[] | undefined
): Map<string, NotationBoundEntityResponse> {
  const map = new Map<string, NotationBoundEntityResponse>()
  for (const item of content ?? []) {
    const key = entityKey(item.name, item.version)
    if (!map.has(key)) map.set(key, item)
  }
  return map
}

function remapEntityId<T extends NotationBoundEntityLike>(
  entity: T,
  oldId: string,
  newId: string,
  onRemapId: (oldId: string, newId: string) => void
): void {
  entity.id = newId
  entity._isNew = false
  onRemapId(oldId, newId)
}

/**
 * Create notation-bound entities (components/relations), reusing rows that already
 * exist for the same notation+name+version (e.g. after a partial failed import).
 */
export async function resolveNewNotationBoundEntities<T extends NotationBoundEntityLike>(
  options: ResolveNewNotationBoundEntitiesOptions<T>
): Promise<void> {
  const {
    entities,
    notationId,
    ownerId: _ownerId,
    apiEndpoint,
    entityTypeName,
    buildCreateRequest,
    onRemapId,
    onProgress,
  } = options

  const query = listParams(PAGE_SIZE_NOTATION)
  query.set('notationId', notationId)
  const listPath = `${apiEndpoint}?${query.toString()}`

  const existingResult = await apiGet<PaginatedResponse<NotationBoundEntityResponse>>(listPath)
  if (!existingResult.success) {
    throw new Error(`Ошибка загрузки ${entityTypeName}: ${existingResult.error.message}`)
  }

  const existingByKey = indexByNameVersion(existingResult.data.content)
  const resolvedIdByKey = new Map<string, string>()
  const newEntities = entities.filter(entity => entity._isNew)

  for (const entity of newEntities) {
    const oldId = entity.id
    const key = entityKey(entity.name, entity.version)

    const alreadyResolvedId = resolvedIdByKey.get(key)
    if (alreadyResolvedId) {
      remapEntityId(entity, oldId, alreadyResolvedId, onRemapId)
      continue
    }

    const existing = existingByKey.get(key)
    if (existing) {
      remapEntityId(entity, oldId, existing.id, onRemapId)
      resolvedIdByKey.set(key, existing.id)
      continue
    }

    onProgress(`Создание ${entityTypeName}: ${entity.name}`)
    const result = await apiPost<NotationBoundEntityResponse>(apiEndpoint, buildCreateRequest(entity))
    if (!result.success) {
      if (result.error.status === 409) {
        const refresh = await apiGet<PaginatedResponse<NotationBoundEntityResponse>>(listPath)
        if (refresh.success) {
          const refreshed = indexByNameVersion(refresh.data.content).get(key)
          if (refreshed) {
            remapEntityId(entity, oldId, refreshed.id, onRemapId)
            resolvedIdByKey.set(key, refreshed.id)
            existingByKey.set(key, refreshed)
            continue
          }
        }
      }
      throw new Error(
        formatEntitySaveError(
          'нотации',
          'создания',
          entityTypeName,
          result.error.status,
          result.error.message
        )
      )
    }

    remapEntityId(entity, oldId, result.data.id, onRemapId)
    resolvedIdByKey.set(key, result.data.id)
    existingByKey.set(key, result.data)
  }
}

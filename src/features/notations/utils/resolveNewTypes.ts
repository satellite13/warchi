import { apiGet, apiPost } from '@/composables/useApi'
import { listParams } from '@/api/queryHelpers'
import { formatEntitySaveError } from '@/utils/formatEntityError'
import i18n from '@/i18n'
import type { PaginatedResponse } from '@/types/entities'

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase()
}

interface TypeLike {
  id: string
  name: string
  _isNew?: boolean
  parsedAttrs: Record<string, unknown>
}

interface TypeResponseLike {
  id: string
  name: string
  attrs?: string | null
}

export interface ResolveNewTypesOptions<
  TType extends TypeLike,
  TEntity,
> {
  types: TType[]
  entities: TEntity[]
  typeOwnerId: string
  apiEndpoint: string
  entityTypeName: string
  getTypeId: (entity: TEntity) => string
  setTypeId: (entity: TEntity, newId: string) => void
  parseAttrs: (attrs: string | null) => Record<string, unknown>
  serializeAttrs: (parsedAttrs: Record<string, unknown>) => string | null
  onProgress: (msg: string) => void
}

function indexTypesByName(content: TypeResponseLike[] | undefined): Map<string, TypeResponseLike> {
  const existingByName = new Map<string, TypeResponseLike>()
  for (const existing of content ?? []) {
    const key = normalizeTypeName(existing.name)
    if (!key || existingByName.has(key)) continue
    existingByName.set(key, existing)
  }
  return existingByName
}

function remapTypeId<TType extends TypeLike, TEntity>(
  type: TType,
  oldId: string,
  newId: string,
  entities: TEntity[],
  getTypeId: (entity: TEntity) => string,
  setTypeId: (entity: TEntity, newId: string) => void
): void {
  type.id = newId
  type._isNew = false
  entities.forEach(e => {
    if (getTypeId(e) === oldId) setTypeId(e, newId)
  })
}

export async function resolveNewTypes<
  TType extends TypeLike,
  TEntity,
>(options: ResolveNewTypesOptions<TType, TEntity>): Promise<void> {
  const {
    types,
    entities,
    typeOwnerId,
    apiEndpoint,
    entityTypeName,
    getTypeId,
    setTypeId,
    parseAttrs,
    serializeAttrs,
    onProgress,
  } = options

  const query = listParams()
  const existingResult = await apiGet<PaginatedResponse<TypeResponseLike>>(
    `${apiEndpoint}?${query.toString()}`
  )
  if (!existingResult.success) {
    throw new Error(`Ошибка загрузки ${entityTypeName}: ${existingResult.error.message}`)
  }

  const existingByName = indexTypesByName(existingResult.data.content)
  const resolvedIdByName = new Map<string, string>()

  const newTypes = types.filter(t => t._isNew)
  for (const type of newTypes) {
    const oldId = type.id
    const normalizedName = normalizeTypeName(type.name)

    const resolvedExistingId = normalizedName
      ? resolvedIdByName.get(normalizedName)
      : undefined
    if (resolvedExistingId) {
      remapTypeId(type, oldId, resolvedExistingId, entities, getTypeId, setTypeId)
      continue
    }

    const existingType = normalizedName ? existingByName.get(normalizedName) : undefined
    if (existingType) {
      type.parsedAttrs = parseAttrs(existingType.attrs ?? null) as TType['parsedAttrs']
      remapTypeId(type, oldId, existingType.id, entities, getTypeId, setTypeId)
      if (normalizedName) resolvedIdByName.set(normalizedName, existingType.id)
      continue
    }

    onProgress(`Создание ${entityTypeName}: ${type.name}`)
    const request = {
      name: type.name,
      ownerId: typeOwnerId,
      attrs: serializeAttrs(type.parsedAttrs),
    }
    const result = await apiPost<TypeResponseLike>(apiEndpoint, request)
    if (!result.success) {
      if (result.error.status === 409 && normalizedName) {
        const refresh = await apiGet<PaginatedResponse<TypeResponseLike>>(
          `${apiEndpoint}?${query.toString()}`
        )
        if (refresh.success) {
          const refreshed = indexTypesByName(refresh.data.content).get(normalizedName)
          if (refreshed) {
            type.parsedAttrs = parseAttrs(refreshed.attrs ?? null) as TType['parsedAttrs']
            remapTypeId(type, oldId, refreshed.id, entities, getTypeId, setTypeId)
            resolvedIdByName.set(normalizedName, refreshed.id)
            existingByName.set(normalizedName, refreshed)
            continue
          }
        }
        throw new Error(
          String(
            i18n.global.t('notations.typeNameConflict', {
              name: type.name,
              entity: entityTypeName,
            })
          )
        )
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
    remapTypeId(type, oldId, result.data.id, entities, getTypeId, setTypeId)
    if (normalizedName) resolvedIdByName.set(normalizedName, result.data.id)
  }
}

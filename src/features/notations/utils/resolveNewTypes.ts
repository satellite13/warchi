import { PAGE_SIZE_FULL } from '@/api/queryHelpers'
import {
  loadExistingByListParams,
  postCreateEntity,
  resolveNewEntitiesByKey,
  typeNameConflictMessage,
} from './resolveNewEntities'

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

export interface ResolveNewTypesOptions<TType extends TypeLike, TEntity> {
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

function remapTypeId<TType extends TypeLike, TEntity>(
  type: TType,
  oldId: string,
  newId: string,
  entities: TEntity[],
  getTypeId: (entity: TEntity) => string,
  setTypeId: (entity: TEntity, newId: string) => void,
): void {
  type.id = newId
  type._isNew = false
  entities.forEach(e => {
    if (getTypeId(e) === oldId) setTypeId(e, newId)
  })
}

export async function resolveNewTypes<TType extends TypeLike, TEntity>(
  options: ResolveNewTypesOptions<TType, TEntity>,
): Promise<void> {
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

  await resolveNewEntitiesByKey<TType, TypeResponseLike>({
    locals: types,
    isNew: t => Boolean(t._isNew),
    keyOfLocal: t => normalizeTypeName(t.name),
    keyOfRemote: remote => normalizeTypeName(remote.name),
    loadExisting: () =>
      loadExistingByListParams<TypeResponseLike>(apiEndpoint, undefined, PAGE_SIZE_FULL),
    reloadExisting: () =>
      loadExistingByListParams<TypeResponseLike>(apiEndpoint, undefined, PAGE_SIZE_FULL),
    create: async type =>
      postCreateEntity<TypeResponseLike>(apiEndpoint, {
        name: type.name,
        ownerId: typeOwnerId,
        attrs: serializeAttrs(type.parsedAttrs),
      }),
    onReuse: (type, remote) => {
      if (remote.attrs !== undefined) {
        type.parsedAttrs = parseAttrs(remote.attrs ?? null) as TType['parsedAttrs']
      }
      remapTypeId(type, type.id, remote.id, entities, getTypeId, setTypeId)
    },
    onCreated: (type, remote) => {
      remapTypeId(type, type.id, remote.id, entities, getTypeId, setTypeId)
    },
    onProgress,
    progressLabel: type => `Создание ${entityTypeName}: ${type.name}`,
    entityTypeName,
    conflictMessage: type => typeNameConflictMessage(type.name, entityTypeName),
  })
}

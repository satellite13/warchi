import { PAGE_SIZE_NOTATION } from '@/api/queryHelpers'
import i18n from '@/i18n'
import {
  loadExistingByListParams,
  postCreateEntity,
  resolveNewEntitiesByKey,
} from './resolveNewEntities'
import { entityNameVersionKey } from './nameVersionUniqueness'

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

function remapEntityId<T extends NotationBoundEntityLike>(
  entity: T,
  oldId: string,
  newId: string,
  onRemapId: (oldId: string, newId: string) => void,
): void {
  entity.id = newId
  entity._isNew = false
  onRemapId(oldId, newId)
}

function boundEntityNameVersionConflictMessage(
  name: string,
  version: string,
  entityTypeName: string,
): string {
  return String(
    i18n.global.t('notations.boundEntityNameVersionConflict', {
      name,
      version,
      entity: entityTypeName,
    }),
  )
}

/**
 * Create notation-bound entities (components/relations), reusing rows that already
 * exist for the same notation+name+version (e.g. after a partial failed import).
 * Two distinct new locals with the same name+version are rejected (not merged).
 */
export async function resolveNewNotationBoundEntities<T extends NotationBoundEntityLike>(
  options: ResolveNewNotationBoundEntitiesOptions<T>,
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

  const params = { notationId }

  await resolveNewEntitiesByKey<T, NotationBoundEntityResponse>({
    locals: entities,
    isNew: entity => Boolean(entity._isNew),
    keyOfLocal: entity => entityNameVersionKey(entity.name, entity.version),
    keyOfRemote: remote => entityNameVersionKey(remote.name, remote.version),
    loadExisting: () =>
      loadExistingByListParams<NotationBoundEntityResponse>(
        apiEndpoint,
        params,
        PAGE_SIZE_NOTATION,
      ),
    reloadExisting: () =>
      loadExistingByListParams<NotationBoundEntityResponse>(
        apiEndpoint,
        params,
        PAGE_SIZE_NOTATION,
      ),
    create: async entity => postCreateEntity(apiEndpoint, buildCreateRequest(entity)),
    onReuse: (entity, remote) => {
      remapEntityId(entity, entity.id, remote.id, onRemapId)
    },
    onCreated: (entity, remote) => {
      remapEntityId(entity, entity.id, remote.id, onRemapId)
    },
    onProgress,
    progressLabel: entity => `Создание ${entityTypeName}: ${entity.name}`,
    entityTypeName,
    conflictMessage: entity =>
      boundEntityNameVersionConflictMessage(entity.name, entity.version, entityTypeName),
  })
}

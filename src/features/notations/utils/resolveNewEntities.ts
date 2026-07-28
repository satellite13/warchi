import { fetchAllPages } from '@/api/fetchAllPages'
import { PAGE_SIZE_FULL, PAGE_SIZE_NOTATION } from '@/api/queryHelpers'
import { apiGet, apiPost } from '@/composables/useApi'
import { formatEntitySaveError } from '@/utils/formatEntityError'
import i18n from '@/i18n'
import type { PaginatedResponse } from '@/types/entities'
import { listParams } from '@/api/queryHelpers'

export type ResolveByKeyOptions<TLocal, TRemote> = {
  locals: TLocal[]
  isNew: (local: TLocal) => boolean
  keyOfLocal: (local: TLocal) => string
  keyOfRemote: (remote: TRemote) => string
  loadExisting: () => Promise<TRemote[]>
  reloadExisting?: () => Promise<TRemote[]>
  create: (local: TLocal) => Promise<{ ok: true; data: TRemote } | { ok: false; status: number; message: string }>
  onReuse: (local: TLocal, remote: TRemote) => void
  onCreated: (local: TLocal, remote: TRemote) => void
  onProgress: (msg: string) => void
  progressLabel: (local: TLocal) => string
  entityTypeName: string
  conflictMessage?: (local: TLocal) => string
}

/**
 * Generic create-or-reuse loop for new editor entities (types, components, relations).
 */
export async function resolveNewEntitiesByKey<TLocal, TRemote extends { id: string }>(
  options: ResolveByKeyOptions<TLocal, TRemote>,
): Promise<void> {
  const existing = await options.loadExisting()
  const existingByKey = new Map<string, TRemote>()
  for (const remote of existing) {
    const key = options.keyOfRemote(remote)
    if (key && !existingByKey.has(key)) existingByKey.set(key, remote)
  }
  const resolvedIdByKey = new Map<string, string>()

  for (const local of options.locals.filter(options.isNew)) {
    const key = options.keyOfLocal(local)

    const alreadyResolvedId = key ? resolvedIdByKey.get(key) : undefined
    if (alreadyResolvedId) {
      // Two distinct local entities share one uniqueness key in this batch —
      // never collapse them onto one remote id (silent merge breaks the editor).
      if (options.conflictMessage) {
        throw new Error(options.conflictMessage(local))
      }
      throw new Error(`Duplicate ${options.entityTypeName} key in save batch`)
    }

    const existingRemote = key ? existingByKey.get(key) : undefined
    if (existingRemote) {
      options.onReuse(local, existingRemote)
      if (key) resolvedIdByKey.set(key, existingRemote.id)
      continue
    }

    options.onProgress(options.progressLabel(local))
    const result = await options.create(local)
    if (!result.ok) {
      if (result.status === 409 && options.reloadExisting) {
        const refreshedList = await options.reloadExisting()
        const refreshedByKey = new Map<string, TRemote>()
        for (const remote of refreshedList) {
          const remoteKey = options.keyOfRemote(remote)
          if (remoteKey && !refreshedByKey.has(remoteKey)) refreshedByKey.set(remoteKey, remote)
        }
        const refreshed = key ? refreshedByKey.get(key) : undefined
        if (refreshed) {
          options.onReuse(local, refreshed)
          if (key) {
            resolvedIdByKey.set(key, refreshed.id)
            existingByKey.set(key, refreshed)
          }
          continue
        }
        if (options.conflictMessage) {
          throw new Error(options.conflictMessage(local))
        }
      }
      throw new Error(
        formatEntitySaveError(
          'нотации',
          'создания',
          options.entityTypeName,
          result.status,
          result.message,
        ),
      )
    }

    options.onCreated(local, result.data)
    if (key) {
      resolvedIdByKey.set(key, result.data.id)
      existingByKey.set(key, result.data)
    }
  }
}

export async function loadExistingByListParams<T>(
  apiEndpoint: string,
  params?: Record<string, string | undefined>,
  pageSize: number = PAGE_SIZE_FULL,
): Promise<T[]> {
  // Prefer fetchAllPages so multi-page catalogs are fully covered.
  return fetchAllPages<T>(apiEndpoint, params, {
    pageSize: pageSize === PAGE_SIZE_FULL ? PAGE_SIZE_NOTATION : pageSize,
    errorLabel: apiEndpoint,
  })
}

/** Fallback single-shot list (legacy callers / conflict refresh). */
export async function loadExistingPageContent<T>(
  apiEndpoint: string,
  query: URLSearchParams,
): Promise<T[]> {
  const result = await apiGet<PaginatedResponse<T>>(`${apiEndpoint}?${query.toString()}`)
  if (!result.success) {
    throw new Error(`Ошибка загрузки ${apiEndpoint}: ${result.error.message}`)
  }
  return result.data.content ?? []
}

export function buildListQuery(size: number = PAGE_SIZE_FULL): URLSearchParams {
  return listParams(size)
}

export async function postCreateEntity<T>(
  apiEndpoint: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const result = await apiPost<T>(apiEndpoint, body)
  if (!result.success) {
    return { ok: false, status: result.error.status, message: result.error.message }
  }
  return { ok: true, data: result.data }
}

export function typeNameConflictMessage(name: string, entityTypeName: string): string {
  return String(
    i18n.global.t('notations.typeNameConflict', {
      name,
      entity: entityTypeName,
    }),
  )
}

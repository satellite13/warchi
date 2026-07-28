import { apiGet } from '@/composables/useApi'
import { PAGE_SIZE_NOTATION, pagedListParams } from '@/api/queryHelpers'
import type { PaginatedResponse } from '@/types/entities'
import { paginatedContent, paginatedIsLastPage, paginatedTotalPages } from '@/utils/paginatedResponse'

export type FetchAllPagesOptions = {
  pageSize?: number
  /** After page 0, fetch remaining pages in parallel (model-load style). */
  parallel?: boolean
  errorLabel?: string
}

function applyParams(query: URLSearchParams, params?: Record<string, string | undefined>): void {
  if (!params) return
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, value)
  }
}

export async function fetchAllPages<T>(
  path: string,
  params?: Record<string, string | undefined>,
  options?: FetchAllPagesOptions,
): Promise<T[]> {
  const pageSize = options?.pageSize ?? PAGE_SIZE_NOTATION
  const errorLabel = options?.errorLabel ?? path
  const basePath = path.startsWith('/') ? path : `/${path}`

  const firstQuery = pagedListParams(0, pageSize)
  applyParams(firstQuery, params)
  const first = await apiGet<PaginatedResponse<T>>(`${basePath}?${firstQuery.toString()}`)
  if (!first.success) {
    throw new Error(`Ошибка загрузки ${errorLabel}: ${first.error.message}`)
  }

  const collected = [...paginatedContent(first.data)]
  if (paginatedIsLastPage(first.data, 0)) return collected

  const totalPages = paginatedTotalPages(first.data)
  if (options?.parallel && totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, async (_, index) => {
        const page = index + 1
        const query = pagedListParams(page, pageSize)
        applyParams(query, params)
        const result = await apiGet<PaginatedResponse<T>>(`${basePath}?${query.toString()}`)
        if (!result.success) {
          throw new Error(`Ошибка загрузки ${errorLabel}: ${result.error.message}`)
        }
        return paginatedContent(result.data)
      }),
    )
    for (const batch of rest) collected.push(...batch)
    return collected
  }

  let page = 1
  while (true) {
    const query = pagedListParams(page, pageSize)
    applyParams(query, params)
    const result = await apiGet<PaginatedResponse<T>>(`${basePath}?${query.toString()}`)
    if (!result.success) {
      throw new Error(`Ошибка загрузки ${errorLabel}: ${result.error.message}`)
    }
    collected.push(...paginatedContent(result.data))
    if (paginatedIsLastPage(result.data, page)) break
    page += 1
  }
  return collected
}

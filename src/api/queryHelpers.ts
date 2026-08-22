/** Standard page sizes for API queries */
export const PAGE_SIZE_SEARCH = 10
export const PAGE_SIZE_LIST = 50
export const PAGE_SIZE_BATCH = 100
export const PAGE_SIZE_FULL = 1000
export const PAGE_SIZE_NOTATION = 2000
/** Editor page size selected from the large-model HTTP/2 benchmark. */
export const PAGE_SIZE_MODEL_NODES = 5000
export const PAGE_SIZE_MODEL_DIAGRAMS = 2000
export const MODEL_TREE_PAGE_SIZE = 500
export const MODEL_RESOLVE_CHUNK_SIZE = 2000
/** Backpressure for backend, JSON parsing, and Vue conversion while walking model pages. */
export const MODEL_PAGE_FETCH_CONCURRENCY = 1

/** Stable first-occurrence dedupe followed by bounded chunks. */
export function chunkUniqueIds(
  ids: readonly string[],
  chunkSize: number = MODEL_RESOLVE_CHUNK_SIZE
): string[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError('chunkSize must be a positive integer')
  }
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let offset = 0; offset < unique.length; offset += chunkSize) {
    chunks.push(unique.slice(offset, offset + chunkSize))
  }
  return chunks
}

/** URLSearchParams with `{ size }` for fetching all/many items */
export function listParams(size: number = PAGE_SIZE_FULL): URLSearchParams {
  return new URLSearchParams({ size: String(size) })
}

/** URLSearchParams with `{ page, size }` for paginated lists */
export function pagedListParams(
  page: number = 0,
  size: number = PAGE_SIZE_LIST,
): URLSearchParams {
  return new URLSearchParams({ page: String(page), size: String(size) })
}

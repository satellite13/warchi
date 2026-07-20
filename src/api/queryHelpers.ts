/** Standard page sizes for API queries */
export const PAGE_SIZE_SEARCH = 10
export const PAGE_SIZE_LIST = 50
export const PAGE_SIZE_BATCH = 100
export const PAGE_SIZE_FULL = 1000
export const PAGE_SIZE_NOTATION = 2000
/** Model editor graph entities (nodes/links); diagrams stay smaller — attrs are heavy. */
export const PAGE_SIZE_MODEL_NODES = 5000
export const PAGE_SIZE_MODEL_DIAGRAMS = 500

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

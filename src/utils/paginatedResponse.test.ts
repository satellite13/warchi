import { describe, expect, it } from "vitest"
import { paginatedIsLastPage, paginatedTotalElements, paginatedTotalPages } from "./paginatedResponse"

describe("paginatedResponse", () => {
  it("reads totals from nested Spring PagedModel page", () => {
    const data = {
      page: { size: 20, number: 0, totalElements: 42, totalPages: 3 },
    }
    expect(paginatedTotalPages(data)).toBe(3)
    expect(paginatedTotalElements(data)).toBe(42)
    expect(paginatedIsLastPage(data, 0)).toBe(false)
    expect(paginatedIsLastPage(data, 2)).toBe(true)
  })

  it("falls back to flat PageImpl-style fields", () => {
    const data = { totalPages: 5, totalElements: 100, last: true }
    expect(paginatedTotalPages(data)).toBe(5)
    expect(paginatedTotalElements(data)).toBe(100)
    expect(paginatedIsLastPage(data, 0)).toBe(true)
  })
})

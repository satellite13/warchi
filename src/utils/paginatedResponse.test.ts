import { describe, expect, it } from "vitest"
import {
  paginatedContent,
  paginatedIsLastPage,
  paginatedTotalElements,
  paginatedTotalPages,
} from "./paginatedResponse"

describe("paginatedResponse", () => {
  it("reads list items from content or items", () => {
    expect(paginatedContent({ content: [{ id: "1" }] })).toEqual([{ id: "1" }])
    expect(paginatedContent({ items: [{ id: "2" }] })).toEqual([{ id: "2" }])
    expect(paginatedContent([{ id: "3" }])).toEqual([{ id: "3" }])
    expect(paginatedContent({})).toEqual([])
  })

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

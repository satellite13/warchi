import { describe, expect, it } from "vitest"
import {
  paginatedContent,
  paginatedIsLastPage,
  paginatedTotalElements,
  paginatedTotalPages,
} from "./paginatedResponse"

describe("paginatedResponse", () => {
  it("paginatedContent reads array, content, and items", () => {
    expect(paginatedContent({ content: [{ id: "1" }] })).toEqual([{ id: "1" }])
    expect(paginatedContent({ items: [{ id: "2" }] })).toEqual([{ id: "2" }])
    expect(paginatedContent([{ id: "3" }])).toEqual([{ id: "3" }])
    expect(paginatedContent({})).toEqual([])
  })

  it("reads page meta from nested page or flat fields", () => {
    expect(paginatedTotalPages({ page: { number: 0, size: 10, totalElements: 25, totalPages: 3 } })).toBe(
      3
    )
    expect(paginatedTotalPages({ totalPages: 4 })).toBe(4)
    expect(paginatedTotalElements({ page: { number: 0, size: 10, totalElements: 25, totalPages: 3 } })).toBe(
      25
    )
    expect(paginatedTotalElements({ totalElements: 7 })).toBe(7)
  })

  it("paginatedIsLastPage uses last flag or page index", () => {
    expect(paginatedIsLastPage({ last: true }, 0)).toBe(true)
    expect(paginatedIsLastPage({ totalPages: 2 }, 0)).toBe(false)
    expect(paginatedIsLastPage({ totalPages: 2 }, 1)).toBe(true)
  })
})

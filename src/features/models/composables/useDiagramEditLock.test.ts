import { describe, expect, it } from "vitest"
import { isDiagramServerNewerThanLocal } from "./useDiagramEditLock"

describe("isDiagramServerNewerThanLocal", () => {
  it("returns false when remote is null", () => {
    expect(isDiagramServerNewerThanLocal(null, "2025-01-01T00:00:00.000Z")).toBe(false)
  })

  it("returns false when local is null or undefined", () => {
    expect(isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", null)).toBe(false)
    expect(isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", undefined)).toBe(false)
  })

  it("returns false when remote is not newer than local", () => {
    expect(
      isDiagramServerNewerThanLocal("2024-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z")
    ).toBe(false)
    expect(
      isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z")
    ).toBe(false)
  })

  it("returns true when remote is strictly newer than local", () => {
    expect(
      isDiagramServerNewerThanLocal("2025-06-15T12:00:00.000Z", "2025-01-01T00:00:00.000Z")
    ).toBe(true)
  })

  it("returns false for invalid ISO strings", () => {
    expect(isDiagramServerNewerThanLocal("not-a-date", "2025-01-01T00:00:00.000Z")).toBe(false)
    expect(isDiagramServerNewerThanLocal("2025-01-01T00:00:00.000Z", "invalid")).toBe(false)
  })
})

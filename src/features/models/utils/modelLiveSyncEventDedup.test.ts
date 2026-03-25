import { describe, expect, it } from "vitest"
import { createModelChangedEventIdDeduper } from "./modelLiveSyncEventDedup"

describe("createModelChangedEventIdDeduper", () => {
  it("allows first occurrence and blocks duplicate", () => {
    const d = createModelChangedEventIdDeduper(10)
    expect(d.consume("a")).toBe(true)
    expect(d.consume("a")).toBe(false)
    expect(d.consume("b")).toBe(true)
  })

  it("treats missing or empty id as always unique", () => {
    const d = createModelChangedEventIdDeduper(10)
    expect(d.consume(undefined)).toBe(true)
    expect(d.consume(undefined)).toBe(true)
    expect(d.consume("")).toBe(true)
  })

  it("evicts oldest when over capacity", () => {
    const d = createModelChangedEventIdDeduper(2)
    expect(d.consume("x")).toBe(true)
    expect(d.consume("y")).toBe(true)
    expect(d.consume("z")).toBe(true)
    expect(d.consume("x")).toBe(true)
  })
})

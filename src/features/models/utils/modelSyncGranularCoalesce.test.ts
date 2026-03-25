import { describe, expect, it } from "vitest"
import {
  coalesceModelSyncGranularEvents,
  parseGranularSyncEventsFromPayload,
} from "./modelSyncGranularCoalesce"

describe("coalesceModelSyncGranularEvents", () => {
  it("delete wins over pending update for same entity", () => {
    const r = coalesceModelSyncGranularEvents([
      { type: "node_updated", entity: "node", id: "1", revision: 1 },
      { type: "node_deleted", entity: "node", id: "1", revision: 2 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]!.type).toBe("node_deleted")
  })

  it("last event per slot wins", () => {
    const r = coalesceModelSyncGranularEvents([
      { type: "node_updated", entity: "node", id: "1", revision: 5 },
      { type: "node_updated", entity: "node", id: "1", revision: 3 },
    ])
    expect(r[0]!.revision).toBe(3)
  })
})

describe("parseGranularSyncEventsFromPayload", () => {
  it("parses valid array and skips garbage", () => {
    const r = parseGranularSyncEventsFromPayload([
      { type: "node_created", entity: "node", id: "u1", revision: 1 },
      null,
      { type: 1 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]!.id).toBe("u1")
  })
})

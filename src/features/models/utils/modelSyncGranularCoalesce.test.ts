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

  it.each([
    ["created", "updated", "created"],
    ["created", "deleted", "deleted"],
    ["updated", "created", "created"],
    ["updated", "deleted", "deleted"],
    ["deleted", "updated", "deleted"],
    ["deleted", "created", "created"],
  ] as const)(
    "reduces %s followed by %s to %s intent with the latest revision",
    (first, second, expected) => {
      const r = coalesceModelSyncGranularEvents([
        { type: `node_${first}`, entity: "node", id: "1", revision: 5 },
        { type: `node_${second}`, entity: "node", id: "1", revision: 6 },
      ])

      expect(r).toEqual([
        { type: `node_${expected}`, entity: "node", id: "1", revision: 6 },
      ])
    }
  )

  it("keeps latest metadata for repeated updates", () => {
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

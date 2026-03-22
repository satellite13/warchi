import { describe, expect, it } from "vitest"
import { mergeEntityListFromRemote, type MergeableEntity } from "./modelEntityMerge"

type TRow = { id: string; v: number }
type TLoc = MergeableEntity & { id: string; v: number }

const toLoc = (r: TRow): TLoc => ({ id: r.id, v: r.v })

describe("mergeEntityListFromRemote", () => {
  it("replaces clean local rows with remote order", () => {
    const local: TLoc[] = [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
    ]
    const remote: TRow[] = [
      { id: "b", v: 2 },
      { id: "a", v: 2 },
    ]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.map((x) => x.id)).toEqual(["b", "a"])
    expect(out.find((x) => x.id === "a")?.v).toBe(2)
    expect(out.find((x) => x.id === "b")?.v).toBe(2)
  })

  it("keeps dirty local instead of remote", () => {
    const local: TLoc[] = [{ id: "a", v: 99, _isDirty: true }]
    const remote: TRow[] = [{ id: "a", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out).toHaveLength(1)
    expect(out[0]!.v).toBe(99)
    expect(out[0]!._isDirty).toBe(true)
  })

  it("keeps pending delete local when row still on server", () => {
    const local: TLoc[] = [{ id: "a", v: 1, _isDeleted: true }]
    const remote: TRow[] = [{ id: "a", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out[0]!._isDeleted).toBe(true)
    expect(out[0]!.v).toBe(1)
  })

  it("drops clean local rows missing on server", () => {
    const local: TLoc[] = [
      { id: "gone", v: 1 },
      { id: "b", v: 1 },
    ]
    const remote: TRow[] = [{ id: "b", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("appends local-only _isNew rows", () => {
    const local: TLoc[] = [
      { id: "temp1", v: 0, _isNew: true },
      { id: "a", v: 1 },
    ]
    const remote: TRow[] = [{ id: "a", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.map((x) => x.id)).toEqual(["a", "temp1"])
    expect(out.find((x) => x.id === "temp1")?._isNew).toBe(true)
  })

  it("keeps dirty orphan not on server", () => {
    const local: TLoc[] = [{ id: "orphan", v: 3, _isDirty: true }]
    const remote: TRow[] = []
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out).toEqual(local)
  })
})

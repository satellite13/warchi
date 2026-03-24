import { describe, expect, it } from "vitest"
import {
  mergeEntityListFromRemote,
  preserveOpenDiagramCanvasAfterRemoteMerge,
  type MergeableEntity,
} from "./modelEntityMerge"
import type { EditorDiagram } from "../types"

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
    expect(out.items.map((x) => x.id)).toEqual(["b", "a"])
    expect(out.items.find((x) => x.id === "a")?.v).toBe(2)
    expect(out.items.find((x) => x.id === "b")?.v).toBe(2)
  })

  it("keeps dirty local instead of remote", () => {
    const local: TLoc[] = [{ id: "a", v: 99, _isDirty: true }]
    const remote: TRow[] = [{ id: "a", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.items).toHaveLength(1)
    expect(out.items[0]!.v).toBe(99)
    expect(out.items[0]!._isDirty).toBe(true)
  })

  it("keeps pending delete local when row still on server", () => {
    const local: TLoc[] = [{ id: "a", v: 1, _isDeleted: true }]
    const remote: TRow[] = [{ id: "a", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.items[0]!._isDeleted).toBe(true)
    expect(out.items[0]!.v).toBe(1)
  })

  it("drops clean local rows missing on server", () => {
    const local: TLoc[] = [
      { id: "gone", v: 1 },
      { id: "b", v: 1 },
    ]
    const remote: TRow[] = [{ id: "b", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.items.map((x) => x.id)).toEqual(["b"])
    expect(out.missingRemoteIds).toEqual(["gone"])
    expect(out.droppedIds).toEqual(["gone"])
  })

  it("appends local-only _isNew rows", () => {
    const local: TLoc[] = [
      { id: "temp1", v: 0, _isNew: true },
      { id: "a", v: 1 },
    ]
    const remote: TRow[] = [{ id: "a", v: 2 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.items.map((x) => x.id)).toEqual(["a", "temp1"])
    expect(out.items.find((x) => x.id === "temp1")?._isNew).toBe(true)
  })

  it("keeps dirty orphan not on server", () => {
    const local: TLoc[] = [{ id: "orphan", v: 3, _isDirty: true }]
    const remote: TRow[] = []
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.items).toEqual(local)
    expect(out.missingRemoteIds).toEqual(["orphan"])
    expect(out.droppedIds).toEqual([])
  })

  it("reports remote-deleted clean node in merge metadata", () => {
    const local: TLoc[] = [
      { id: "deleted-node", v: 1 },
      { id: "alive", v: 2 },
    ]
    const remote: TRow[] = [{ id: "alive", v: 3 }]
    const out = mergeEntityListFromRemote(local, remote, toLoc)
    expect(out.items.map((x) => x.id)).toEqual(["alive"])
    expect(out.missingRemoteIds).toEqual(["deleted-node"])
    expect(out.droppedIds).toEqual(["deleted-node"])
  })
})

describe("preserveOpenDiagramCanvasAfterRemoteMerge", () => {
  const baseDiagram = (id: string, name: string, instances: EditorDiagram["parsedAttrs"]["instances"]): EditorDiagram => ({
    id,
    name,
    version: "1.0.0",
    ownerId: "o",
    modelId: "m",
    notationId: "n1",
    nodeId: null,
    parsedAttrs: {
      instances,
      documentFileId: undefined,
    },
  })

  it("replaces instances from previous row when diagram is open and not dirty", () => {
    const localInst = {
      nodes: [{ id: "i1", modelNodeId: "n1", x: 0, y: 0, width: 10, height: 10 }],
      edges: [{ id: "e1", modelLinkId: "L1", sourceInstanceId: "i1", targetInstanceId: "i1" }],
    }
    const remoteInst = { nodes: [], edges: [] }
    const previous: EditorDiagram[] = [baseDiagram("d1", "D", localInst)]
    const merged: EditorDiagram[] = [baseDiagram("d1", "D remote", remoteInst)]
    const out = preserveOpenDiagramCanvasAfterRemoteMerge(merged, previous, "d1")
    expect(out[0]!.name).toBe("D remote")
    expect(out[0]!.parsedAttrs.instances).toEqual(localInst)
  })

  it("does nothing when diagram is dirty", () => {
    const previous: EditorDiagram[] = [{ ...baseDiagram("d1", "D", { nodes: [], edges: [] }), _isDirty: true }]
    const remoteInst = {
      nodes: [{ id: "i1", modelNodeId: "n1", x: 1, y: 1, width: 10, height: 10 }],
      edges: [],
    }
    const merged: EditorDiagram[] = [baseDiagram("d1", "D", remoteInst)]
    const out = preserveOpenDiagramCanvasAfterRemoteMerge(merged, previous, "d1")
    expect(out[0]!.parsedAttrs.instances).toEqual(remoteInst)
  })

  it("no open id — unchanged", () => {
    const merged: EditorDiagram[] = [baseDiagram("d1", "D", { nodes: [], edges: [] })]
    const out = preserveOpenDiagramCanvasAfterRemoteMerge(merged, [], null)
    expect(out).toBe(merged)
  })
})

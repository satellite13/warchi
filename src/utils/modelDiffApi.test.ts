import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DiagramResponse, LinkResponse, NodeResponse } from "@/types/api"
import type { ModelVersionDiff } from "@/utils/modelDiff"
import type { ModelDiffApiResponse } from "@/utils/modelDiffApi"

const mockApiGet = vi.hoisted(() => vi.fn())
const mockComputeModelDiff = vi.hoisted(() => vi.fn())

vi.mock("@/composables/useApi", () => ({
  apiGet: mockApiGet,
}))

vi.mock("@/utils/modelDiff", () => ({
  computeModelDiff: mockComputeModelDiff,
}))

import { fetchModelDiff, normalizeApiDiffResponse } from "@/utils/modelDiffApi"

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeApiResponse(): ModelDiffApiResponse {
  return {
    nodes: [
      {
        kind: "added",
        path: "Root/NewNode",
        node: {
          id: "n1",
          stableId: "s-n1",
          name: "NewNode",
          nodeTypeId: "nt1",
          parentNodeId: "n-root",
          attrs: '{"color":"red"}',
        },
      },
      {
        kind: "modified",
        path: "Root/Changed",
        base: {
          id: "n2",
          name: "Changed",
          nodeTypeId: "nt1",
          attrs: '{"v":1}',
        },
        target: {
          id: "n2t",
          name: "Changed",
          nodeTypeId: "nt1",
          attrs: '{"v":2}',
        },
      },
    ],
    links: [
      {
        kind: "removed",
        key: "Root/A\tRoot/B\tlt1",
        link: {
          id: "l1",
          stableId: "s-l1",
          sourceNodeId: "nA",
          targetNodeId: "nB",
          linkTypeId: "lt1",
          attrs: null,
        },
      },
    ],
    diagrams: [
      {
        kind: "added",
        name: "Overview",
        diagram: {
          id: "d1",
          name: "Overview",
          version: "1.0.0",
          notationId: "not1",
          attrs: null,
        },
      },
    ],
  }
}

function makeLocalNode(overrides: Partial<NodeResponse> = {}): NodeResponse {
  return {
    id: "ln1",
    name: "LocalNode",
    modelId: "m1",
    ownerId: "o1",
    nodeTypeId: "nt1",
    ...overrides,
  }
}

function makeLocalLink(overrides: Partial<LinkResponse> = {}): LinkResponse {
  return {
    id: "ll1",
    sourceId: "ln1",
    targetId: "ln2",
    modelId: "m1",
    ownerId: "o1",
    linkTypeId: "lt1",
    ...overrides,
  }
}

function makeLocalDiagram(
  overrides: Partial<DiagramResponse> = {}
): DiagramResponse {
  return {
    id: "ld1",
    name: "Diag",
    version: "1.0.0",
    modelId: "m1",
    ownerId: "o1",
    notationId: "not1",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeApiDiffResponse
// ---------------------------------------------------------------------------

describe("normalizeApiDiffResponse", () => {
  it("converts API node items to local NodeDiffItems", () => {
    const apiResp = makeApiResponse()
    const diff = normalizeApiDiffResponse(apiResp)

    expect(diff.nodes).toHaveLength(2)

    const added = diff.nodes[0]!
    expect(added.kind).toBe("added")
    if (added.kind === "added") {
      expect(added.path).toBe("Root/NewNode")
      expect(added.node.id).toBe("n1")
      expect(added.node.modelId).toBe("")
      expect(added.node.ownerId).toBe("")
      expect(added.node.stableId).toBe("s-n1")
    }

    const modified = diff.nodes[1]!
    expect(modified.kind).toBe("modified")
    if (modified.kind === "modified") {
      expect(modified.base.attrs).toBe('{"v":1}')
      expect(modified.target.attrs).toBe('{"v":2}')
    }
  })

  it("parses link key into sourcePath / targetPath", () => {
    const apiResp = makeApiResponse()
    const diff = normalizeApiDiffResponse(apiResp)

    expect(diff.links).toHaveLength(1)
    const removed = diff.links[0]!
    expect(removed.kind).toBe("removed")
    if (removed.kind === "removed") {
      expect(removed.sourcePath).toBe("Root/A")
      expect(removed.targetPath).toBe("Root/B")
      expect(removed.link.sourceId).toBe("nA")
      expect(removed.link.targetId).toBe("nB")
    }
  })

  it("converts API diagram items to local DiagramDiffItems", () => {
    const apiResp = makeApiResponse()
    const diff = normalizeApiDiffResponse(apiResp)

    expect(diff.diagrams).toHaveLength(1)
    const added = diff.diagrams[0]!
    expect(added.kind).toBe("added")
    if (added.kind === "added") {
      expect(added.diagram.id).toBe("d1")
      expect(added.diagram.modelId).toBe("")
      expect(added.diagram.ownerId).toBe("")
    }
  })
})

// ---------------------------------------------------------------------------
// fetchModelDiff
// ---------------------------------------------------------------------------

describe("fetchModelDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns normalized diff on successful API call", async () => {
    const apiResp = makeApiResponse()
    mockApiGet.mockResolvedValue({ success: true, data: apiResp })

    const diff = await fetchModelDiff("base-id", "target-id")

    expect(mockApiGet).toHaveBeenCalledWith(
      "/models/base-id/diff/target-id"
    )
    expect(diff.nodes).toHaveLength(2)
    expect(diff.links).toHaveLength(1)
    expect(diff.diagrams).toHaveLength(1)
    expect(mockComputeModelDiff).not.toHaveBeenCalled()
  })

  it("falls back to local computation when API fails and localData provided", async () => {
    const localDiff: ModelVersionDiff = {
      nodes: [],
      links: [],
      diagrams: [],
    }
    mockApiGet.mockResolvedValue({
      success: false,
      error: { message: "Not Found", status: 404 },
    })
    mockComputeModelDiff.mockReturnValue(localDiff)

    const base = {
      nodes: [makeLocalNode()],
      links: [makeLocalLink()],
      diagrams: [makeLocalDiagram()],
    }
    const target = {
      nodes: [makeLocalNode({ id: "ln2", name: "Other" })],
      links: [],
      diagrams: [],
    }

    const diff = await fetchModelDiff("base-id", "target-id", {
      base,
      target,
    })

    expect(mockComputeModelDiff).toHaveBeenCalledWith(base, target)
    expect(diff).toBe(localDiff)
  })

  it("throws when API fails and no localData provided", async () => {
    mockApiGet.mockResolvedValue({
      success: false,
      error: { message: "Internal Server Error", status: 500 },
    })

    await expect(
      fetchModelDiff("base-id", "target-id")
    ).rejects.toThrow("Internal Server Error")

    expect(mockComputeModelDiff).not.toHaveBeenCalled()
  })
})

import { ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseDiagramAttrs } from "../modelAttrs"
import { createEmptyModelEditorState, type ModelEditorState } from "../types"
import { useModelBatchConflictResolution } from "./useModelBatchConflictResolution"

const { apiGetMock, mergeDiagramAttrsAfterBatchConflictReloadMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  mergeDiagramAttrsAfterBatchConflictReloadMock: vi.fn(),
}))

vi.mock("../../../composables/useApi", () => ({
  apiGet: apiGetMock,
}))

vi.mock("../utils/mergeLocalCustomPropsAfterReload", () => ({
  mergeDiagramAttrsAfterBatchConflictReload: mergeDiagramAttrsAfterBatchConflictReloadMock,
}))

describe("useModelBatchConflictResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolveBatchSaveReload merges local/server attrs after reload", async () => {
    const localAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "local",
      })
    )
    const serverAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "server",
      })
    )
    const reloadedAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "reloaded",
      })
    )
    const mergedAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "merged",
      })
    )

    apiGetMock.mockResolvedValue({
      success: true,
      data: {
        id: "d-1",
        name: "Diagram",
        version: "1.0.0",
        notationId: "notation-1",
        modelId: "model-1",
        ownerId: "owner-1",
        nodeId: null,
        attrs: JSON.stringify({
          instances: { nodes: [], edges: [] },
          documentFileId: "server",
        }),
      },
    })
    mergeDiagramAttrsAfterBatchConflictReloadMock.mockReturnValue(mergedAttrs)

    const state = ref<ModelEditorState>({
      ...createEmptyModelEditorState(),
      modelId: "model-1",
      ownerId: "owner-1",
      diagrams: [
        {
          id: "d-1",
          name: "Diagram",
          version: "1.0.0",
          notationId: "notation-1",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeId: null,
          parsedAttrs: localAttrs,
          _isDirty: false,
        },
      ],
    })
    const batchSaveConflict = ref([
      { kind: "diagram", id: "d-1", serverUpdatedAt: null, clientBaseUpdatedAt: null },
    ])
    const errorMessage = ref<string | null>(null)
    const pendingForceBatch = ref(false)
    const loadModel = vi.fn(async () => {
      const d = state.value.diagrams.find(item => item.id === "d-1")
      if (!d) return true
      d.parsedAttrs = reloadedAttrs
      return true
    })

    const { resolveBatchSaveReload } = useModelBatchConflictResolution({
      state,
      batchSaveConflict,
      errorMessage,
      pendingForceBatch,
      loadModel,
      saveChanges: async () => true,
    })

    await resolveBatchSaveReload()

    expect(batchSaveConflict.value).toBeNull()
    expect(apiGetMock).toHaveBeenCalledWith("/diagrams/d-1")
    expect(loadModel).toHaveBeenCalledTimes(1)
    expect(mergeDiagramAttrsAfterBatchConflictReloadMock).toHaveBeenCalledWith(
      localAttrs,
      serverAttrs,
      reloadedAttrs
    )
    expect(state.value.diagrams[0]?.parsedAttrs).toStrictEqual(mergedAttrs)
    expect(state.value.diagrams[0]?._isDirty).toBe(true)
  })

  it("hydrates a slim reloaded diagram before the three-way attrs merge", async () => {
    const localAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "local",
      })
    )
    const serverAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "server",
      })
    )
    const reloadedAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "reloaded",
      })
    )
    const mergedAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "merged",
      })
    )
    apiGetMock
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: "d-1",
          attrs: JSON.stringify({
            instances: { nodes: [], edges: [] },
            documentFileId: "server",
          }),
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: "d-1",
          attrs: JSON.stringify({
            instances: { nodes: [], edges: [] },
            documentFileId: "reloaded",
          }),
        },
      })
    mergeDiagramAttrsAfterBatchConflictReloadMock.mockReturnValue(mergedAttrs)

    const state = ref<ModelEditorState>({
      ...createEmptyModelEditorState(),
      modelId: "model-1",
      ownerId: "owner-1",
      diagrams: [
        {
          id: "d-1",
          name: "Diagram",
          version: "1.0.0",
          notationId: "notation-1",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeId: null,
          parsedAttrs: localAttrs,
        },
      ],
    })
    const { resolveBatchSaveReload } = useModelBatchConflictResolution({
      state,
      batchSaveConflict: ref([
        { kind: "diagram", id: "d-1", serverUpdatedAt: null, clientBaseUpdatedAt: null },
      ]),
      errorMessage: ref<string | null>(null),
      pendingForceBatch: ref(false),
      loadModel: async () => {
        const d = state.value.diagrams.find(item => item.id === "d-1")
        if (!d) return false
        d.parsedAttrs = parseDiagramAttrs(null)
        d._attrsPending = true
        return true
      },
      saveChanges: async () => true,
    })

    await resolveBatchSaveReload()

    expect(apiGetMock).toHaveBeenCalledTimes(2)
    expect(mergeDiagramAttrsAfterBatchConflictReloadMock).toHaveBeenCalledWith(
      localAttrs,
      serverAttrs,
      reloadedAttrs
    )
    expect(state.value.diagrams[0]?.parsedAttrs).toStrictEqual(mergedAttrs)
    expect(state.value.diagrams[0]?._attrsPending).toBe(false)
  })

  it("keeps the conflict dialog and skips merge when scoped reload fails", async () => {
    const localAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [], edges: [] },
        documentFileId: "local",
      })
    )
    const mergeSpy = mergeDiagramAttrsAfterBatchConflictReloadMock
    apiGetMock.mockResolvedValue({
      success: true,
      data: {
        id: "d-1",
        attrs: JSON.stringify({
          instances: { nodes: [], edges: [] },
          documentFileId: "server",
        }),
      },
    })
    const conflicts = [
      { kind: "diagram" as const, id: "d-1", serverUpdatedAt: null, clientBaseUpdatedAt: null },
    ]
    const batchSaveConflict = ref(conflicts)
    const errorMessage = ref<string | null>(null)
    const state = ref<ModelEditorState>({
      ...createEmptyModelEditorState(),
      modelId: "model-1",
      ownerId: "owner-1",
      diagrams: [
        {
          id: "d-1",
          name: "Diagram",
          version: "1.0.0",
          notationId: "notation-1",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeId: null,
          parsedAttrs: localAttrs,
        },
      ],
    })

    const { resolveBatchSaveReload } = useModelBatchConflictResolution({
      state,
      batchSaveConflict,
      errorMessage,
      pendingForceBatch: ref(false),
      loadModel: async () => false,
      saveChanges: async () => true,
      t: key => key,
    })

    await resolveBatchSaveReload()

    expect(batchSaveConflict.value).toEqual(conflicts)
    expect(errorMessage.value).toBe("models.batchSaveConflictReloadFailed")
    expect(mergeSpy).not.toHaveBeenCalled()
    expect(state.value.diagrams[0]?.parsedAttrs).toStrictEqual(localAttrs)
  })

  it("aborts merge and keeps local canvas when conflict hydrate GET fails", async () => {
    const localAttrs = parseDiagramAttrs(
      JSON.stringify({
        instances: { nodes: [{ id: "n1", modelNodeId: "m1", x: 1, y: 2 }], edges: [] },
        documentFileId: "local",
      })
    )
    apiGetMock
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: "d-1",
          attrs: JSON.stringify({
            instances: { nodes: [], edges: [] },
            documentFileId: "server",
          }),
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: { status: 500, message: "hydrate failed" },
      })

    const batchSaveConflict = ref([
      { kind: "diagram" as const, id: "d-1", serverUpdatedAt: null, clientBaseUpdatedAt: null },
    ])
    const errorMessage = ref<string | null>(null)
    const state = ref<ModelEditorState>({
      ...createEmptyModelEditorState(),
      modelId: "model-1",
      ownerId: "owner-1",
      diagrams: [
        {
          id: "d-1",
          name: "Diagram",
          version: "1.0.0",
          notationId: "notation-1",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeId: null,
          parsedAttrs: localAttrs,
        },
      ],
    })

    const { resolveBatchSaveReload } = useModelBatchConflictResolution({
      state,
      batchSaveConflict,
      errorMessage,
      pendingForceBatch: ref(false),
      loadModel: async () => {
        const d = state.value.diagrams.find(item => item.id === "d-1")
        if (!d) return false
        d.parsedAttrs = parseDiagramAttrs(null)
        d._attrsPending = true
        return true
      },
      saveChanges: async () => true,
      t: key => key,
    })

    await resolveBatchSaveReload()

    expect(batchSaveConflict.value).not.toBeNull()
    expect(errorMessage.value).toBe("models.batchSaveConflictHydrateFailed")
    expect(mergeDiagramAttrsAfterBatchConflictReloadMock).not.toHaveBeenCalled()
    expect(state.value.diagrams[0]?.parsedAttrs.documentFileId).toBe("local")
    expect(state.value.diagrams[0]?.parsedAttrs.instances.nodes.map(node => node.id)).toEqual([
      "n1",
    ])
  })

  it("resolveBatchSaveOverwrite sets force flag and delegates to saveChanges", async () => {
    const state = ref(createEmptyModelEditorState())
    const batchSaveConflict = ref([
      { kind: "node", id: "n-1", serverUpdatedAt: null, clientBaseUpdatedAt: null },
    ])
    const errorMessage = ref<string | null>(null)
    const pendingForceBatch = ref(false)
    const loadModel = vi.fn(async () => true)
    const saveChanges = vi.fn(async () => true)

    const { resolveBatchSaveOverwrite } = useModelBatchConflictResolution({
      state,
      batchSaveConflict,
      errorMessage,
      pendingForceBatch,
      loadModel,
      saveChanges,
    })

    const result = await resolveBatchSaveOverwrite()

    expect(result).toBe(true)
    expect(batchSaveConflict.value).toBeNull()
    expect(pendingForceBatch.value).toBe(true)
    expect(saveChanges).toHaveBeenCalledTimes(1)
  })

  it("dismissBatchSaveConflict clears conflict state", () => {
    const state = ref(createEmptyModelEditorState())
    const batchSaveConflict = ref([
      { kind: "diagram", id: "d-1", serverUpdatedAt: null, clientBaseUpdatedAt: null },
    ])
    const errorMessage = ref<string | null>(null)
    const pendingForceBatch = ref(false)

    const { dismissBatchSaveConflict } = useModelBatchConflictResolution({
      state,
      batchSaveConflict,
      errorMessage,
      pendingForceBatch,
      loadModel: async () => true,
      saveChanges: async () => false,
    })

    dismissBatchSaveConflict()
    expect(batchSaveConflict.value).toBeNull()
  })
})

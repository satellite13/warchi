import { ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from "../modelAttrs"
import type { ModelData } from "../../../types/entities"
import type { ModelEditorState } from "../types"
import { executeModelEditorSave } from "./modelEditorSaveCoordinator"

const mocks = vi.hoisted(() => ({
  applyDiagramGarbageSanitizeToState: vi.fn(),
  applyBatchRemapping: vi.fn(),
  batchSave: vi.fn(),
  buildBatchSaveRequest: vi.fn(),
  findBlankNamedBatchNodes: vi.fn(),
  hasBatchChanges: vi.fn(),
  isValidBatchResponse: vi.fn(),
  parseBatchSaveConflictDetails: vi.fn(),
  refreshBatchSavedEntityTimestamps: vi.fn(),
  remapNodeIds: vi.fn(),
  saveDiagrams: vi.fn(),
  saveLinks: vi.fn(),
  saveModelMetadata: vi.fn(),
  saveNodes: vi.fn(),
  ensureDirtyPendingDiagramAttrsLoaded: vi.fn(),
}))

vi.mock("../utils/sanitizeDiagramInstances", () => ({
  applyDiagramGarbageSanitizeToState: mocks.applyDiagramGarbageSanitizeToState,
}))

vi.mock("./ensureDiagramAttrs", () => ({
  ensureDirtyPendingDiagramAttrsLoaded: mocks.ensureDirtyPendingDiagramAttrsLoaded,
}))

vi.mock("./useModelBatchSave", () => ({
  applyBatchRemapping: mocks.applyBatchRemapping,
  batchSave: mocks.batchSave,
  buildBatchSaveRequest: mocks.buildBatchSaveRequest,
  findBlankNamedBatchNodes: mocks.findBlankNamedBatchNodes,
  hasBatchChanges: mocks.hasBatchChanges,
  isValidBatchResponse: mocks.isValidBatchResponse,
  parseBatchSaveConflictDetails: mocks.parseBatchSaveConflictDetails,
  refreshBatchSavedEntityTimestamps: mocks.refreshBatchSavedEntityTimestamps,
}))

vi.mock("./modelEditorSavePipeline", () => ({
  remapNodeIds: mocks.remapNodeIds,
  saveDiagrams: mocks.saveDiagrams,
  saveLinks: mocks.saveLinks,
  saveModelMetadata: mocks.saveModelMetadata,
  saveNodes: mocks.saveNodes,
}))

function createState(): ModelEditorState {
  return {
    modelId: "model-1",
    ownerId: "owner-1",
    nodes: [
      {
        id: "n-1",
        name: "Node",
        modelId: "model-1",
        ownerId: "owner-1",
        nodeTypeId: "type-1",
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
      },
      {
        id: "n-del",
        name: "Deleted Node",
        modelId: "model-1",
        ownerId: "owner-1",
        nodeTypeId: "type-1",
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
        _isDeleted: true,
      },
    ],
    links: [
      {
        id: "l-1",
        sourceId: "a",
        targetId: "b",
        modelId: "model-1",
        ownerId: "owner-1",
        linkTypeId: "lt-1",
        parsedAttrs: parseLinkAttrs(null),
      },
      {
        id: "l-del",
        sourceId: "a",
        targetId: "b",
        modelId: "model-1",
        ownerId: "owner-1",
        linkTypeId: "lt-1",
        parsedAttrs: parseLinkAttrs(null),
        _isDeleted: true,
      },
    ],
    diagrams: [
      {
        id: "d-1",
        name: "Diagram",
        version: "1.0.0",
        notationId: "notation-1",
        modelId: "model-1",
        ownerId: "owner-1",
        nodeId: null,
        parsedAttrs: parseDiagramAttrs(null),
      },
      {
        id: "d-del",
        name: "Deleted Diagram",
        version: "1.0.0",
        notationId: "notation-1",
        modelId: "model-1",
        ownerId: "owner-1",
        nodeId: null,
        parsedAttrs: parseDiagramAttrs(null),
        _isDeleted: true,
      },
    ],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

describe("executeModelEditorSave", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findBlankNamedBatchNodes.mockReturnValue([])
    mocks.buildBatchSaveRequest.mockReturnValue({
      nodes: { create: [], update: [], delete: [] },
      links: { create: [], update: [], delete: [] },
      diagrams: { create: [], update: [], delete: [] },
    })
    mocks.hasBatchChanges.mockReturnValue(false)
    mocks.saveNodes.mockResolvedValue(new Map<string, string>())
    mocks.saveLinks.mockResolvedValue(undefined)
    mocks.saveDiagrams.mockResolvedValue(undefined)
    mocks.saveModelMetadata.mockResolvedValue({
      data: { id: "model-1", name: "Model", version: "1.0.0", ownerId: "owner-1", attrs: null },
    })
    mocks.refreshBatchSavedEntityTimestamps.mockResolvedValue(undefined)
    mocks.ensureDirtyPendingDiagramAttrsLoaded.mockResolvedValue(undefined)
    mocks.batchSave.mockResolvedValue({ success: true, data: { nodeIdMap: {}, linkIdMap: {}, diagramIdMap: {} } })
    mocks.isValidBatchResponse.mockReturnValue(true)
    mocks.parseBatchSaveConflictDetails.mockReturnValue(null)
  })

  it("returns false when model is not loaded", async () => {
    const result = await executeModelEditorSave({
      model: ref<ModelData | null>(null),
      modelDirty: ref(false),
      modelInitialName: ref(""),
      modelCatalog: ref<ModelData[]>([]),
      state: ref(createState()),
      pendingForceBatch: ref(false),
      batchSaveConflict: ref(null),
      saveError: ref<string | null>(null),
      onProgress: vi.fn(),
      scheduleSaveErrorClear: vi.fn(),
    })

    expect(result).toBe(false)
    expect(mocks.buildBatchSaveRequest).not.toHaveBeenCalled()
  })

  it("blocks save for remote cascade conflicts with an actionable error", async () => {
    const state = ref(createState())
    const conflicted = state.value.links[0]
    if (!conflicted) throw new Error("expected link")
    conflicted._isDirty = true
    const saveError = ref<string | null>(null)
    const scheduleSaveErrorClear = vi.fn()

    const result = await executeModelEditorSave({
      model: ref<ModelData | null>({
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null,
      }),
      modelDirty: ref(false),
      modelInitialName: ref("Model"),
      modelCatalog: ref([]),
      state,
      pendingForceBatch: ref(false),
      batchSaveConflict: ref(null),
      saveError,
      remoteCascadeConflictLinkIds: new Set(["l-1"]),
      onProgress: vi.fn(),
      scheduleSaveErrorClear,
    })

    expect(result).toBe(false)
    expect(saveError.value).toContain("перезагруз")
    expect(saveError.value).toContain("повторите сохранение")
    expect(scheduleSaveErrorClear).not.toHaveBeenCalled()
    expect(mocks.buildBatchSaveRequest).not.toHaveBeenCalled()
    expect(mocks.batchSave).not.toHaveBeenCalled()
  })

  it("skips legacy entity pipeline when there are no batch changes", async () => {
    const state = ref(createState())
    // Local-only soft deletes (new+deleted) and clean rows — nothing for entity pipelines.
    state.value.nodes = state.value.nodes.filter(n => !n._isDeleted)
    state.value.links = state.value.links.filter(l => !l._isDeleted)
    state.value.diagrams = state.value.diagrams.filter(d => !d._isDeleted)
    const pendingForceBatch = ref(true)
    const onProgress = vi.fn()

    const result = await executeModelEditorSave({
      model: ref<ModelData | null>({
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null,
      }),
      modelDirty: ref(false),
      modelInitialName: ref("Model"),
      modelCatalog: ref<ModelData[]>([]),
      state,
      pendingForceBatch,
      batchSaveConflict: ref(null),
      saveError: ref<string | null>(null),
      onProgress,
      scheduleSaveErrorClear: vi.fn(),
    })

    expect(result).toBe(true)
    expect(mocks.ensureDirtyPendingDiagramAttrsLoaded).toHaveBeenCalled()
    expect(mocks.applyDiagramGarbageSanitizeToState).toHaveBeenCalled()
    expect(mocks.buildBatchSaveRequest).toHaveBeenCalled()
    expect(mocks.batchSave).not.toHaveBeenCalled()
    expect(mocks.saveNodes).not.toHaveBeenCalled()
    expect(mocks.remapNodeIds).not.toHaveBeenCalled()
    expect(mocks.saveLinks).not.toHaveBeenCalled()
    expect(mocks.saveDiagrams).not.toHaveBeenCalled()
    expect(pendingForceBatch.value).toBe(false)
    expect(state.value.nodes.map(n => n.id)).toEqual(["n-1"])
    expect(state.value.links.map(l => l.id)).toEqual(["l-1"])
    expect(state.value.diagrams.map(d => d.id)).toEqual(["d-1"])
  })

  it("uses batch path for entity create/update/delete and refreshes timestamps", async () => {
    const batchRequest = {
      nodes: { create: [{ tempId: "tmp" }], update: [], delete: [] },
      links: { create: [], update: [], delete: [] },
      diagrams: { create: [], update: [], delete: [] },
    }
    const batchResponse = {
      nodeIdMap: { tmp: "n-real" },
      linkIdMap: {},
      diagramIdMap: {},
    }
    mocks.hasBatchChanges.mockReturnValue(true)
    mocks.buildBatchSaveRequest.mockReturnValue(batchRequest)
    mocks.batchSave.mockResolvedValue({ success: true, data: batchResponse })

    const state = ref(createState())
    const nodesBefore = state.value.nodes
    const linksBefore = state.value.links
    const diagramsBefore = state.value.diagrams
    const result = await executeModelEditorSave({
      model: ref<ModelData | null>({
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null,
      }),
      modelDirty: ref(false),
      modelInitialName: ref("Model"),
      modelCatalog: ref<ModelData[]>([]),
      state,
      pendingForceBatch: ref(false),
      batchSaveConflict: ref(null),
      saveError: ref<string | null>(null),
      onProgress: vi.fn(),
      scheduleSaveErrorClear: vi.fn(),
    })

    expect(result).toBe(true)
    expect(mocks.batchSave).toHaveBeenCalledWith("model-1", batchRequest)
    expect(mocks.applyBatchRemapping).toHaveBeenCalledWith(
      batchResponse,
      nodesBefore,
      linksBefore,
      diagramsBefore,
      batchRequest
    )
    expect(mocks.refreshBatchSavedEntityTimestamps).toHaveBeenCalledWith(
      {
        nodes: nodesBefore,
        links: linksBefore,
        diagrams: diagramsBefore,
      },
      batchRequest,
      batchResponse
    )
    expect(mocks.saveNodes).not.toHaveBeenCalled()
    expect(mocks.saveLinks).not.toHaveBeenCalled()
    expect(mocks.saveDiagrams).not.toHaveBeenCalled()
    expect(state.value.nodes.map(n => n.id)).toEqual(["n-1"])
  })

  it("saves model metadata without calling entity pipelines when only the model is dirty", async () => {
    const model = ref<ModelData | null>({
      id: "model-1",
      name: "Renamed",
      version: "1.0.0",
      ownerId: "owner-1",
      attrs: null,
    })
    const modelDirty = ref(true)
    const modelInitialName = ref("Model")
    const modelCatalog = ref<ModelData[]>([])
    const saved = {
      id: "model-1",
      name: "Renamed",
      version: "1.0.0",
      ownerId: "owner-1",
      attrs: null,
    }
    mocks.saveModelMetadata.mockResolvedValue({ data: saved })
    const state = ref(createState())
    state.value.nodes = state.value.nodes.filter(n => !n._isDeleted)
    state.value.links = state.value.links.filter(l => !l._isDeleted)
    state.value.diagrams = state.value.diagrams.filter(d => !d._isDeleted)

    const result = await executeModelEditorSave({
      model,
      modelDirty,
      modelInitialName,
      modelCatalog,
      state,
      pendingForceBatch: ref(false),
      batchSaveConflict: ref(null),
      saveError: ref<string | null>(null),
      onProgress: vi.fn(),
      scheduleSaveErrorClear: vi.fn(),
    })

    expect(result).toBe(true)
    expect(mocks.saveModelMetadata).toHaveBeenCalled()
    expect(model.value).toEqual(saved)
    expect(modelDirty.value).toBe(false)
    expect(modelInitialName.value).toBe("Renamed")
    expect(mocks.batchSave).not.toHaveBeenCalled()
    expect(mocks.saveNodes).not.toHaveBeenCalled()
  })

  it("stores conflict list on batch 409", async () => {
    const conflicts = [{ kind: "node", id: "n-1", serverUpdatedAt: null, clientBaseUpdatedAt: null }]
    mocks.hasBatchChanges.mockReturnValue(true)
    mocks.batchSave.mockResolvedValue({
      success: false,
      error: { status: 409, message: "Conflict", details: { any: "payload" } },
    })
    mocks.parseBatchSaveConflictDetails.mockReturnValue(conflicts)

    const batchSaveConflict = ref<{
      kind: string
      id: string
      serverUpdatedAt: string | null
      clientBaseUpdatedAt: string | null
    }[] | null>(null)
    const scheduleSaveErrorClear = vi.fn()

    const result = await executeModelEditorSave({
      model: ref<ModelData | null>({
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null,
      }),
      modelDirty: ref(false),
      modelInitialName: ref("Model"),
      modelCatalog: ref<ModelData[]>([]),
      state: ref(createState()),
      pendingForceBatch: ref(false),
      batchSaveConflict,
      saveError: ref<string | null>(null),
      onProgress: vi.fn(),
      scheduleSaveErrorClear,
    })

    expect(result).toBe(false)
    expect(batchSaveConflict.value).toEqual(conflicts)
    expect(scheduleSaveErrorClear).not.toHaveBeenCalled()
    expect(mocks.saveNodes).not.toHaveBeenCalled()
  })

  it("falls back to legacy entity pipeline only when dirty state is missing from the batch request", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    mocks.hasBatchChanges.mockReturnValue(false)
    const state = ref(createState())
    const dirtyNode = state.value.nodes[0]
    if (!dirtyNode) throw new Error("expected node")
    dirtyNode._isDirty = true

    const result = await executeModelEditorSave({
      model: ref<ModelData | null>({
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null,
      }),
      modelDirty: ref(false),
      modelInitialName: ref("Model"),
      modelCatalog: ref<ModelData[]>([]),
      state,
      pendingForceBatch: ref(false),
      batchSaveConflict: ref(null),
      saveError: ref<string | null>(null),
      onProgress: vi.fn(),
      scheduleSaveErrorClear: vi.fn(),
    })

    expect(result).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("falling back to legacy save pipeline")
    )
    expect(mocks.saveNodes).toHaveBeenCalled()
    expect(mocks.remapNodeIds).toHaveBeenCalled()
    expect(mocks.saveLinks).toHaveBeenCalled()
    expect(mocks.saveDiagrams).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

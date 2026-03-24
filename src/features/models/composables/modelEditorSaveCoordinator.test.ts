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
  hasBatchChanges: vi.fn(),
  isValidBatchResponse: vi.fn(),
  parseBatchSaveConflictDetails: vi.fn(),
  refreshBatchSavedEntityTimestamps: vi.fn(),
  remapNodeIds: vi.fn(),
  saveDiagrams: vi.fn(),
  saveLinks: vi.fn(),
  saveModelMetadata: vi.fn(),
  saveNodes: vi.fn(),
}))

vi.mock("../utils/sanitizeDiagramInstances", () => ({
  applyDiagramGarbageSanitizeToState: mocks.applyDiagramGarbageSanitizeToState,
}))

vi.mock("./useModelBatchSave", () => ({
  applyBatchRemapping: mocks.applyBatchRemapping,
  batchSave: mocks.batchSave,
  buildBatchSaveRequest: mocks.buildBatchSaveRequest,
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

  it("runs fallback save pipeline and removes deleted entities", async () => {
    const state = ref(createState())
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
    expect(mocks.applyDiagramGarbageSanitizeToState).toHaveBeenCalled()
    expect(mocks.buildBatchSaveRequest).toHaveBeenCalled()
    expect(mocks.saveNodes).toHaveBeenCalled()
    expect(mocks.remapNodeIds).toHaveBeenCalled()
    expect(mocks.saveLinks).toHaveBeenCalled()
    expect(mocks.saveDiagrams).toHaveBeenCalled()
    expect(pendingForceBatch.value).toBe(false)
    expect(state.value.nodes.map(n => n.id)).toEqual(["n-1"])
    expect(state.value.links.map(l => l.id)).toEqual(["l-1"])
    expect(state.value.diagrams.map(d => d.id)).toEqual(["d-1"])
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
})

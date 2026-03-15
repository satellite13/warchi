import { effectScope } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseDiagramAttrs, parseNodeAttrs } from "../modelAttrs"
import type { ModelData } from "../../../types/entities"
import { useModelEditor } from "./useModelEditor"

const { apiGetMock, apiPostMock, apiPutMock, apiDeleteMock, routerPushMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPutMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  routerPushMock: vi.fn()
}))

vi.mock("../../../composables/useApi", () => ({
  apiGet: apiGetMock,
  apiPost: apiPostMock,
  apiPut: apiPutMock,
  apiDelete: apiDeleteMock
}))

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "model-1" } }),
  useRouter: () => ({ push: routerPushMock })
}))

describe("useModelEditor save order", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    apiGetMock.mockResolvedValue({ success: true, data: { content: [] } })
    apiPostMock.mockResolvedValue({ success: true, data: { id: "created-id" } })
    apiPutMock.mockImplementation(async (path: string) => {
      if (path === "/nodes/node-child") {
        return {
          success: true,
          data: {
            id: "node-child",
            name: "Child",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            attrs: null
          }
        }
      }
      return { success: true, data: {} }
    })
    apiDeleteMock.mockResolvedValue({ success: true, data: undefined })
  })

  it("updates moved node before deleting old folder", async () => {
    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      const model: ModelData = {
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null
      }
      editor.model.value = model
      editor.state.value = {
        modelId: "model-1",
        ownerId: "owner-1",
        nodes: [
          {
            id: "node-folder",
            name: "Folder",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-folder",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null),
            _isDeleted: true,
            _isDirty: true
          },
          {
            id: "node-child",
            name: "Child",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null),
            _isDirty: true
          }
        ],
        links: [],
        diagrams: [],
        notations: [],
        nodeTypes: [],
        linkTypes: [],
        components: [],
        relations: [],
        relationRules: []
      }

      saveChanges = editor.saveChanges
      stopScope = () => scope.stop()
    })

    const result = await saveChanges!()
    stopScope!()

    expect(result).toBe(true)
    expect(apiPutMock).toHaveBeenCalledWith(
      "/nodes/node-child",
      expect.objectContaining({
        parentNodeId: null
      })
    )
    expect(apiDeleteMock).toHaveBeenCalledWith("/nodes/node-folder")

    const putOrder = apiPutMock.mock.invocationCallOrder[0] ?? 0
    const deleteOrder = apiDeleteMock.mock.invocationCallOrder[0] ?? 0
    expect(putOrder).toBeLessThan(deleteOrder)
  })

  it("updates diagram versions from latest to oldest", async () => {
    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      const model: ModelData = {
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null
      }
      editor.model.value = model
      editor.state.value = {
        modelId: "model-1",
        ownerId: "owner-1",
        nodes: [],
        links: [],
        diagrams: [
          {
            id: "diagram-v1",
            name: "Architecture",
            version: "1.0.0",
            ownerId: "owner-1",
            modelId: "model-1",
            nodeId: "node-1",
            notationId: "notation-1",
            createdAt: null,
            updatedAt: null,
            parsedAttrs: parseDiagramAttrs(null),
            _isDirty: true
          },
          {
            id: "diagram-v2",
            name: "Architecture",
            version: "1.1.0",
            ownerId: "owner-1",
            modelId: "model-1",
            nodeId: "node-1",
            notationId: "notation-1",
            createdAt: null,
            updatedAt: null,
            parsedAttrs: parseDiagramAttrs(null),
            _isDirty: true
          }
        ],
        notations: [],
        nodeTypes: [],
        linkTypes: [],
        components: [],
        relations: [],
        relationRules: []
      }

      saveChanges = editor.saveChanges
      stopScope = () => scope.stop()
    })

    const result = await saveChanges!()
    stopScope!()

    expect(result).toBe(true)
    const firstPath = apiPutMock.mock.calls[0]?.[0]
    const secondPath = apiPutMock.mock.calls[1]?.[0]
    expect(firstPath).toBe("/diagrams/diagram-v2")
    expect(secondPath).toBe("/diagrams/diagram-v1")
  })
})

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

describe("useModelEditor — golden save contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetMock.mockResolvedValue({ success: true, data: { content: [] } })
    apiPostMock.mockResolvedValue({ success: true, data: { id: "created-id" } })
    apiPutMock.mockResolvedValue({ success: true, data: {} })
    apiDeleteMock.mockResolvedValue({ success: true, data: undefined })
  })

  it("saveNodes creates in topological order", async () => {
    apiPostMock.mockImplementation(async (_path: string, body: Record<string, unknown>) => ({
      success: true,
      data: {
        id:
          body.name === "Parent"
            ? "server-parent"
            : body.name === "Child"
              ? "server-child"
              : "server-grandchild",
        parentNodeId: body.parentNodeId ?? null
      }
    }))

    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      editor.model.value = {
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null
      }
      editor.state.value = {
        modelId: "model-1",
        ownerId: "owner-1",
        nodes: [
          {
            id: "temp-parent",
            name: "Parent",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null),
            _isNew: true
          },
          {
            id: "temp-child",
            name: "Child",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: "temp-parent",
            parsedAttrs: parseNodeAttrs(null),
            _isNew: true
          },
          {
            id: "temp-grandchild",
            name: "Grandchild",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: "temp-child",
            parsedAttrs: parseNodeAttrs(null),
            _isNew: true
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

    const nodePostCalls = apiPostMock.mock.calls.filter(
      (call: unknown[]) => call[0] === "/nodes"
    )
    expect(nodePostCalls).toHaveLength(3)
    expect(nodePostCalls[0]?.[1]).toEqual(
      expect.objectContaining({ name: "Parent", parentNodeId: null })
    )
    expect(nodePostCalls[1]?.[1]).toEqual(
      expect.objectContaining({ name: "Child", parentNodeId: "server-parent" })
    )
    expect(nodePostCalls[2]?.[1]).toEqual(
      expect.objectContaining({ name: "Grandchild", parentNodeId: "server-child" })
    )
  })

  it("remapNodeIds updates links and diagram instances", async () => {
    apiPostMock.mockImplementation(async (path: string) => {
      if (path === "/nodes")
        return { success: true, data: { id: "server-node-1", parentNodeId: null } }
      return { success: true, data: { id: "created-id" } }
    })

    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      editor.model.value = {
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null
      }
      editor.state.value = {
        modelId: "model-1",
        ownerId: "owner-1",
        nodes: [
          {
            id: "temp-node-1",
            name: "New Node",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null),
            _isNew: true
          }
        ],
        links: [
          {
            id: "link-1",
            sourceId: "temp-node-1",
            targetId: "existing-node",
            modelId: "model-1",
            ownerId: "owner-1",
            linkTypeId: "lt-1",
            parsedAttrs: { notationRelations: {}, relationProperties: {} },
            _isDirty: true
          }
        ],
        diagrams: [
          {
            id: "diagram-1",
            name: "Diagram",
            version: "1.0.0",
            ownerId: "owner-1",
            modelId: "model-1",
            notationId: "notation-1",
            nodeId: null,
            createdAt: null,
            updatedAt: null,
            parsedAttrs: {
              instances: {
                nodes: [{ id: "inst-1", modelNodeId: "temp-node-1", x: 0, y: 0 }],
                edges: []
              }
            },
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

    await saveChanges!()
    stopScope!()

    expect(apiPutMock.mock.calls[0]?.[0]).toBe("/links/link-1")
    expect(apiPutMock.mock.calls[0]?.[1]?.sourceId).toBe("server-node-1")

    expect(apiPutMock.mock.calls[1]?.[0]).toBe("/diagrams/diagram-1")
    const diagramAttrs = JSON.parse(apiPutMock.mock.calls[1]?.[1]?.attrs)
    expect(diagramAttrs.instances.nodes[0].modelNodeId).toBe("server-node-1")
  })

  it("saveLinks remaps edge IDs in diagrams", async () => {
    apiPostMock.mockImplementation(async (path: string) => {
      if (path === "/links")
        return { success: true, data: { id: "server-link-1" } }
      return { success: true, data: { id: "created-id" } }
    })

    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      editor.model.value = {
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null
      }
      editor.state.value = {
        modelId: "model-1",
        ownerId: "owner-1",
        nodes: [],
        links: [
          {
            id: "temp-link-1",
            sourceId: "node-a",
            targetId: "node-b",
            modelId: "model-1",
            ownerId: "owner-1",
            linkTypeId: "lt-1",
            parsedAttrs: { notationRelations: {}, relationProperties: {} },
            _isNew: true
          }
        ],
        diagrams: [
          {
            id: "diagram-1",
            name: "Diagram",
            version: "1.0.0",
            ownerId: "owner-1",
            modelId: "model-1",
            notationId: "notation-1",
            nodeId: null,
            createdAt: null,
            updatedAt: null,
            parsedAttrs: {
              instances: {
                nodes: [],
                edges: [
                  {
                    id: "edge-1",
                    modelLinkId: "temp-link-1",
                    sourceInstanceId: "inst-src",
                    targetInstanceId: "inst-tgt"
                  }
                ]
              }
            },
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

    await saveChanges!()
    stopScope!()

    expect(apiPutMock.mock.calls[0]?.[0]).toBe("/diagrams/diagram-1")
    const attrs = JSON.parse(apiPutMock.mock.calls[0]?.[1]?.attrs)
    expect(attrs.instances.edges[0].modelLinkId).toBe("server-link-1")
  })

  it("save order: nodes → links → diagrams", async () => {
    apiPostMock.mockImplementation(async (path: string) => {
      if (path === "/nodes")
        return { success: true, data: { id: "server-node", parentNodeId: null } }
      if (path === "/links")
        return { success: true, data: { id: "server-link" } }
      return { success: true, data: { id: "created-id" } }
    })

    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      editor.model.value = {
        id: "model-1",
        name: "Model",
        version: "1.0.0",
        ownerId: "owner-1",
        attrs: null
      }
      editor.state.value = {
        modelId: "model-1",
        ownerId: "owner-1",
        nodes: [
          {
            id: "temp-node",
            name: "Node",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null),
            _isNew: true
          }
        ],
        links: [
          {
            id: "temp-link",
            sourceId: "existing-1",
            targetId: "existing-2",
            modelId: "model-1",
            ownerId: "owner-1",
            linkTypeId: "lt-1",
            parsedAttrs: { notationRelations: {}, relationProperties: {} },
            _isNew: true
          }
        ],
        diagrams: [
          {
            id: "diagram-1",
            name: "Diagram",
            version: "1.0.0",
            ownerId: "owner-1",
            modelId: "model-1",
            notationId: "notation-1",
            nodeId: null,
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

    const nodeCall = apiPostMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/nodes"
    )
    const linkCall = apiPostMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/links"
    )
    expect(nodeCall).toBeDefined()
    expect(linkCall).toBeDefined()
    expect(apiPutMock.mock.calls[0]?.[0]).toBe("/diagrams/diagram-1")

    const nodeIdx = apiPostMock.mock.calls.indexOf(nodeCall!)
    const linkIdx = apiPostMock.mock.calls.indexOf(linkCall!)
    const nodeOrder = apiPostMock.mock.invocationCallOrder[nodeIdx] ?? 0
    const linkOrder = apiPostMock.mock.invocationCallOrder[linkIdx] ?? 0
    const diagramOrder = apiPutMock.mock.invocationCallOrder[0] ?? 0

    expect(nodeOrder).toBeLessThan(linkOrder)
    expect(linkOrder).toBeLessThan(diagramOrder)
  })
})

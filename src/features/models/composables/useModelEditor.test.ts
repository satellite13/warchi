import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { effectScope } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from "../modelAttrs"
import type { NodeResponse } from "../../../types/api"
import type { ModelData } from "../../../types/entities"
import type { ModelEditorState } from "../types"
import { useModelEditor } from "./useModelEditor"

const {
  apiGetMock,
  apiPostMock,
  apiPutMock,
  apiDeleteMock,
  routerPushMock,
  loadModelEditorShellMock,
  loadModelEditorCatalogMock
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPutMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  routerPushMock: vi.fn(),
  loadModelEditorShellMock: vi.fn(),
  loadModelEditorCatalogMock: vi.fn()
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

vi.mock("./modelEditorLoadModel", () => ({
  loadModelEditorShell: loadModelEditorShellMock,
  loadModelEditorCatalog: loadModelEditorCatalogMock,
  loadModelEditorLinks: vi.fn()
}))

const batchSavePath = "/models/model-1/batch-save"

function setupApiGetForBatchTimestampRefresh(): void {
  apiGetMock.mockImplementation(async (path: string) => {
    const p = String(path)
    const nodeM = /^\/nodes\/([^/?]+)$/.exec(p)
    if (nodeM) {
      return {
        success: true,
        data: {
          id: nodeM[1],
          name: "n",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeTypeId: "type-1",
          parentNodeId: null,
          attrs: null,
          updatedAt: "2099-01-01T00:00:00.000Z"
        }
      }
    }
    const linkM = /^\/links\/([^/?]+)$/.exec(p)
    if (linkM) {
      return {
        success: true,
        data: {
          id: linkM[1],
          sourceId: "a",
          targetId: "b",
          modelId: "model-1",
          ownerId: "owner-1",
          linkTypeId: "lt-1",
          attrs: null,
          updatedAt: "2099-01-01T00:00:00.000Z"
        }
      }
    }
    const diagM = /^\/diagrams\/([^/?]+)$/.exec(p)
    if (diagM) {
      return {
        success: true,
        data: {
          id: diagM[1],
          name: "D",
          version: "1.0.0",
          notationId: "notation-1",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeId: null,
          attrs: "{}",
          updatedAt: "2099-01-01T00:00:00.000Z"
        }
      }
    }
    return { success: true, data: { content: [] } }
  })
}

describe("useModelEditor save order", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    setupApiGetForBatchTimestampRefresh()
    apiPostMock.mockImplementation(async (path: string) => {
      if (String(path) === batchSavePath) {
        return {
          success: true,
          data: { nodeIdMap: {}, linkIdMap: {}, diagramIdMap: {} }
        }
      }
      return { success: true, data: { id: "created-id" } }
    })
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
    let traceabilityRevision: { value: number } | null = null
    let revisionBeforeSave = 0
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
      traceabilityRevision = editor.traceabilityDiagramRevision
      revisionBeforeSave = editor.traceabilityDiagramRevision.value
      stopScope = () => scope.stop()
    })

    const result = await saveChanges!()
    stopScope!()

    expect(result).toBe(true)
    expect(traceabilityRevision!.value).toBeGreaterThan(revisionBeforeSave)
    const batchCall = apiPostMock.mock.calls.find((c: unknown[]) => c[0] === batchSavePath)
    expect(batchCall).toBeDefined()
    const body = batchCall![1] as {
      nodes: { update: { id: string; parentNodeId: unknown }[]; delete: string[] }
    }
    expect(body.nodes.update.some(u => u.id === "node-child" && u.parentNodeId === null)).toBe(true)
    expect(body.nodes.delete).toContain("node-folder")
  })

  it("batch diagram updates follow diagrams array order in state", async () => {
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
    const batchCall = apiPostMock.mock.calls.find((c: unknown[]) => c[0] === batchSavePath)
    expect(batchCall).toBeDefined()
    const body = batchCall![1] as { diagrams: { update: { id: string }[] } }
    // Порядок update в batch — как в `state.diagrams` (без сортировки по версии).
    expect(body.diagrams.update.map(d => d.id)).toEqual(["diagram-v1", "diagram-v2"])
  })
})

describe("useModelEditor — golden save contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupApiGetForBatchTimestampRefresh()
    apiPostMock.mockImplementation(async (path: string) => {
      if (String(path) === batchSavePath) {
        return {
          success: true,
          data: {
            nodeIdMap: {
              "temp-parent": "server-parent",
              "temp-child": "server-child",
              "temp-grandchild": "server-grandchild"
            },
            linkIdMap: {},
            diagramIdMap: {}
          }
        }
      }
      return { success: true, data: { id: "created-id" } }
    })
    apiPutMock.mockResolvedValue({ success: true, data: {} })
    apiDeleteMock.mockResolvedValue({ success: true, data: undefined })
  })

  it("saveNodes creates in topological order", async () => {

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

    const batchCall = apiPostMock.mock.calls.find((c: unknown[]) => c[0] === batchSavePath)
    expect(batchCall).toBeDefined()
    const creates = (batchCall![1] as { nodes: { create: Record<string, unknown>[] } }).nodes.create
    expect(creates).toHaveLength(3)
    expect(creates[0]).toEqual(
      expect.objectContaining({ name: "Parent", parentNodeId: null })
    )
    expect(creates[1]).toEqual(
      expect.objectContaining({ name: "Child", parentNodeId: "temp-parent" })
    )
    expect(creates[2]).toEqual(
      expect.objectContaining({ name: "Grandchild", parentNodeId: "temp-child" })
    )
  })

  it("remapNodeIds updates links and diagram instances", async () => {
    apiPostMock.mockImplementation(async (path: string) => {
      if (String(path) === batchSavePath) {
        return {
          success: true,
          data: {
            nodeIdMap: { "temp-node-1": "server-node-1" },
            linkIdMap: {},
            diagramIdMap: {}
          }
        }
      }
      return { success: true, data: { id: "created-id" } }
    })

    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null
    let editorRef: ReturnType<typeof useModelEditor> | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      editorRef = editor
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
            parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
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

    const batchCall = apiPostMock.mock.calls.find((c: unknown[]) => c[0] === batchSavePath)
    expect(batchCall).toBeDefined()
    const linkUpd = (batchCall![1] as { links: { update: { sourceId: string }[] } }).links.update[0]
    expect(linkUpd?.sourceId).toBe("temp-node-1")

    const d0 = editorRef!.state.value.diagrams[0]
    expect(d0?.parsedAttrs.instances.nodes[0]?.modelNodeId).toBe("server-node-1")

    stopScope!()
  })

  it("saveLinks remaps edge IDs in diagrams", async () => {
    apiPostMock.mockImplementation(async (path: string) => {
      if (String(path) === batchSavePath) {
        return {
          success: true,
          data: {
            nodeIdMap: {},
            linkIdMap: { "temp-link-1": "server-link-1" },
            diagramIdMap: {}
          }
        }
      }
      return { success: true, data: { id: "created-id" } }
    })

    let saveChanges: (() => Promise<boolean>) | null = null
    let stopScope: (() => void) | null = null
    let editorRef: ReturnType<typeof useModelEditor> | null = null

    const scope = effectScope()
    scope.run(() => {
      const editor = useModelEditor()
      editorRef = editor
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
            id: "node-a",
            name: "A",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null)
          },
          {
            id: "node-b",
            name: "B",
            modelId: "model-1",
            ownerId: "owner-1",
            nodeTypeId: "type-1",
            parentNodeId: null,
            parsedAttrs: parseNodeAttrs(null)
          }
        ],
        links: [
          {
            id: "temp-link-1",
            sourceId: "node-a",
            targetId: "node-b",
            modelId: "model-1",
            ownerId: "owner-1",
            linkTypeId: "lt-1",
            parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
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
                nodes: [
                  { id: "inst-src", modelNodeId: "node-a", x: 0, y: 0 },
                  { id: "inst-tgt", modelNodeId: "node-b", x: 100, y: 0 }
                ],
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

    const edge = editorRef!.state.value.diagrams[0]?.parsedAttrs.instances.edges[0]
    expect(edge?.modelLinkId).toBe("server-link-1")

    stopScope!()
  })

  it("save order: nodes → links → diagrams", async () => {
    apiPostMock.mockImplementation(async (path: string) => {
      if (String(path) === batchSavePath) {
        return {
          success: true,
          data: {
            nodeIdMap: { "temp-node": "server-node" },
            linkIdMap: { "temp-link": "server-link" },
            diagramIdMap: {}
          }
        }
      }
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
            parsedAttrs: { notationRelations: {}, relationProperties: {}, typeProperties: {} },
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

    const batchCall = apiPostMock.mock.calls.find((c: unknown[]) => c[0] === batchSavePath)
    expect(batchCall).toBeDefined()
    const body = batchCall![1] as {
      nodes: { create: unknown[] }
      links: { create: unknown[] }
      diagrams: { update: unknown[] }
    }
    expect(body.nodes.create.length).toBeGreaterThan(0)
    expect(body.links.create.length).toBeGreaterThan(0)
    expect(body.diagrams.update.length).toBeGreaterThan(0)
  })
})

function editorState(overrides: Partial<ModelEditorState> = {}): ModelEditorState {
  return {
    modelId: "model-1",
    ownerId: "owner-1",
    nodes: [],
    links: [],
    diagrams: [],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
    ...overrides
  }
}

function shellWithBoundNode() {
  const node: NodeResponse = {
    id: "root-child",
    name: "Root child",
    modelId: "model-1",
    ownerId: "owner-1",
    nodeTypeId: "nt-1",
    parentNodeId: null,
    attrs: JSON.stringify({
      notationComponents: { "not-1": { componentId: "comp-1" } }
    })
  }
  return {
    model: {
      id: "model-1",
      name: "Model",
      version: "1.0.0",
      ownerId: "owner-1"
    },
    modelCatalog: [],
    state: editorState({
      nodes: [
        {
          id: "root-child",
          name: "Root child",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeTypeId: "nt-1",
          parentNodeId: null,
          parsedAttrs: parseNodeAttrs(node.attrs ?? null)
        }
      ]
    }),
    loadedNotationIds: ["not-1"],
    rootChildrenPage: {
      content: [node],
      page: { number: 0, size: 500, totalElements: 1, totalPages: 1 }
    }
  }
}

const boundNodeCatalog = {
  modelCatalog: [],
  notations: [],
  nodeTypes: [
    {
      id: "nt-1",
      name: "Application",
      ownerId: "owner-1",
      attrs: JSON.stringify({
        customProperties: [
          { id: "p0", name: "tier", type: "string", required: false, defaultValue: "app" }
        ]
      })
    }
  ],
  linkTypes: [],
  components: [
    {
      id: "comp-1",
      name: "C",
      version: "1.0.0",
      notationId: "not-1",
      ownerId: "owner-1",
      nodeTypeId: "nt-1",
      attrs: JSON.stringify({
        customProperties: [
          { id: "p1", name: "status", type: "string", required: false, defaultValue: "draft" }
        ]
      })
    }
  ],
  relations: [],
  relationRules: []
}

describe("useModelEditor defaults and unsaved delta", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupApiGetForBatchTimestampRefresh()
    loadModelEditorShellMock.mockResolvedValue(shellWithBoundNode())
    loadModelEditorCatalogMock.mockResolvedValue(boundNodeCatalog)
  })

  it("does not apply defaults globally on normal open", async () => {
    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    await editor.loadModel()
    await editor.whenCatalogReady()

    const row = editor.state.value.nodes.find(item => item.id === "root-child")
    expect(row?.parsedAttrs.typeProperties).toEqual({})
    expect(row?.parsedAttrs.componentProperties).toEqual({ "not-1": { "comp-1": {} } })
    expect(row?._isDirty).toBeUndefined()

    const here = dirname(fileURLToPath(import.meta.url))
    const editorSource = readFileSync(resolve(here, "useModelEditor.ts"), "utf8")
    const viewSource = readFileSync(resolve(here, "../ModelEditor.vue"), "utf8")
    expect(editorSource).not.toMatch(/scheduleSyncDefaultsOnLoad|syncDefaultsOnLoadChunked/)
    expect(viewSource).not.toMatch(/scheduleSyncDefaultsOnLoad|syncDefaultsOnLoadChunked/)
    scope.stop()
  })

  it("keeps the granular catalog gate closed after a failed load and opens it on retry success", async () => {
    loadModelEditorCatalogMock
      .mockRejectedValueOnce(new Error("catalog offline"))
      .mockResolvedValueOnce(boundNodeCatalog)
    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!

    await editor.loadModel()
    await editor.whenCatalogReady()

    expect(editor.initialSnapshotReady.value).toBe(true)
    expect(editor.catalogReady.value).toBe(false)
    expect(editor.catalogLoadWarning.value).toContain("catalog offline")

    await editor.retryCatalogLoad()

    expect(editor.catalogReady.value).toBe(true)
    expect(editor.catalogLoadWarning.value).toBeNull()
    scope.stop()
  })

  it("treats only local materialized dirty/new/deleted rows as unsaved changes", () => {
    const scope = effectScope()
    const editor = scope.run(() => useModelEditor())!
    editor.model.value = {
      id: "model-1",
      name: "Model",
      version: "1.0.0",
      ownerId: "owner-1",
      attrs: null
    }
    editor.state.value = editorState({
      nodes: [
        {
          id: "loaded-clean",
          name: "Clean",
          modelId: "model-1",
          ownerId: "owner-1",
          nodeTypeId: "nt-1",
          parentNodeId: null,
          parsedAttrs: parseNodeAttrs(null)
        }
      ],
      links: [
        {
          id: "loaded-link",
          sourceId: "loaded-clean",
          targetId: "other",
          modelId: "model-1",
          ownerId: "owner-1",
          linkTypeId: "lt-1",
          parsedAttrs: parseLinkAttrs(null)
        }
      ]
    })

    expect(editor.hasUnsavedChanges.value).toBe(false)

    editor.state.value.nodes[0]!._isDirty = true
    expect(editor.hasUnsavedChanges.value).toBe(true)

    editor.state.value.nodes[0]!._isDirty = false
    editor.state.value.links.push({
      id: "local-new",
      sourceId: "loaded-clean",
      targetId: "other",
      modelId: "model-1",
      ownerId: "owner-1",
      linkTypeId: "lt-1",
      parsedAttrs: parseLinkAttrs(null),
      _isNew: true
    })
    expect(editor.hasUnsavedChanges.value).toBe(true)

    editor.state.value.links = editor.state.value.links.filter(link => link.id !== "local-new")
    editor.state.value.nodes[0]!._isDeleted = true
    expect(editor.hasUnsavedChanges.value).toBe(true)
    scope.stop()
  })
})

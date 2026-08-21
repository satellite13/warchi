import { computed, ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from "../modelAttrs"
import type { ModelData } from "../../../types/entities"
import type { ModelEditorState } from "../types"
import { toEditorLink, toEditorNode } from './modelEditorMappers'
import { useModelEditorStateHelpers } from "./useModelEditorStateHelpers"

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
        id: "n-new",
        name: "New Node",
        modelId: "model-1",
        ownerId: "owner-1",
        nodeTypeId: "type-1",
        parentNodeId: null,
        parsedAttrs: parseNodeAttrs(null),
        _isNew: true,
      },
    ],
    links: [
      {
        id: "l-1",
        sourceId: "n-1",
        targetId: "n-2",
        modelId: "model-1",
        ownerId: "owner-1",
        linkTypeId: "lt-1",
        parsedAttrs: parseLinkAttrs(null),
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
    ],
    notations: [],
    nodeTypes: [],
    linkTypes: [],
    components: [],
    relations: [],
    relationRules: [],
  }
}

describe("useModelEditorStateHelpers", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it("marks existing entities dirty but does not mark new node", () => {
    const state = ref(createState())
    const model = ref<ModelData | null>({
      id: "model-1",
      name: "Model",
      version: "1.0.0",
      ownerId: "owner-1",
      attrs: null,
    })
    const modelDirty = ref(false)
    const modelInitialName = ref("Model")
    const modelCatalog = ref<ModelData[]>([])
    const saveError = ref<string | null>(null)

    const helpers = useModelEditorStateHelpers({
      state,
      model,
      modelDirty,
      modelInitialName,
      modelCatalog,
      saveError,
    })

    helpers.markNodeDirty("n-1")
    helpers.markNodeDirty("n-new")
    helpers.markLinkDirty("l-1")
    helpers.markDiagramDirty("d-1")
    helpers.markModelDirty()

    expect(state.value.nodes.find(n => n.id === "n-1")?._isDirty).toBe(true)
    expect(state.value.nodes.find(n => n.id === "n-new")?._isDirty).toBeUndefined()
    expect(state.value.links[0]?._isDirty).toBe(true)
    expect(state.value.diagrams[0]?._isDirty).toBe(true)
    expect(modelDirty.value).toBe(true)
  })

  it('replaces high-volume entities when marking them dirty', () => {
    const initialNode = toEditorNode({
      id: 'n-raw',
      name: 'Raw node',
      modelId: 'model-1',
      ownerId: 'owner-1',
      nodeTypeId: 'type-1',
      parentNodeId: null,
      attrs: null,
    })
    const initialLink = toEditorLink({
      id: 'l-raw',
      sourceId: 'n-raw',
      targetId: 'n-2',
      modelId: 'model-1',
      ownerId: 'owner-1',
      linkTypeId: 'lt-1',
      attrs: null,
    })
    const state = ref({
      ...createState(),
      nodes: [initialNode],
      links: [initialLink],
    })
    const model = ref<ModelData | null>({
      id: 'model-1',
      name: 'Model',
      version: '1.0.0',
      ownerId: 'owner-1',
      attrs: null,
    })
    const modelDirty = ref(false)
    const helpers = useModelEditorStateHelpers({
      state,
      model,
      modelDirty,
      modelInitialName: ref('Model'),
      modelCatalog: ref([]),
      saveError: ref(null),
    })
    const hasDirtyEntities = computed(
      () =>
        state.value.nodes.some(node => node._isDirty) ||
        state.value.links.some(link => link._isDirty)
    )

    expect(hasDirtyEntities.value).toBe(false)
    helpers.markNodeDirty('n-raw')
    helpers.markLinkDirty('l-raw')

    expect(hasDirtyEntities.value).toBe(true)
    expect(state.value.nodes[0]).not.toBe(initialNode)
    expect(state.value.links[0]).not.toBe(initialLink)
  })

  it("validates and renames model with conflict checks", () => {
    const state = ref(createState())
    const model = ref<ModelData | null>({
      id: "model-1",
      name: "Model",
      version: "1.0.0",
      ownerId: "owner-1",
      attrs: null,
    })
    const modelDirty = ref(false)
    const modelInitialName = ref("Model")
    const modelCatalog = ref<ModelData[]>([
      { id: "model-2", name: "Taken", version: "1.0.0", ownerId: "owner-1", attrs: null },
    ])
    const saveError = ref<string | null>(null)

    const helpers = useModelEditorStateHelpers({
      state,
      model,
      modelDirty,
      modelInitialName,
      modelCatalog,
      saveError,
    })

    expect(helpers.renameModel("")).toContain("не может быть пустым")
    expect(helpers.renameModel("Taken")).toContain("уже существует")
    expect(helpers.renameModel("Model")).toBeNull()
    expect(helpers.renameModel("Renamed")).toBeNull()
    expect(model.value?.name).toBe("Renamed")
    expect(modelDirty.value).toBe(true)
  })

  it("clears save error by timer and supports manual dispose", () => {
    vi.useFakeTimers()

    const state = ref(createState())
    const model = ref<ModelData | null>({
      id: "model-1",
      name: "Model",
      version: "1.0.0",
      ownerId: "owner-1",
      attrs: null,
    })
    const modelDirty = ref(false)
    const modelInitialName = ref("Model")
    const modelCatalog = ref<ModelData[]>([])
    const saveError = ref<string | null>("boom")

    const helpers = useModelEditorStateHelpers({
      state,
      model,
      modelDirty,
      modelInitialName,
      modelCatalog,
      saveError,
    })

    helpers.scheduleSaveErrorClear()
    vi.advanceTimersByTime(4999)
    expect(saveError.value).toBe("boom")
    vi.advanceTimersByTime(1)
    expect(saveError.value).toBeNull()

    saveError.value = "again"
    helpers.scheduleSaveErrorClear()
    helpers.disposeSaveErrorTimer()
    vi.advanceTimersByTime(5000)
    expect(saveError.value).toBe("again")
  })
})

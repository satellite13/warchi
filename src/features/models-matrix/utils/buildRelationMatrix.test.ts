import { describe, expect, it } from "vitest"
import type { EditorLink, EditorNode } from "@/features/models/types"
import type { ComponentResponse, LinkTypeResponse, RelationResponse } from "@/types/api"
import { buildRelationMatrix, relationMatrixCellKey } from "./buildRelationMatrix"
import { UNMAPPED_ENTITY_ID, type RelationMatrixFilters } from "../types"

const createNode = (id: string, name: string, nodeTypeId: string, componentId?: string): EditorNode => ({
  id,
  name,
  modelId: "m1",
  ownerId: "u1",
  nodeTypeId,
  parsedAttrs: {
    treeOrder: 0,
    notationComponents: componentId ? { n1: { componentId } } : {},
    componentProperties: {},
    typeProperties: {},
  },
})

const createLink = (id: string, sourceId: string, targetId: string, linkTypeId: string, relationId?: string): EditorLink => ({
  id,
  sourceId,
  targetId,
  modelId: "m1",
  ownerId: "u1",
  linkTypeId,
  parsedAttrs: {
    notationRelations: relationId ? { n1: { relationId } } : {},
    relationProperties: {},
  },
})

const nodeTypes = [
  { id: "service", name: "Service" },
  { id: "db", name: "Database" },
]

const linkTypes: LinkTypeResponse[] = [
  { id: "sync", name: "Sync", ownerId: "u1" },
  { id: "async", name: "Async", ownerId: "u1" },
]

const components: ComponentResponse[] = [
  { id: "c-service", notationId: "n1", nodeTypeId: "service", name: "AppComponent", version: "1.0.0", ownerId: "u1" },
  { id: "c-db", notationId: "n1", nodeTypeId: "db", name: "DbComponent", version: "1.0.0", ownerId: "u1" },
]

const relations: RelationResponse[] = [
  { id: "r-sync", notationId: "n1", linkTypeId: "sync", name: "SyncRelation", version: "1.0.0", ownerId: "u1" },
  { id: "r-async", notationId: "n1", linkTypeId: "async", name: "AsyncRelation", version: "1.0.0", ownerId: "u1" },
]

const baseFilters: RelationMatrixFilters = {
  notationId: null,
  selectedRowIds: [],
  selectedColumnIds: [],
  selectedRelationIds: ["sync", "async"],
  mappedOnly: false,
  heatmapEnabled: true,
  hideEmptyAxes: false,
}

describe("buildRelationMatrix", () => {
  it("aggregates links by node/link types when notation is not selected", () => {
    const matrix = buildRelationMatrix({
      filters: baseFilters,
      nodes: [
        createNode("n-service-1", "Service A", "service"),
        createNode("n-db-1", "Db A", "db"),
      ],
      links: [
        createLink("l1", "n-service-1", "n-db-1", "sync"),
        createLink("l2", "n-service-1", "n-db-1", "sync"),
      ],
      nodeTypes,
      linkTypes,
      components,
      relations,
      notations: [],
    })

    const cell = matrix.cells[relationMatrixCellKey("service", "db")]
    expect(matrix.mode).toBe("types")
    expect(cell?.total).toBe(2)
    expect(cell?.relationCounts.sync).toBe(2)
    expect(matrix.maxCellTotal).toBe(2)
  })

  it("uses notation bindings and keeps unmapped entries", () => {
    const matrix = buildRelationMatrix({
      filters: { ...baseFilters, notationId: "n1", selectedRelationIds: ["r-sync", "r-async", UNMAPPED_ENTITY_ID] },
      nodes: [
        createNode("n-service-1", "Service A", "service", "c-service"),
        createNode("n-db-1", "Db A", "db", "c-db"),
        createNode("n-db-2", "Db B", "db"),
      ],
      links: [
        createLink("l1", "n-service-1", "n-db-1", "sync", "r-sync"),
        createLink("l2", "n-service-1", "n-db-2", "sync"),
      ],
      nodeTypes,
      linkTypes,
      components,
      relations,
      notations: [],
      labels: {
        unmapped: "Unmapped",
        unknownRelation: "Unknown",
      },
    })

    expect(matrix.mode).toBe("notation")
    const mappedCell = matrix.cells[relationMatrixCellKey("c-service", "c-db")]
    expect(mappedCell?.total).toBe(1)

    const unmappedCell = matrix.cells[relationMatrixCellKey("c-service", UNMAPPED_ENTITY_ID)]
    expect(unmappedCell?.total).toBe(1)
    expect(unmappedCell?.hasUnmapped).toBe(true)
  })

  it("drops unmapped links when mappedOnly is enabled", () => {
    const matrix = buildRelationMatrix({
      filters: { ...baseFilters, notationId: "n1", mappedOnly: true, selectedRelationIds: ["r-sync", "r-async"] },
      nodes: [
        createNode("n-service-1", "Service A", "service", "c-service"),
        createNode("n-db-1", "Db A", "db", "c-db"),
        createNode("n-db-2", "Db B", "db"),
      ],
      links: [
        createLink("l1", "n-service-1", "n-db-1", "sync", "r-sync"),
        createLink("l2", "n-service-1", "n-db-2", "sync"),
      ],
      nodeTypes,
      linkTypes,
      components,
      relations,
      notations: [],
    })

    const mappedCell = matrix.cells[relationMatrixCellKey("c-service", "c-db")]
    const unmappedCell = matrix.cells[relationMatrixCellKey("c-service", UNMAPPED_ENTITY_ID)]
    expect(mappedCell?.total).toBe(1)
    expect(unmappedCell).toBeUndefined()
  })

  it("hides empty rows and columns when hideEmptyAxes is enabled", () => {
    const matrix = buildRelationMatrix({
      filters: {
        ...baseFilters,
        hideEmptyAxes: true,
        selectedRowIds: ["service", "db"],
        selectedColumnIds: ["service", "db"],
      },
      nodes: [
        createNode("n-service-1", "Service A", "service"),
        createNode("n-db-1", "Db A", "db"),
      ],
      links: [createLink("l1", "n-service-1", "n-db-1", "sync")],
      nodeTypes,
      linkTypes,
      components,
      relations,
      notations: [],
    })

    expect(matrix.rows.map(item => item.id)).toEqual(["service"])
    expect(matrix.columns.map(item => item.id)).toEqual(["db"])
  })
})


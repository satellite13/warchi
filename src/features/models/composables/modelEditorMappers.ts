import { markRaw, reactive } from 'vue'
import type { DiagramResponse, LinkResponse, NodeResponse } from "@/types/api"
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from "../modelAttrs"
import type { EditorDiagram, EditorLink, EditorNode } from "../types"
import {
  applyDefaultsToEditorLink,
  applyDefaultsToEditorNode,
  type EditorDefaultsCatalog,
} from "../utils/syncDefaultsOnLoad"

function materializeEditorEntity<T extends { parsedAttrs: object }>(entity: T): T {
  const materialized = reactive(entity) as T
  // Force the first nested proxy creation while mapInChunks can yield between batches.
  void materialized.parsedAttrs
  return materialized
}

function hasDefaultsCatalog(catalog: unknown): catalog is EditorDefaultsCatalog {
  return (
    typeof catalog === 'object' &&
    catalog !== null &&
    Array.isArray((catalog as Partial<EditorDefaultsCatalog>).nodeTypes) &&
    Array.isArray((catalog as Partial<EditorDefaultsCatalog>).linkTypes) &&
    Array.isArray((catalog as Partial<EditorDefaultsCatalog>).components) &&
    Array.isArray((catalog as Partial<EditorDefaultsCatalog>).relations)
  )
}

export const toEditorNode = (
  row: NodeResponse,
  catalog?: EditorDefaultsCatalog | null | number
): EditorNode => {
  const node = markRaw({
    ...row,
    parsedAttrs: parseNodeAttrs(row.attrs ?? null),
  })
  if (hasDefaultsCatalog(catalog)) applyDefaultsToEditorNode(node, catalog)
  return node
}

export const toEditorLink = (
  row: LinkResponse,
  catalog?: EditorDefaultsCatalog | null | number
): EditorLink => {
  const link = markRaw({
    ...row,
    parsedAttrs: parseLinkAttrs(row.attrs ?? null),
  })
  if (hasDefaultsCatalog(catalog)) applyDefaultsToEditorLink(link, catalog)
  return link
}

export const toEditorDiagram = (
  row: DiagramResponse,
  options?: { attrsPending?: boolean }
): EditorDiagram =>
  materializeEditorEntity({
    ...row,
    parsedAttrs: parseDiagramAttrs(row.attrs ?? null),
    _attrsPending: options?.attrsPending ?? row.attrs == null,
  })

/**
 * Live-sync list often omits attrs (includeAttrs=false). Keep already-hydrated
 * local parsedAttrs so opening a diagram is not wiped by the next poll.
 */
export const toEditorDiagramPreservingLocalAttrs = (
  row: DiagramResponse,
  previous: EditorDiagram[]
): EditorDiagram => {
  const prev = previous.find(item => item.id === row.id)
  if (row.attrs == null && prev && !prev._attrsPending) {
    return materializeEditorEntity({
      ...toEditorDiagram(row, { attrsPending: false }),
      parsedAttrs: prev.parsedAttrs,
      _attrsPending: false,
      _liveCanvasEpoch: prev._liveCanvasEpoch,
    })
  }
  return toEditorDiagram(row)
}

export const withoutDeleted = <T extends { _isDeleted?: boolean }>(rows: T[]): T[] =>
  rows.filter(row => !row._isDeleted)

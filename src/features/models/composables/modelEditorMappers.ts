import type { DiagramResponse, LinkResponse, NodeResponse } from "@/types/api"
import { parseDiagramAttrs, parseLinkAttrs, parseNodeAttrs } from "../modelAttrs"
import type { EditorDiagram, EditorLink, EditorNode } from "../types"

export const toEditorNode = (row: NodeResponse): EditorNode => ({
  ...row,
  parsedAttrs: parseNodeAttrs(row.attrs ?? null),
})

export const toEditorLink = (row: LinkResponse): EditorLink => ({
  ...row,
  parsedAttrs: parseLinkAttrs(row.attrs ?? null),
})

export const toEditorDiagram = (
  row: DiagramResponse,
  options?: { attrsPending?: boolean }
): EditorDiagram => ({
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
    return {
      ...toEditorDiagram(row, { attrsPending: false }),
      parsedAttrs: prev.parsedAttrs,
      _attrsPending: false,
    }
  }
  return toEditorDiagram(row)
}

export const withoutDeleted = <T extends { _isDeleted?: boolean }>(rows: T[]): T[] =>
  rows.filter(row => !row._isDeleted)

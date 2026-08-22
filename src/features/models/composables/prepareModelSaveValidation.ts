import i18n from '@/i18n'
import type { DiagramAttrs } from '../modelAttrs'
import type { EditorLink, EditorNode, ModelEditorState } from '../types'
import { validateRequiredCustomProperties } from '../utils/requiredCustomPropertiesValidation'

export type PrepareModelSaveValidationResult =
  | { ok: true }
  | { ok: false; error: string }

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export type ModelSaveValidationCandidates = {
  nodes: EditorNode[]
  links: EditorLink[]
}

const isChanged = (row: {
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}): boolean => Boolean((row._isNew || row._isDirty) && !row._isDeleted)

/**
 * Collect entities whose required custom properties may have changed in this save.
 * A changed diagram makes its displayed model entities candidates too, because
 * diagram-scoped custom properties are stored in its instance attrs.
 */
export function collectModelSaveValidationCandidates(
  state: ModelEditorState
): ModelSaveValidationCandidates {
  const nodesById = new Map(state.nodes.map(node => [node.id, node]))
  const linksById = new Map(state.links.map(link => [link.id, link]))
  const nodeCandidates = new Map(
    state.nodes.filter(isChanged).map(node => [node.id, node])
  )
  const linkCandidates = new Map(
    state.links.filter(isChanged).map(link => [link.id, link])
  )

  for (const diagram of state.diagrams) {
    if (!isChanged(diagram) || diagram._attrsPending) continue
    for (const instance of diagram.parsedAttrs.instances.nodes) {
      const node = nodesById.get(instance.modelNodeId)
      if (node && !node._isDeleted) nodeCandidates.set(node.id, node)
    }
    for (const edge of diagram.parsedAttrs.instances.edges) {
      const link = linksById.get(edge.modelLinkId)
      if (link && !link._isDeleted) linkCandidates.set(link.id, link)
    }
  }

  return {
    nodes: [...nodeCandidates.values()],
    links: [...linkCandidates.values()],
  }
}

export function prepareModelSaveValidation(options: {
  state: ModelEditorState
  activeDiagram: DiagramAttrs | null | undefined
  t?: TranslateFn
}): PrepareModelSaveValidationResult {
  const translate: TranslateFn =
    options.t ?? ((key, params) => String(i18n.global.t(key, params ?? {})))
  const candidates = collectModelSaveValidationCandidates(options.state)
  const issue = validateRequiredCustomProperties({
    state: options.state,
    activeDiagram: options.activeDiagram,
    nodes: candidates.nodes,
    links: candidates.links,
  })
  if (issue) {
    return {
      ok: false,
      error: translate(issue.key, issue.params),
    }
  }
  return { ok: true }
}

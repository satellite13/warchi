import { applyDefaultCustomPropertyValuesFromAttrs } from '@/domain/attrs/customPropertyValues'
import type { ModelEditorState } from '../types'

const CHUNK_SIZE = 200

function yieldToUi(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}

/**
 * Fill missing custom-property defaults from component/relation schemas.
 * Runs in chunks so the tree stays interactive on large models.
 * Does not mark entities dirty — defaults are derived from the notation, not user edits.
 */
export async function syncDefaultsOnLoadChunked(state: ModelEditorState): Promise<void> {
  const componentByKey = new Map(
    state.components.map(component => [`${component.notationId}:${component.id}`, component])
  )
  const relationByKey = new Map(
    state.relations.map(relation => [`${relation.notationId}:${relation.id}`, relation])
  )

  for (let i = 0; i < state.nodes.length; i += CHUNK_SIZE) {
    const slice = state.nodes.slice(i, i + CHUNK_SIZE)
    for (const node of slice) {
      if (node._isDeleted) continue
      for (const [notationId, binding] of Object.entries(node.parsedAttrs.notationComponents)) {
        const componentId = binding.componentId
        if (!componentId) continue
        if (!node.parsedAttrs.componentProperties[notationId]) {
          node.parsedAttrs.componentProperties[notationId] = {}
        }
        if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
          node.parsedAttrs.componentProperties[notationId][componentId] = {}
        }
        const component = componentByKey.get(`${notationId}:${componentId}`)
        if (!component) continue
        applyDefaultCustomPropertyValuesFromAttrs(
          node.parsedAttrs.componentProperties[notationId][componentId]!,
          component.attrs,
          { skipSystem: true },
        )
      }
    }
    if (i + CHUNK_SIZE < state.nodes.length) await yieldToUi()
  }

  for (let i = 0; i < state.links.length; i += CHUNK_SIZE) {
    const slice = state.links.slice(i, i + CHUNK_SIZE)
    for (const link of slice) {
      if (link._isDeleted) continue
      for (const [notationId, binding] of Object.entries(link.parsedAttrs.notationRelations)) {
        const relationId = binding.relationId
        if (!relationId) continue
        if (!link.parsedAttrs.relationProperties[notationId]) {
          link.parsedAttrs.relationProperties[notationId] = {}
        }
        if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
          link.parsedAttrs.relationProperties[notationId][relationId] = {}
        }
        const relation = relationByKey.get(`${notationId}:${relationId}`)
        if (!relation) continue
        applyDefaultCustomPropertyValuesFromAttrs(
          link.parsedAttrs.relationProperties[notationId][relationId]!,
          relation.attrs,
          { skipSystem: true },
        )
      }
    }
    if (i + CHUNK_SIZE < state.links.length) await yieldToUi()
  }
}

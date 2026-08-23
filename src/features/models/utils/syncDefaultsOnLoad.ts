import { applyDefaultCustomPropertyValuesFromAttrs } from '@/domain/attrs/customPropertyValues'
import type { EditorLink, EditorNode, ModelEditorState } from '../types'

export type EditorDefaultsCatalog = Pick<
  ModelEditorState,
  'nodeTypes' | 'linkTypes' | 'components' | 'relations'
>

type DefaultsIndexes = {
  nodeTypeById: Map<string, EditorDefaultsCatalog['nodeTypes'][number]>
  linkTypeById: Map<string, EditorDefaultsCatalog['linkTypes'][number]>
  componentByKey: Map<string, EditorDefaultsCatalog['components'][number]>
  relationByKey: Map<string, EditorDefaultsCatalog['relations'][number]>
}

export function createDefaultsIndexes(catalog: EditorDefaultsCatalog): DefaultsIndexes {
  return {
    nodeTypeById: new Map(catalog.nodeTypes.map(nodeType => [nodeType.id, nodeType])),
    linkTypeById: new Map(catalog.linkTypes.map(linkType => [linkType.id, linkType])),
    componentByKey: new Map(
      catalog.components.map(component => [`${component.notationId}:${component.id}`, component])
    ),
    relationByKey: new Map(
      catalog.relations.map(relation => [`${relation.notationId}:${relation.id}`, relation])
    ),
  }
}

/**
 * Fill missing custom-property defaults from component/relation/type schemas.
 * Does not mark the row dirty — defaults are derived from the notation, not user edits.
 */
export function applyDefaultsToEditorNode(
  node: EditorNode,
  catalog: EditorDefaultsCatalog,
  indexes = createDefaultsIndexes(catalog)
): void {
  if (node._isDeleted) return
  const nodeType = indexes.nodeTypeById.get(node.nodeTypeId)
  if (nodeType) {
    applyDefaultCustomPropertyValuesFromAttrs(node.parsedAttrs.typeProperties, nodeType.attrs, {
      skipSystem: true,
    })
  }
  for (const [notationId, binding] of Object.entries(node.parsedAttrs.notationComponents)) {
    const componentId = binding.componentId
    if (!componentId) continue
    if (!node.parsedAttrs.componentProperties[notationId]) {
      node.parsedAttrs.componentProperties[notationId] = {}
    }
    if (!node.parsedAttrs.componentProperties[notationId][componentId]) {
      node.parsedAttrs.componentProperties[notationId][componentId] = {}
    }
    const component = indexes.componentByKey.get(`${notationId}:${componentId}`)
    if (!component) continue
    applyDefaultCustomPropertyValuesFromAttrs(
      node.parsedAttrs.componentProperties[notationId][componentId]!,
      component.attrs,
      { skipSystem: true }
    )
  }
}

export function applyDefaultsToEditorLink(
  link: EditorLink,
  catalog: EditorDefaultsCatalog,
  indexes = createDefaultsIndexes(catalog)
): void {
  if (link._isDeleted) return
  const linkType = indexes.linkTypeById.get(link.linkTypeId)
  if (linkType) {
    applyDefaultCustomPropertyValuesFromAttrs(link.parsedAttrs.typeProperties, linkType.attrs, {
      skipSystem: true,
    })
  }
  for (const [notationId, binding] of Object.entries(link.parsedAttrs.notationRelations)) {
    const relationId = binding.relationId
    if (!relationId) continue
    if (!link.parsedAttrs.relationProperties[notationId]) {
      link.parsedAttrs.relationProperties[notationId] = {}
    }
    if (!link.parsedAttrs.relationProperties[notationId][relationId]) {
      link.parsedAttrs.relationProperties[notationId][relationId] = {}
    }
    const relation = indexes.relationByKey.get(`${notationId}:${relationId}`)
    if (!relation) continue
    applyDefaultCustomPropertyValuesFromAttrs(
      link.parsedAttrs.relationProperties[notationId][relationId]!,
      relation.attrs,
      { skipSystem: true }
    )
  }
}

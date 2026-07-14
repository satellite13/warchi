import { parseEntityAttrs } from '@/domain/attrs/notationAttrs'
import type { DiagramAttrs } from '../modelAttrs'
import type { ModelEditorState } from '../types'
import {
  getDiagramScopedLinkValues,
  getDiagramScopedNodeValues,
} from './diagramScopedProperties'

export type RequiredCustomPropertyValidationIssue = {
  key:
    | 'models.validationNodeTypePropRequired'
    | 'models.validationNodeComponentPropRequired'
    | 'models.validationLinkPropRequired'
  params: Record<string, string>
}

type ValidateRequiredCustomPropertiesOptions = {
  state: ModelEditorState
  activeDiagram: DiagramAttrs | null | undefined
}

export function isRequiredPropertyFilled(value: unknown, type: string): boolean {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined
}

export function validateRequiredCustomProperties(
  options: ValidateRequiredCustomPropertiesOptions
): RequiredCustomPropertyValidationIssue | null {
  const { state, activeDiagram } = options
  const componentById = new Map(state.components.map(component => [component.id, component]))
  const relationById = new Map(state.relations.map(relation => [relation.id, relation]))
  const nodeTypeById = new Map(state.nodeTypes.map(nt => [nt.id, nt]))

  for (const node of state.nodes) {
    if (node._isDeleted) continue

    const nodeType = nodeTypeById.get(node.nodeTypeId)
    if (nodeType) {
      const requiredTypeProps = parseEntityAttrs(nodeType.attrs ?? null).customProperties.filter(
        property => property.required && !property.system
      )
      for (const property of requiredTypeProps) {
        const value = node.parsedAttrs.typeProperties[property.name]
        if (!isRequiredPropertyFilled(value, property.type)) {
          return {
            key: 'models.validationNodeTypePropRequired',
            params: { node: node.name, prop: property.name },
          }
        }
      }
    }

    for (const [notationId, binding] of Object.entries(node.parsedAttrs.notationComponents)) {
      const component = componentById.get(binding.componentId)
      if (!component || component.notationId !== notationId) continue

      const requiredProperties = parseEntityAttrs(component.attrs ?? null).customProperties.filter(
        property => property.required && !property.system
      )
      if (requiredProperties.length === 0) continue

      const scopedValues = getDiagramScopedNodeValues({
        diagram: activeDiagram,
        modelNodeId: node.id,
        notationId,
        componentId: binding.componentId,
        nodeAttrsFallback: node.parsedAttrs,
      })
      for (const property of requiredProperties) {
        const value = scopedValues[property.name]
        if (!isRequiredPropertyFilled(value, property.type)) {
          return {
            key: 'models.validationNodeComponentPropRequired',
            params: { node: node.name, prop: property.name, diagram: component.name },
          }
        }
      }
    }
  }

  for (const link of state.links) {
    if (link._isDeleted) continue

    for (const [notationId, binding] of Object.entries(link.parsedAttrs.notationRelations)) {
      const relation = relationById.get(binding.relationId)
      if (!relation || relation.notationId !== notationId) continue

      const requiredProperties = parseEntityAttrs(relation.attrs ?? null).customProperties.filter(
        property => property.required && !property.system
      )
      if (requiredProperties.length === 0) continue

      const scopedValues = getDiagramScopedLinkValues({
        diagram: activeDiagram,
        modelLinkId: link.id,
        notationId,
        relationId: binding.relationId,
        linkAttrsFallback: link.parsedAttrs,
      })
      for (const property of requiredProperties) {
        const value = scopedValues[property.name]
        if (!isRequiredPropertyFilled(value, property.type)) {
          return {
            key: 'models.validationLinkPropRequired',
            params: { link: relation.name, prop: property.name },
          }
        }
      }
    }
  }

  return null
}

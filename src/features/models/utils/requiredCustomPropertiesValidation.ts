import { parseEntityAttrs, type CustomProperty } from '@/domain/attrs/notationAttrs'
import { isCustomPropertyValueFilled } from '@/domain/attrs/customPropertyValues'
import type { DiagramAttrs } from '../modelAttrs'
import type { EditorLink, EditorNode, ModelEditorState } from '../types'
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
  nodes?: EditorNode[]
  links?: EditorLink[]
}

export function isRequiredPropertyFilled(value: unknown, type: string): boolean {
  return isCustomPropertyValueFilled(value, type)
}

export function validateRequiredCustomProperties(
  options: ValidateRequiredCustomPropertiesOptions
): RequiredCustomPropertyValidationIssue | null {
  const { state, activeDiagram } = options
  const nodes = options.nodes ?? state.nodes
  const links = options.links ?? state.links
  const componentById = new Map(state.components.map(component => [component.id, component]))
  const relationById = new Map(state.relations.map(relation => [relation.id, relation]))
  const nodeTypeById = new Map(state.nodeTypes.map(nt => [nt.id, nt]))
  const requiredPropertiesByEntityId = new Map<string, CustomProperty[]>()
  const requiredProperties = (id: string, attrs: string | null): CustomProperty[] => {
    const cached = requiredPropertiesByEntityId.get(id)
    if (cached) return cached
    const parsed = parseEntityAttrs(attrs).customProperties.filter(
      property => property.required && !property.system
    )
    requiredPropertiesByEntityId.set(id, parsed)
    return parsed
  }

  for (const node of nodes) {
    if (node._isDeleted) continue

    const nodeType = nodeTypeById.get(node.nodeTypeId)
    if (nodeType) {
      const requiredTypeProps = requiredProperties(nodeType.id, nodeType.attrs ?? null)
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

      const componentRequiredProperties = requiredProperties(component.id, component.attrs ?? null)
      if (componentRequiredProperties.length === 0) continue

      const scopedValues = getDiagramScopedNodeValues({
        diagram: activeDiagram,
        modelNodeId: node.id,
        notationId,
        componentId: binding.componentId,
        nodeAttrsFallback: node.parsedAttrs,
      })
      for (const property of componentRequiredProperties) {
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

  for (const link of links) {
    if (link._isDeleted) continue

    for (const [notationId, binding] of Object.entries(link.parsedAttrs.notationRelations)) {
      const relation = relationById.get(binding.relationId)
      if (!relation || relation.notationId !== notationId) continue

      const relationRequiredProperties = requiredProperties(relation.id, relation.attrs ?? null)
      if (relationRequiredProperties.length === 0) continue

      const scopedValues = getDiagramScopedLinkValues({
        diagram: activeDiagram,
        modelLinkId: link.id,
        notationId,
        relationId: binding.relationId,
        linkAttrsFallback: link.parsedAttrs,
      })
      for (const property of relationRequiredProperties) {
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

import type { OefElement, OefParsedModel, OefRelationship, OefView, OefViewConnection, OefViewNode } from './types'

const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

function textOfFirstDirectChild(parent: Element, localName: string): string {
  const child = Array.from(parent.children).find(item => item.localName === localName)
  return child?.textContent?.trim() ?? ''
}

function getDirectChild(parent: Element, localName: string): Element | null {
  return Array.from(parent.children).find(item => item.localName === localName) ?? null
}

function getDirectChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter(item => item.localName === localName)
}

function getDescendantsByLocalName(parent: Element, localName: string): Element[] {
  const out: Element[] = []
  const visit = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.localName === localName) out.push(child)
      visit(child)
    }
  }
  visit(parent)
  return out
}

function typeOf(element: Element): string {
  return (
    element.getAttributeNS(XSI_NS, 'type') ??
    element.getAttribute('xsi:type') ??
    element.getAttribute('type') ??
    ''
  ).trim()
}

function parseNumber(value: string | null): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parsePropertyDefinitions(model: Element): Map<string, string> {
  const definitionNames = new Map<string, string>()
  const definitionsRoot = getDirectChild(model, 'propertyDefinitions')
  if (!definitionsRoot) return definitionNames

  for (const definition of getDirectChildren(definitionsRoot, 'propertyDefinition')) {
    const id = (definition.getAttribute('identifier') ?? '').trim()
    if (!id) continue
    const name = textOfFirstDirectChild(definition, 'name').trim()
    if (!name) continue
    definitionNames.set(id, name)
  }

  return definitionNames
}

function parseEntityProperties(
  entity: Element,
  definitionNames: Map<string, string>
): Record<string, string> | undefined {
  const propertiesRoot = getDirectChild(entity, 'properties')
  if (!propertiesRoot) return undefined

  const properties: Record<string, string> = {}
  for (const property of getDirectChildren(propertiesRoot, 'property')) {
    const definitionRef = (property.getAttribute('propertyDefinitionRef') ?? '').trim()
    if (!definitionRef) continue
    const name = definitionNames.get(definitionRef)
    if (!name) continue
    properties[name] = textOfFirstDirectChild(property, 'value')
  }

  return Object.keys(properties).length > 0 ? properties : undefined
}

function parseElements(model: Element, definitionNames: Map<string, string>): OefElement[] {
  const elementsRoot = getDirectChild(model, 'elements')
  if (!elementsRoot) return []

  return getDirectChildren(elementsRoot, 'element')
    .map(el => {
      const id = (el.getAttribute('identifier') ?? '').trim()
      if (!id) return null
      const properties = parseEntityProperties(el, definitionNames)
      return {
        id,
        type: typeOf(el),
        name: textOfFirstDirectChild(el, 'name'),
        ...(properties ? { properties } : {}),
      } satisfies OefElement
    })
    .filter((item): item is OefElement => item !== null)
}

function parseRelationships(model: Element, definitionNames: Map<string, string>): OefRelationship[] {
  const relationshipsRoot = getDirectChild(model, 'relationships')
  if (!relationshipsRoot) return []

  return getDirectChildren(relationshipsRoot, 'relationship')
    .map(el => {
      const id = (el.getAttribute('identifier') ?? '').trim()
      if (!id) return null
      const properties = parseEntityProperties(el, definitionNames)
      return {
        id,
        type: typeOf(el),
        name: textOfFirstDirectChild(el, 'name'),
        sourceElementId: (el.getAttribute('source') ?? '').trim(),
        targetElementId: (el.getAttribute('target') ?? '').trim(),
        ...(properties ? { properties } : {}),
      } satisfies OefRelationship
    })
    .filter((item): item is OefRelationship => item !== null)
}

function isOefDiagramNoteNode(nodeType: string): boolean {
  return nodeType === 'Label' || nodeType === 'Note'
}

function isOefDiagramContainerNode(nodeType: string): boolean {
  return nodeType === 'Container'
}

function parseViewNodes(view: Element): OefViewNode[] {
  return getDescendantsByLocalName(view, 'node')
    .map(el => {
      const id = (el.getAttribute('identifier') ?? '').trim()
      if (!id) return null
      const nodeType = typeOf(el)
      const parsed: OefViewNode = {
        id,
        elementId: (el.getAttribute('elementRef') ?? '').trim(),
        type: nodeType,
        x: parseNumber(el.getAttribute('x')) ?? 0,
        y: parseNumber(el.getAttribute('y')) ?? 0,
      }
      const width = parseNumber(el.getAttribute('w'))
      const height = parseNumber(el.getAttribute('h'))
      if (typeof width === 'number') parsed.width = width
      if (typeof height === 'number') parsed.height = height
      if (isOefDiagramNoteNode(nodeType) || isOefDiagramContainerNode(nodeType)) {
        parsed.labelText =
          textOfFirstDirectChild(el, 'label') || textOfFirstDirectChild(el, 'name')
      }
      return parsed
    })
    .filter((item): item is OefViewNode => item !== null)
}

function parseViewConnections(view: Element): OefViewConnection[] {
  return getDescendantsByLocalName(view, 'connection')
    .map(el => {
      const id = (el.getAttribute('identifier') ?? '').trim()
      if (!id) return null
      return {
        id,
        relationshipId: (el.getAttribute('relationshipRef') ?? '').trim(),
        sourceNodeId: (el.getAttribute('source') ?? '').trim(),
        targetNodeId: (el.getAttribute('target') ?? '').trim(),
        type: typeOf(el),
      } satisfies OefViewConnection
    })
    .filter((item): item is OefViewConnection => item !== null)
}

function parseViews(model: Element): OefView[] {
  const viewsRoot = getDirectChild(model, 'views')
  const diagramsRoot = viewsRoot ? getDirectChild(viewsRoot, 'diagrams') : null
  if (!diagramsRoot) return []

  return getDirectChildren(diagramsRoot, 'view')
    .map(view => {
      const id = (view.getAttribute('identifier') ?? '').trim()
      if (!id) return null
      return {
        id,
        type: typeOf(view),
        name: textOfFirstDirectChild(view, 'name'),
        nodes: parseViewNodes(view),
        connections: parseViewConnections(view),
      } satisfies OefView
    })
    .filter((item): item is OefView => item !== null)
}

export function parseOefXml(xmlText: string): OefParsedModel {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid OEF XML: parsererror')
  }

  const modelElement = doc.documentElement
  if (!modelElement || modelElement.localName !== 'model') {
    throw new Error('Invalid OEF XML: missing <model>')
  }

  const modelId = (modelElement.getAttribute('identifier') ?? '').trim()
  const definitionNames = parsePropertyDefinitions(modelElement)
  return {
    model: {
      id: modelId,
      name: textOfFirstDirectChild(modelElement, 'name'),
    },
    elements: parseElements(modelElement, definitionNames),
    relationships: parseRelationships(modelElement, definitionNames),
    views: parseViews(modelElement),
  }
}

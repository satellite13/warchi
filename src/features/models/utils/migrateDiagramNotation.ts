import type { ComponentResponse, RelationResponse } from '@/types/api'
import type { DiagramAttrs, DiagramEdgeInstance, DiagramNodeInstance } from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode } from '../types'

export type NotationIdRemap = Map<string, string>

export type MigrateDiagramNotationResult = {
  remappedNodes: number
  remappedLinks: number
  remappedNodeInstances: number
  remappedEdgeInstances: number
  unmappedComponents: string[]
  unmappedRelations: string[]
}

function groupByKey<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

/** Map old component ids → new by unique name, else name+nodeTypeId. */
export function buildComponentIdRemap(
  oldComponents: readonly ComponentResponse[],
  newComponents: readonly ComponentResponse[]
): { remap: NotationIdRemap; unmapped: string[] } {
  const remap: NotationIdRemap = new Map()
  const unmapped: string[] = []
  const newByName = groupByKey(newComponents, c => c.name)
  const newByNameType = groupByKey(newComponents, c => `${c.name}\0${c.nodeTypeId}`)

  for (const old of oldComponents) {
    const byName = newByName.get(old.name) ?? []
    let target: ComponentResponse | undefined
    if (byName.length === 1) {
      target = byName[0]
    } else {
      const typed = newByNameType.get(`${old.name}\0${old.nodeTypeId}`) ?? []
      if (typed.length === 1) target = typed[0]
    }
    if (target) {
      remap.set(old.id, target.id)
    } else {
      unmapped.push(old.name)
    }
  }
  return { remap, unmapped: [...new Set(unmapped)].sort() }
}

/** Map old relation ids → new by unique name, else name+linkTypeId. */
export function buildRelationIdRemap(
  oldRelations: readonly RelationResponse[],
  newRelations: readonly RelationResponse[]
): { remap: NotationIdRemap; unmapped: string[] } {
  const remap: NotationIdRemap = new Map()
  const unmapped: string[] = []
  const newByName = groupByKey(newRelations, r => r.name)
  const newByNameType = groupByKey(newRelations, r => `${r.name}\0${r.linkTypeId}`)

  for (const old of oldRelations) {
    const byName = newByName.get(old.name) ?? []
    let target: RelationResponse | undefined
    if (byName.length === 1) {
      target = byName[0]
    } else {
      const typed = newByNameType.get(`${old.name}\0${old.linkTypeId}`) ?? []
      if (typed.length === 1) target = typed[0]
    }
    if (target) {
      remap.set(old.id, target.id)
    } else {
      unmapped.push(old.name)
    }
  }
  return { remap, unmapped: [...new Set(unmapped)].sort() }
}

function remapScopedPropertyMap(
  scoped: Record<string, Record<string, Record<string, unknown>>> | undefined,
  oldNotationId: string,
  newNotationId: string,
  entityRemap: NotationIdRemap
): void {
  if (!scoped) return
  const oldByEntity = scoped[oldNotationId]
  if (!oldByEntity) return
  if (!scoped[newNotationId]) scoped[newNotationId] = {}
  const target = scoped[newNotationId]!
  for (const [oldEntityId, props] of Object.entries(oldByEntity)) {
    const newEntityId = entityRemap.get(oldEntityId)
    if (!newEntityId) continue
    target[newEntityId] = { ...(target[newEntityId] ?? {}), ...props }
  }
}

function migrateNodeBinding(
  node: EditorNode,
  oldNotationId: string,
  newNotationId: string,
  componentRemap: NotationIdRemap
): boolean {
  const binding = node.parsedAttrs.notationComponents[oldNotationId]
  if (!binding?.componentId) return false
  const newComponentId = componentRemap.get(binding.componentId)
  if (!newComponentId) return false
  node.parsedAttrs.notationComponents[newNotationId] = { componentId: newComponentId }
  remapScopedPropertyMap(
    node.parsedAttrs.componentProperties,
    oldNotationId,
    newNotationId,
    componentRemap
  )
  return true
}

function migrateLinkBinding(
  link: EditorLink,
  oldNotationId: string,
  newNotationId: string,
  relationRemap: NotationIdRemap
): boolean {
  const binding = link.parsedAttrs.notationRelations[oldNotationId]
  if (!binding?.relationId) return false
  const newRelationId = relationRemap.get(binding.relationId)
  if (!newRelationId) return false
  link.parsedAttrs.notationRelations[newNotationId] = { relationId: newRelationId }
  remapScopedPropertyMap(
    link.parsedAttrs.relationProperties,
    oldNotationId,
    newNotationId,
    relationRemap
  )
  return true
}

function migrateInstanceScopedProps(
  instance: DiagramNodeInstance | DiagramEdgeInstance,
  key: 'componentProperties' | 'relationProperties',
  oldNotationId: string,
  newNotationId: string,
  entityRemap: NotationIdRemap
): boolean {
  const attrs = instance.attrs
  if (!attrs) return false
  const scoped = attrs[key] as Record<string, Record<string, Record<string, unknown>>> | undefined
  if (!scoped?.[oldNotationId]) return false
  remapScopedPropertyMap(scoped, oldNotationId, newNotationId, entityRemap)
  return true
}

/**
 * In-place migrate diagram notation bindings for instances on this diagram.
 * Keeps old notation keys on model nodes/links for other diagrams.
 */
export function applyDiagramNotationMigration(params: {
  diagram: EditorDiagram
  nodes: EditorNode[]
  links: EditorLink[]
  oldNotationId: string
  newNotationId: string
  componentRemap: NotationIdRemap
  relationRemap: NotationIdRemap
}): MigrateDiagramNotationResult {
  const { diagram, nodes, links, oldNotationId, newNotationId, componentRemap, relationRemap } =
    params
  const attrs: DiagramAttrs = diagram.parsedAttrs
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const linkById = new Map(links.map(link => [link.id, link]))

  let remappedNodes = 0
  let remappedLinks = 0
  let remappedNodeInstances = 0
  let remappedEdgeInstances = 0

  const touchedNodeIds = new Set<string>()
  for (const instance of attrs.instances.nodes) {
    const node = nodeById.get(instance.modelNodeId)
    if (node && !touchedNodeIds.has(node.id)) {
      if (migrateNodeBinding(node, oldNotationId, newNotationId, componentRemap)) {
        remappedNodes += 1
        touchedNodeIds.add(node.id)
      }
    }
    if (
      migrateInstanceScopedProps(
        instance,
        'componentProperties',
        oldNotationId,
        newNotationId,
        componentRemap
      )
    ) {
      remappedNodeInstances += 1
    }
  }

  const touchedLinkIds = new Set<string>()
  for (const edge of attrs.instances.edges) {
    const link = linkById.get(edge.modelLinkId)
    if (link && !touchedLinkIds.has(link.id)) {
      if (migrateLinkBinding(link, oldNotationId, newNotationId, relationRemap)) {
        remappedLinks += 1
        touchedLinkIds.add(link.id)
      }
    }
    if (
      migrateInstanceScopedProps(
        edge,
        'relationProperties',
        oldNotationId,
        newNotationId,
        relationRemap
      )
    ) {
      remappedEdgeInstances += 1
    }
  }

  diagram.notationId = newNotationId

  return {
    remappedNodes,
    remappedLinks,
    remappedNodeInstances,
    remappedEdgeInstances,
    unmappedComponents: [],
    unmappedRelations: [],
  }
}

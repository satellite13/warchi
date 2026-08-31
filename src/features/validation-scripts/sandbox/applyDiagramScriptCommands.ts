import type {
  ScriptDiagramEdgeInstance,
  ScriptDiagramNodeInstance,
  ScriptEditorDiagram,
  ScriptHistoryCommand,
} from './editorStateContract'
import { createId as defaultCreateId } from '@/utils/createId'
import type { DiagramScriptCommand } from './diagramScriptCommands'
import { expandLayoutCommands, type LayoutBounds } from './layoutCommands'

const DEFAULT_INSTANCE_WIDTH = 160
const DEFAULT_INSTANCE_HEIGHT = 56

function cloneInstances(diagram: ScriptEditorDiagram): {
  nodes: ScriptDiagramNodeInstance[]
  edges: ScriptDiagramEdgeInstance[]
} {
  return JSON.parse(JSON.stringify(diagram.parsedAttrs.instances)) as {
    nodes: ScriptDiagramNodeInstance[]
    edges: ScriptDiagramEdgeInstance[]
  }
}

function boundsFromInstances(nodes: ScriptDiagramNodeInstance[]): Record<string, LayoutBounds> {
  const bounds: Record<string, LayoutBounds> = {}
  for (const node of nodes) {
    bounds[node.id] = {
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width ?? DEFAULT_INSTANCE_WIDTH,
      height: node.height ?? DEFAULT_INSTANCE_HEIGHT,
    }
  }
  return bounds
}

function firstInstanceId(nodes: ScriptDiagramNodeInstance[], modelNodeId: string): string | undefined {
  return nodes.find((node) => node.modelNodeId === modelNodeId)?.id
}

function applySetBounds(
  nodes: ScriptDiagramNodeInstance[],
  command: Extract<DiagramScriptCommand, { type: 'setBounds' }>
): void {
  const instance = nodes.find((node) => node.id === command.instanceId)
  if (!instance) return
  instance.x = command.x
  instance.y = command.y
  if (command.width != null) instance.width = command.width
  if (command.height != null) instance.height = command.height
}

function mutateInstances(
  instances: { nodes: ScriptDiagramNodeInstance[]; edges: ScriptDiagramEdgeInstance[] },
  input: {
    commands: DiagramScriptCommand[]
    linkEndpoints: Record<string, { sourceId: string; targetId: string }>
    createId: () => string
    componentByNodeId?: Record<string, string>
  }
): void {
  const bounds = boundsFromInstances(instances.nodes)
  const expanded = expandLayoutCommands({
    boundsById: bounds,
    commands: input.commands,
  })

  for (const command of expanded) {
    switch (command.type) {
      case 'setBounds': {
        applySetBounds(instances.nodes, command)
        break
      }
      case 'addInstance': {
        const instance: ScriptDiagramNodeInstance = {
          id: input.createId(),
          modelNodeId: command.nodeId,
          x: command.x ?? 0,
          y: command.y ?? 0,
          width: DEFAULT_INSTANCE_WIDTH,
          height: DEFAULT_INSTANCE_HEIGHT,
        }
        const componentId = input.componentByNodeId?.[command.nodeId]
        if (componentId) {
          instance.attrs = { notationComponentId: componentId }
        }
        instances.nodes.push(instance)
        break
      }
      case 'addEdge': {
        const ends = input.linkEndpoints[command.linkId]
        if (!ends) break
        const sourceInstanceId = firstInstanceId(instances.nodes, ends.sourceId)
        const targetInstanceId = firstInstanceId(instances.nodes, ends.targetId)
        if (!sourceInstanceId || !targetInstanceId) break
        if (instances.edges.some((edge) => edge.modelLinkId === command.linkId)) break
        instances.edges.push({
          id: input.createId(),
          modelLinkId: command.linkId,
          sourceInstanceId,
          targetInstanceId,
        })
        break
      }
      case 'removeInstance': {
        instances.nodes = instances.nodes.filter((node) => node.id !== command.instanceId)
        instances.edges = instances.edges.filter(
          (edge) =>
            edge.sourceInstanceId !== command.instanceId &&
            edge.targetInstanceId !== command.instanceId
        )
        break
      }
      case 'removeEdge': {
        instances.edges = instances.edges.filter((edge) => edge.id !== command.edgeInstanceId)
        break
      }
      case 'setEdgeStyle': {
        for (const edge of instances.edges) {
          const byInstance = command.edgeInstanceId != null && edge.id === command.edgeInstanceId
          const byLink = command.linkId != null && edge.modelLinkId === command.linkId
          if (!byInstance && !byLink) continue
          const attrs = { ...(edge.attrs ?? {}) }
          const prevStyle =
            attrs.diagramStyle && typeof attrs.diagramStyle === 'object' && !Array.isArray(attrs.diagramStyle)
              ? { ...attrs.diagramStyle }
              : {}
          attrs.diagramStyle = { ...prevStyle, strokeColor: command.strokeColor }
          edge.attrs = attrs
        }
        break
      }
      default:
        break
    }
  }
}

export type ApplyDiagramScriptCommandsInput = {
  diagram: ScriptEditorDiagram
  commands: DiagramScriptCommand[]
  linkEndpoints: Record<string, { sourceId: string; targetId: string }>
  executeHistory: (command: ScriptHistoryCommand) => void
  createId?: () => string
  componentByNodeId?: Record<string, string>
  onApplied?: () => void
}

export function applyDiagramScriptCommands(input: ApplyDiagramScriptCommandsInput): void {
  if (input.commands.length === 0) return
  const before = cloneInstances(input.diagram)
  const after = cloneInstances(input.diagram)
  mutateInstances(after, {
    commands: input.commands,
    linkEndpoints: input.linkEndpoints,
    createId: input.createId ?? defaultCreateId,
    componentByNodeId: input.componentByNodeId,
  })

  const assign = (snapshot: {
    nodes: ScriptDiagramNodeInstance[]
    edges: ScriptDiagramEdgeInstance[]
  }): void => {
    input.diagram.parsedAttrs.instances.nodes = JSON.parse(JSON.stringify(snapshot.nodes))
    input.diagram.parsedAttrs.instances.edges = JSON.parse(JSON.stringify(snapshot.edges))
    input.onApplied?.()
  }

  input.executeHistory({
    execute: () => assign(after),
    undo: () => assign(before),
  })
}

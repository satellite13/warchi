export type DiagramScriptCommand =
  | { type: 'setBounds'; instanceId: string; x: number; y: number; width?: number; height?: number }
  | { type: 'addInstance'; nodeId: string; x?: number; y?: number }
  | { type: 'addEdge'; linkId: string }
  | { type: 'removeInstance'; instanceId: string }
  | { type: 'removeEdge'; edgeInstanceId: string }
  | { type: 'align'; instanceIds: string[]; mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' }
  | { type: 'distribute'; instanceIds: string[]; axis: 'horizontal' | 'vertical' }
  | { type: 'stack'; instanceIds: string[]; mode: 'vertical' | 'overlap' }
  | { type: 'setEdgeStyle'; edgeInstanceId?: string; linkId?: string; strokeColor: string }

export type ValidateCommandQueueInput = {
  instanceModelNodeIds: Set<string>
  instanceIds: Set<string>
  edgeIds: Set<string>
  canvasLinkIds?: Set<string>
  linkEndpoints: Record<string, { sourceId: string; targetId: string }>
  commands: DiagramScriptCommand[]
}

export type ValidateCommandQueueResult =
  | { ok: true }
  | { ok: false; error: string }

const HEX_STROKE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function requireInstances(
  instanceIds: Set<string>,
  ids: string[],
  commandType: string
): ValidateCommandQueueResult | null {
  for (const id of ids) {
    if (!instanceIds.has(id)) {
      return { ok: false, error: `${commandType}: unknown instance ${id}` }
    }
  }
  return null
}

export function validateCommandQueue(input: ValidateCommandQueueInput): ValidateCommandQueueResult {
  const modelNodeIds = new Set(input.instanceModelNodeIds)
  const instanceIds = new Set(input.instanceIds)
  const edgeIds = new Set(input.edgeIds)

  for (const command of input.commands) {
    switch (command.type) {
      case 'addInstance': {
        if (!command.nodeId) {
          return { ok: false, error: 'addInstance: nodeId required' }
        }
        modelNodeIds.add(command.nodeId)
        break
      }
      case 'addEdge': {
        const ends = input.linkEndpoints[command.linkId]
        if (!ends) {
          return { ok: false, error: `addEdge: unknown link ${command.linkId}` }
        }
        if (!modelNodeIds.has(ends.sourceId) || !modelNodeIds.has(ends.targetId)) {
          return { ok: false, error: `addEdge: endpoints of ${command.linkId} are not on the diagram` }
        }
        break
      }
      case 'setBounds': {
        const missing = requireInstances(instanceIds, [command.instanceId], 'setBounds')
        if (missing) return missing
        break
      }
      case 'removeInstance': {
        const missing = requireInstances(instanceIds, [command.instanceId], 'removeInstance')
        if (missing) return missing
        instanceIds.delete(command.instanceId)
        break
      }
      case 'removeEdge': {
        if (!edgeIds.has(command.edgeInstanceId)) {
          return { ok: false, error: `removeEdge: unknown edge ${command.edgeInstanceId}` }
        }
        edgeIds.delete(command.edgeInstanceId)
        break
      }
      case 'align': {
        const missing = requireInstances(instanceIds, command.instanceIds, 'align')
        if (missing) return missing
        break
      }
      case 'distribute': {
        const missing = requireInstances(instanceIds, command.instanceIds, 'distribute')
        if (missing) return missing
        break
      }
      case 'stack': {
        const missing = requireInstances(instanceIds, command.instanceIds, 'stack')
        if (missing) return missing
        break
      }
      case 'setEdgeStyle': {
        if (!HEX_STROKE.test(command.strokeColor ?? '')) {
          return { ok: false, error: 'setEdgeStyle: strokeColor must be #rgb, #rrggbb or #rrggbbaa' }
        }
        if (!command.edgeInstanceId && !command.linkId) {
          return { ok: false, error: 'setEdgeStyle: edgeInstanceId or linkId required' }
        }
        if (command.edgeInstanceId && !edgeIds.has(command.edgeInstanceId)) {
          return { ok: false, error: `setEdgeStyle: unknown edge ${command.edgeInstanceId}` }
        }
        if (command.linkId && input.canvasLinkIds && !input.canvasLinkIds.has(command.linkId)) {
          return { ok: false, error: `setEdgeStyle: link ${command.linkId} is not on the diagram` }
        }
        break
      }
    }
  }

  return { ok: true }
}

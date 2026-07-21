import type { EdgeEndpoint } from '@ngroznykh/papirus'
import type { DiagramNodeInstance } from '../modelAttrs'
import { getHostEdgeInstanceId, isEdgeAnchorInstance } from './diagramOnlyInstances'

export type EdgeAnchorBinding = {
  hostEdgeInstanceId: string
  pathParam: number
}

function readPathParam(attrs: DiagramNodeInstance['attrs']): number {
  const raw = attrs?.pathParam
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(1, Math.max(0, raw))
  }
  return 0.5
}

/** instanceId → host edge binding for diagram-only edge-anchor nodes. */
export function buildEdgeAnchorLookup(
  nodes: readonly DiagramNodeInstance[]
): Map<string, EdgeAnchorBinding> {
  const map = new Map<string, EdgeAnchorBinding>()
  for (const node of nodes) {
    if (!isEdgeAnchorInstance(node)) continue
    const hostEdgeInstanceId = getHostEdgeInstanceId(node)
    if (!hostEdgeInstanceId) continue
    map.set(node.id, {
      hostEdgeInstanceId,
      pathParam: readPathParam(node.attrs),
    })
  }
  return map
}

export function resolveDiagramEdgeEndpoint(params: {
  instanceId: string
  papNodeId: string
  outlineParam?: number
  portId?: string
  anchorLookup: Map<string, EdgeAnchorBinding>
  /** Host edge must already be present (or about to be) in the renderer. */
  hostEdgeExists: (hostEdgeInstanceId: string) => boolean
}): EdgeEndpoint | null {
  const anchor = params.anchorLookup.get(params.instanceId)
  if (anchor) {
    if (!params.hostEdgeExists(anchor.hostEdgeInstanceId)) return null
    return {
      edgeId: `edge-${anchor.hostEdgeInstanceId}`,
      pathParam: anchor.pathParam,
    }
  }
  // Prefer an explicit port over a leftover outline param (e.g. after turning off
  // attach-to-outline and reconnecting to a side port).
  if (params.portId) {
    return { nodeId: params.papNodeId, portId: params.portId }
  }
  if (params.outlineParam !== undefined) {
    return { nodeId: params.papNodeId, outlineParam: params.outlineParam }
  }
  return { nodeId: params.papNodeId }
}

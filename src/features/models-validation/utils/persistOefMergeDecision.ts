import { apiGet } from '@/composables/useApi'
import { parseNodeAttrs } from '@/features/models/modelAttrs'
import type { NodeResponse } from '@/types/api'
import { mergeNodes, saveOefMergeDecisions } from '../api'
import type { MergeNodesRequest } from '../types'

async function fetchOefEntityId(nodeId: string): Promise<string | null> {
  try {
    const node = await apiGet<NodeResponse>(`/nodes/${encodeURIComponent(nodeId)}`)
    if (!node.success) return null
    return parseNodeAttrs(node.data.attrs ?? null).oef?.entityId ?? null
  } catch {
    return null
  }
}

/**
 * The merge hard-deletes the drop node, so its OEF identity (attrs.oef.entityId)
 * must be read BEFORE merging. The decision {oefEntityId → targetNode} is persisted
 * only after the merge succeeds; persistence failures are swallowed on purpose.
 */
export async function mergeNodesWithOefDecision(
  modelId: string,
  request: MergeNodesRequest
): Promise<Awaited<ReturnType<typeof mergeNodes>>> {
  const entityId = await fetchOefEntityId(request.dropId)
  const result = await mergeNodes(modelId, request)
  if (result.success && entityId) {
    try {
      await saveOefMergeDecisions(modelId, {
        decisions: [{ oefEntityId: entityId, targetNodeId: request.keepId }],
      })
    } catch {
      // Decision persistence is optional; the merge itself already succeeded.
    }
  }
  return result
}

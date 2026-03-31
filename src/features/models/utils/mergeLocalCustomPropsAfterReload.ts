import { clonePlainDeep } from '@/utils/clonePlainDeep'
import type { DiagramAttrs, ScopedCustomValues } from '../modelAttrs'

function stableStringify(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function deepClone<T>(value: T): T {
  return clonePlainDeep(value)
}

/**
 * Берёт серверную карту как основу и накладывает локальные значения свойств
 * (локальные ключи перекрывают серверные на каждом уровне notation → entity → prop).
 */
export function mergeScopedValuesLocalWins(
  server: ScopedCustomValues,
  local: ScopedCustomValues
): ScopedCustomValues {
  const out: ScopedCustomValues = deepClone(server)
  for (const [notationId, localByEntity] of Object.entries(local)) {
    if (!out[notationId]) out[notationId] = {}
    for (const [entityId, localProps] of Object.entries(localByEntity)) {
      if (!out[notationId][entityId]) out[notationId][entityId] = {}
      out[notationId][entityId] = {
        ...out[notationId][entityId],
        ...deepClone(localProps),
      }
    }
  }
  return out
}

/**
 * Диаграмма с сервера + кастомные свойства экземпляров с холста (по modelNodeId / modelLinkId).
 * Позиции и прочая геометрия остаются с сервера.
 */
export function mergeDiagramAttrsKeepLocalInstanceCustom(
  server: DiagramAttrs,
  local: DiagramAttrs
): DiagramAttrs {
  const out = deepClone(server)
  const localNodeByModelId = new Map(local.instances.nodes.map(n => [n.modelNodeId, n]))
  const localEdgeByLinkId = new Map(local.instances.edges.map(e => [e.modelLinkId, e]))

  for (const sNode of out.instances.nodes) {
    const loc = localNodeByModelId.get(sNode.modelNodeId)
    const locCp = loc?.attrs?.componentProperties
    if (!locCp || Object.keys(locCp).length === 0) continue
    sNode.attrs = { ...(sNode.attrs ?? {}) }
    const serverCp = sNode.attrs.componentProperties ?? {}
    sNode.attrs.componentProperties = mergeScopedValuesLocalWins(serverCp, locCp)
  }

  for (const sEdge of out.instances.edges) {
    const loc = localEdgeByLinkId.get(sEdge.modelLinkId)
    const locRp = loc?.attrs?.relationProperties
    if (!locRp || Object.keys(locRp).length === 0) continue
    sEdge.attrs = { ...(sEdge.attrs ?? {}) }
    const serverRp = sEdge.attrs.relationProperties ?? {}
    sEdge.attrs.relationProperties = mergeScopedValuesLocalWins(serverRp, locRp)
  }

  return out
}

/**
 * После loadModel при разрешении конфликта batch-save: для ключей attrs диаграммы,
 * которые уже отличались от сервера до перезагрузки, для `instances` сохраняем
 * локальный холст (редактор диаграммы у вас); для прочих ключей (например documentFileId)
 * берём актуальное значение с сервера после reload.
 */
export function mergeDiagramAttrsAfterBatchConflictReload(
  localBefore: DiagramAttrs,
  serverBefore: DiagramAttrs,
  afterReload: DiagramAttrs
): DiagramAttrs {
  const out = clonePlainDeep(afterReload)
  const outRec = out as Record<string, unknown>
  const keys = new Set([
    ...Object.keys(localBefore as object),
    ...Object.keys(serverBefore as object),
    ...Object.keys(afterReload as object),
  ])
  for (const k of keys) {
    const lk = (localBefore as Record<string, unknown>)[k]
    const s0k = (serverBefore as Record<string, unknown>)[k]
    if (stableStringify(lk) !== stableStringify(s0k)) {
      if (k === 'instances') {
        outRec[k] = lk !== undefined ? clonePlainDeep(lk) : clonePlainDeep(outRec[k])
      }
    }
  }
  return out
}

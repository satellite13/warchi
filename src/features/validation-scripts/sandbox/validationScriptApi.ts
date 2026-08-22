import type { DiagramScriptCommand } from './diagramScriptCommands'
import type {
  SnapshotDiagram,
  SnapshotLink,
  SnapshotNode,
  SnapshotNotation,
  ValidationIssue,
  ValidationIssueTarget,
  ValidationRunContext,
  ValidationSnapshot,
} from './types'
import { VALIDATION_SCRIPT_MAX_ISSUES } from './types'

export type DiagramScriptQueryFn = (
  method: string,
  args: Record<string, unknown>
) => Promise<unknown>

export type ValidationScriptApiOptions = {
  commands?: DiagramScriptCommand[]
  query?: DiagramScriptQueryFn
}

export type ValidationScriptApi = {
  ctx: ValidationRunContext
  report: {
    error: (
      message: string,
      target?: ValidationIssueTarget | SnapshotNode | SnapshotLink | unknown
    ) => void
    warn: (
      message: string,
      target?: ValidationIssueTarget | SnapshotNode | SnapshotLink | unknown
    ) => void
    info: (
      message: string,
      target?: ValidationIssueTarget | SnapshotNode | SnapshotLink | unknown
    ) => void
  }
  diagramNodes: (diagram: SnapshotDiagram) => SnapshotNode[]
  diagramLinks: (diagram: SnapshotDiagram) => SnapshotLink[]
  nodesOfType: (typeIdOrName: string) => SnapshotNode[]
  linksOfType: (typeIdOrName: string) => SnapshotLink[]
  linksBetween: (
    a: SnapshotNode | string,
    b: SnapshotNode | string,
    options?: { linkType?: string }
  ) => Promise<unknown>
  neighbors: (
    nodeId: string,
    options?: { direction?: 'outgoing' | 'incoming'; linkType?: string; page?: number }
  ) => Promise<unknown>
  searchNodes: (options?: { q?: string; type?: string; limit?: number }) => Promise<unknown>
  apply: {
    setBounds: (command: {
      instanceId: string
      x: number
      y: number
      width?: number
      height?: number
    }) => void
    addInstance: (command: { nodeId: string; x?: number; y?: number }) => void
    addEdge: (command: { linkId: string }) => void
    removeInstance: (command: { instanceId: string }) => void
    removeEdge: (command: { edgeInstanceId: string }) => void
    align: (command: {
      instanceIds: string[]
      mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
    }) => void
    distribute: (command: { instanceIds: string[]; axis: 'horizontal' | 'vertical' }) => void
    stack: (command: { instanceIds: string[]; mode: 'vertical' | 'overlap' }) => void
    setEdgeStyle: (command: { edgeInstanceId?: string; linkId?: string; strokeColor: string }) => void
  }
  findDuplicateLinks: (options?: {
    by?: 'endpoints' | 'endpoints+type'
    directed?: boolean
  }) => Array<{ linkIds: string[]; sourceId: string; targetId: string; linkTypeId?: string }>
  componentForNode: (node: SnapshotNode | string) => SnapshotNotation['components'][number] | null
  relationRules: (notationId: string) => SnapshotNotation['relationRules']
}

function nodeId(value: SnapshotNode | string): string {
  return typeof value === 'string' ? value : value.id
}

const TARGET_KINDS = new Set(['node', 'link', 'diagram', 'folder'])

/** Accept explicit `{ kind, id }` or a snapshot node/link object as the second report arg. */
export function resolveReportArgs(
  message: string,
  targetArg?: ValidationIssueTarget | SnapshotNode | SnapshotLink | unknown
): { message: string; target?: ValidationIssueTarget } {
  const base = String(message ?? '')
  if (targetArg == null || typeof targetArg !== 'object') {
    return { message: base }
  }
  const value = targetArg as Record<string, unknown>
  if (typeof value.kind === 'string' && TARGET_KINDS.has(value.kind) && value.id != null) {
    return {
      message: base,
      target: { kind: value.kind as ValidationIssueTarget['kind'], id: String(value.id) },
    }
  }
  if (value.id == null) {
    return { message: base }
  }
  const id = String(value.id)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const label = name || id
  const kind: ValidationIssueTarget['kind'] =
    typeof value.sourceId === 'string' && typeof value.targetId === 'string' ? 'link' : 'node'
  const trimmedBase = base.trimEnd()
  const messageWithLabel =
    trimmedBase.length === 0
      ? label
      : /[:：]\s*$/.test(trimmedBase)
        ? `${trimmedBase} ${label}`
        : `${trimmedBase} ${label}`
  return {
    message: messageWithLabel,
    target: { kind, id },
  }
}

function resolveTypeIds(
  types: Array<{ id: string; name: string }>,
  typeIdOrName: string
): Set<string> {
  const needle = typeIdOrName.trim().toLowerCase()
  const ids = new Set<string>()
  for (const type of types) {
    if (type.id === typeIdOrName || type.name.trim().toLowerCase() === needle) {
      ids.add(type.id)
    }
  }
  return ids
}

export function createValidationScriptApi(
  snapshot: ValidationSnapshot,
  openDiagramId: string | null,
  issues: ValidationIssue[],
  options: ValidationScriptApiOptions = {}
): ValidationScriptApi {
  const commands = options.commands ?? []
  const query = options.query

  const ctx: ValidationRunContext = {
    model: snapshot.model,
    diagram: openDiagramId
      ? (snapshot.model.diagrams.find((d) => d.id === openDiagramId) ?? null)
      : null,
    notations: snapshot.notations,
    types: snapshot.types,
  }

  const pushIssue = (
    level: ValidationIssue['level'],
    message: string,
    targetArg?: ValidationIssueTarget | SnapshotNode | SnapshotLink | unknown
  ): void => {
    if (issues.length >= VALIDATION_SCRIPT_MAX_ISSUES) return
    const { message: resolvedMessage, target } = resolveReportArgs(message, targetArg)
    const trimmed = resolvedMessage.trim()
    if (!trimmed) return
    const issue: ValidationIssue = { level, message: trimmed }
    if (target) issue.target = target
    issues.push(issue)
    if (issues.length === VALIDATION_SCRIPT_MAX_ISSUES) {
      issues.push({
        level: 'info',
        message: `Issue limit reached (${VALIDATION_SCRIPT_MAX_ISSUES}); further reports ignored`,
      })
    }
  }

  const diagramNodes = (diagram: SnapshotDiagram): SnapshotNode[] => {
    const ids = new Set(diagram?.nodeIds ?? [])
    return snapshot.model.nodes.filter((n) => ids.has(n.id))
  }

  const diagramLinks = (diagram: SnapshotDiagram): SnapshotLink[] => {
    const ids = new Set(diagram?.linkIds ?? [])
    return snapshot.model.links.filter((l) => ids.has(l.id))
  }

  const nodesOfType = (typeIdOrName: string): SnapshotNode[] => {
    const ids = resolveTypeIds(snapshot.types.nodeTypes, typeIdOrName)
    return snapshot.model.nodes.filter((n) => ids.has(n.nodeTypeId))
  }

  const linksOfType = (typeIdOrName: string): SnapshotLink[] => {
    const ids = resolveTypeIds(snapshot.types.linkTypes, typeIdOrName)
    return snapshot.model.links.filter((l) => ids.has(l.linkTypeId))
  }

  const runQuery = async (method: string, args: Record<string, unknown>): Promise<unknown> => {
    if (!query) {
      throw new Error('Query is not available')
    }
    return query(method, args)
  }

  const neighbors = (
    nodeId: string,
    neighborOptions?: { direction?: 'outgoing' | 'incoming'; linkType?: string; page?: number }
  ): Promise<unknown> =>
    runQuery('neighbors', {
      nodeId,
      direction: neighborOptions?.direction,
      linkType: neighborOptions?.linkType,
      page: neighborOptions?.page,
    })

  const searchNodes = (searchOptions?: {
    q?: string
    type?: string
    limit?: number
  }): Promise<unknown> =>
    runQuery('searchNodes', {
      q: searchOptions?.q,
      type: searchOptions?.type,
      limit: searchOptions?.limit,
    })

  const linksBetween = (
    a: SnapshotNode | string,
    b: SnapshotNode | string,
    linkOptions?: { linkType?: string }
  ): Promise<unknown> =>
    runQuery('linksBetween', {
      a: nodeId(a),
      b: nodeId(b),
      linkType: linkOptions?.linkType,
    })

  const findDuplicateLinks = (dupOptions?: {
    by?: 'endpoints' | 'endpoints+type'
    directed?: boolean
  }): Array<{ linkIds: string[]; sourceId: string; targetId: string; linkTypeId?: string }> => {
    const by = dupOptions?.by ?? 'endpoints+type'
    const directed = dupOptions?.directed ?? true
    const groups = new Map<string, string[]>()
    for (const link of snapshot.model.links) {
      let left = link.sourceId
      let right = link.targetId
      if (!directed) {
        ;[left, right] =
          link.sourceId < link.targetId
            ? [link.sourceId, link.targetId]
            : [link.targetId, link.sourceId]
      }
      const key =
        by === 'endpoints' ? `${left}|${right}` : `${left}|${right}|${link.linkTypeId}`
      const list = groups.get(key)
      if (list) list.push(link.id)
      else groups.set(key, [link.id])
    }
    const result: Array<{
      linkIds: string[]
      sourceId: string
      targetId: string
      linkTypeId?: string
    }> = []
    for (const [key, linkIds] of groups) {
      if (linkIds.length < 2) continue
      const parts = key.split('|')
      result.push({
        linkIds,
        sourceId: parts[0]!,
        targetId: parts[1]!,
        linkTypeId: by === 'endpoints+type' ? parts[2] : undefined,
      })
    }
    return result
  }

  const componentForNode = (
    node: SnapshotNode | string
  ): SnapshotNotation['components'][number] | null => {
    const id = nodeId(node)
    const modelNode = snapshot.model.nodes.find((n) => n.id === id)
    if (!modelNode) return null
    const attrs = modelNode.attrs
    const notationComponents =
      attrs && typeof attrs.notationComponents === 'object' && attrs.notationComponents
        ? (attrs.notationComponents as Record<string, { componentId?: string }>)
        : null
    if (notationComponents) {
      for (const binding of Object.values(notationComponents)) {
        const componentId = binding?.componentId
        if (!componentId) continue
        for (const notation of snapshot.notations) {
          const found = notation.components.find((c) => c.id === componentId)
          if (found) return found
        }
      }
    }
    for (const notation of snapshot.notations) {
      const byType = notation.components.find((c) => c.nodeTypeId === modelNode.nodeTypeId)
      if (byType) return byType
    }
    return null
  }

  const relationRules = (notationId: string) => {
    const notation = snapshot.notations.find((n) => n.id === notationId)
    return notation?.relationRules ?? []
  }

  const apply: ValidationScriptApi['apply'] = {
    setBounds: (command) => {
      commands.push({
        type: 'setBounds',
        instanceId: command.instanceId,
        x: command.x,
        y: command.y,
        ...(command.width != null ? { width: command.width } : {}),
        ...(command.height != null ? { height: command.height } : {}),
      })
    },
    addInstance: (command) => {
      commands.push({
        type: 'addInstance',
        nodeId: command.nodeId,
        ...(command.x != null ? { x: command.x } : {}),
        ...(command.y != null ? { y: command.y } : {}),
      })
    },
    addEdge: (command) => {
      commands.push({ type: 'addEdge', linkId: command.linkId })
    },
    removeInstance: (command) => {
      commands.push({ type: 'removeInstance', instanceId: command.instanceId })
    },
    removeEdge: (command) => {
      commands.push({ type: 'removeEdge', edgeInstanceId: command.edgeInstanceId })
    },
    align: (command) => {
      commands.push({ type: 'align', instanceIds: command.instanceIds, mode: command.mode })
    },
    distribute: (command) => {
      commands.push({
        type: 'distribute',
        instanceIds: command.instanceIds,
        axis: command.axis,
      })
    },
    stack: (command) => {
      commands.push({ type: 'stack', instanceIds: command.instanceIds, mode: command.mode })
    },
    setEdgeStyle: (command) => {
      commands.push({
        type: 'setEdgeStyle',
        strokeColor: command.strokeColor,
        ...(command.edgeInstanceId != null ? { edgeInstanceId: command.edgeInstanceId } : {}),
        ...(command.linkId != null ? { linkId: command.linkId } : {}),
      })
    },
  }

  return {
    ctx,
    report: {
      error: (message, target) => pushIssue('error', message, target),
      warn: (message, target) => pushIssue('warn', message, target),
      info: (message, target) => pushIssue('info', message, target),
    },
    diagramNodes,
    diagramLinks,
    nodesOfType,
    linksOfType,
    linksBetween,
    neighbors,
    searchNodes,
    apply,
    findDuplicateLinks,
    componentForNode,
    relationRules,
  }
}

const SCRIPT_BINDING_NAMES = [
  'ctx',
  'report',
  'diagramNodes',
  'diagramLinks',
  'nodesOfType',
  'linksOfType',
  'linksBetween',
  'neighbors',
  'searchNodes',
  'apply',
  'findDuplicateLinks',
  'componentForNode',
  'relationRules',
] as const

/** Execute script source against a sandbox API (async IIFE). */
export async function executeValidationScript(
  source: string,
  api: ValidationScriptApi
): Promise<{ error?: string }> {
  const trimmed = source.trim()
  if (!trimmed) {
    return { error: 'Script source is empty' }
  }
  try {
    const fn = new Function(
      ...SCRIPT_BINDING_NAMES,
      `"use strict"; return (async () => { ${trimmed} })()`
    ) as (...args: unknown[]) => Promise<unknown>
    await fn(
      api.ctx,
      api.report,
      api.diagramNodes,
      api.diagramLinks,
      api.nodesOfType,
      api.linksOfType,
      api.linksBetween,
      api.neighbors,
      api.searchNodes,
      api.apply,
      api.findDuplicateLinks,
      api.componentForNode,
      api.relationRules
    )
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

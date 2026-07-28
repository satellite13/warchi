import type { DiagramResponse, LinkResponse, NodeResponse } from '@/types/api'
import type { BatchConflictItem } from '../composables'
import {
  type DiagramAttrs,
  type DiagramEdgeInstance,
  type DiagramNodeInstance,
  type ScopedCustomValues,
  parseDiagramAttrs,
  serializeDiagramAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs,
} from '../modelAttrs'
import type { EditorDiagram, EditorLink, EditorNode, ModelEditorState } from '../types'
import {
  type ConflictFieldRow,
  type ConflictTranslateFn,
  DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX,
  canvasEdgeDisplayLine,
  displayInstant,
  editorHasModelLinkRow,
  nodeDisplayNameForConflict,
  stableStringify,
} from './conflictDisplay'

/** Снимок attrs для сравнения с сервером: parse→serialize убирает расхождения порядка ключей в JSON. */
function canonicalDiagramAttrsForConflictCompare(attrs: DiagramAttrs): DiagramAttrs {
  return parseDiagramAttrs(serializeDiagramAttrs(attrs))
}

function parseAttrsObject(raw: string | null | undefined): Record<string, unknown> {
  if (raw == null || raw === '') return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function attrsFieldRows(
  localSerialized: string,
  serverAttrsRaw: string | null | undefined,
  prefix: string,
  serverPending: boolean
): ConflictFieldRow[] {
  const localObj = parseAttrsObject(localSerialized)
  const serverObj = serverPending ? {} : parseAttrsObject(serverAttrsRaw ?? null)
  const keys = new Set([...Object.keys(localObj), ...Object.keys(serverObj)])
  const sorted = Array.from(keys).sort()
  return sorted.map((k): ConflictFieldRow => {
    const lv = stableStringify(localObj[k])
    const sv = serverPending ? '…' : stableStringify(serverObj[k])
    return {
      field: `${prefix}.${k}`,
      local: lv,
      server: sv,
      differs: serverPending || lv !== sv,
    }
  })
}

function nodeRows(
  c: BatchConflictItem,
  n: EditorNode | undefined,
  server: NodeResponse | null,
  serverPending: boolean
): ConflictFieldRow[] {
  const rows: ConflictFieldRow[] = [
    {
      field: 'timestamps.clientBaseUpdatedAt',
      local: displayInstant(c.clientBaseUpdatedAt),
      server: displayInstant(c.serverUpdatedAt),
      differs: c.clientBaseUpdatedAt !== c.serverUpdatedAt,
    },
  ]
  if (!n) {
    rows.push({
      field: 'entity',
      local: '—',
      server: serverPending ? '…' : '—',
      differs: true,
    })
    return rows
  }
  const sName = serverPending ? '…' : (server?.name ?? '—')
  const sType = serverPending ? '…' : (server?.nodeTypeId ?? '—')
  const sParent = serverPending ? '…' : (server?.parentNodeId ?? 'null')
  rows.push(
    {
      field: 'name',
      local: n.name,
      server: sName,
      differs: serverPending || n.name !== server?.name,
    },
    {
      field: 'nodeTypeId',
      local: n.nodeTypeId,
      server: sType,
      differs: serverPending || n.nodeTypeId !== server?.nodeTypeId,
    },
    {
      field: 'parentNodeId',
      local: n.parentNodeId ?? 'null',
      server: sParent,
      differs:
        serverPending ||
        (n.parentNodeId ?? null) !== (server?.parentNodeId ?? null),
    }
  )
  rows.push(
    ...attrsFieldRows(
      serializeNodeAttrs(n.parsedAttrs),
      server?.attrs,
      'attrs',
      serverPending
    )
  )
  return rows
}

function linkRows(
  c: BatchConflictItem,
  l: EditorLink | undefined,
  server: LinkResponse | null,
  serverPending: boolean
): ConflictFieldRow[] {
  const rows: ConflictFieldRow[] = [
    {
      field: 'timestamps.clientBaseUpdatedAt',
      local: displayInstant(c.clientBaseUpdatedAt),
      server: displayInstant(c.serverUpdatedAt),
      differs: c.clientBaseUpdatedAt !== c.serverUpdatedAt,
    },
  ]
  if (!l) {
    rows.push({
      field: 'entity',
      local: '—',
      server: serverPending ? '…' : '—',
      differs: true,
    })
    return rows
  }
  const sSrc = serverPending ? '…' : (server?.sourceId ?? '—')
  const sTgt = serverPending ? '…' : (server?.targetId ?? '—')
  const sLt = serverPending ? '…' : (server?.linkTypeId ?? '—')
  rows.push(
    {
      field: 'sourceId',
      local: l.sourceId,
      server: sSrc,
      differs: serverPending || l.sourceId !== server?.sourceId,
    },
    {
      field: 'targetId',
      local: l.targetId,
      server: sTgt,
      differs: serverPending || l.targetId !== server?.targetId,
    },
    {
      field: 'linkTypeId',
      local: l.linkTypeId,
      server: sLt,
      differs: serverPending || l.linkTypeId !== server?.linkTypeId,
    }
  )
  rows.push(
    ...attrsFieldRows(serializeLinkAttrs(l.parsedAttrs), server?.attrs, 'attrs', serverPending)
  )
  return rows
}

function formatNodeGeom(n: DiagramNodeInstance): string {
  const w = n.width != null ? String(n.width) : '—'
  const h = n.height != null ? String(n.height) : '—'
  return `(${n.x}, ${n.y}) ${w}×${h}`
}

function nodeInstanceMap(nodes: DiagramNodeInstance[]): Map<string, DiagramNodeInstance> {
  const m = new Map<string, DiagramNodeInstance>()
  for (const n of nodes) m.set(n.modelNodeId, n)
  return m
}

function edgeInstanceMap(edges: DiagramEdgeInstance[]): Map<string, DiagramEdgeInstance> {
  const m = new Map<string, DiagramEdgeInstance>()
  for (const e of edges) m.set(e.modelLinkId, e)
  return m
}

function nodeAttrsWithoutComponentProps(inst: DiagramNodeInstance | undefined): unknown {
  if (!inst?.attrs) return {}
  const { componentProperties: _c, ...rest } = inst.attrs
  return Object.keys(rest).length > 0 ? rest : {}
}

function edgeAttrsWithoutRelationProps(inst: DiagramEdgeInstance | undefined): unknown {
  if (!inst?.attrs) return {}
  const { relationProperties: _r, ...rest } = inst.attrs
  return Object.keys(rest).length > 0 ? rest : {}
}

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function summarizeComponentPropsReadable(
  st: ModelEditorState,
  cp: ScopedCustomValues | undefined
): string {
  if (!cp || Object.keys(cp).length === 0) return '—'
  const parts: string[] = []
  for (const [, byEntity] of Object.entries(cp)) {
    for (const [entityId, props] of Object.entries(byEntity)) {
      const comp = st.components.find(x => x.id === entityId)
      const label = comp?.name?.trim() || `${entityId.slice(0, 8)}…`
      const keys = Object.keys(props ?? {})
      const kPreview =
        keys.length === 0
          ? ''
          : ` (${keys.slice(0, 6).join(', ')}${keys.length > 6 ? '…' : ''})`
      parts.push(`${label}${kPreview}`)
    }
  }
  return truncateText(parts.join('; '), 220)
}

function summarizeRelationPropsReadable(
  st: ModelEditorState,
  rp: ScopedCustomValues | undefined
): string {
  if (!rp || Object.keys(rp).length === 0) return '—'
  const parts: string[] = []
  for (const [, byEntity] of Object.entries(rp)) {
    for (const [entityId, props] of Object.entries(byEntity)) {
      const rel = st.relations.find(x => x.id === entityId)
      const label = rel?.name?.trim() || `${entityId.slice(0, 8)}…`
      const keys = Object.keys(props ?? {})
      const kPreview =
        keys.length === 0
          ? ''
          : ` (${keys.slice(0, 6).join(', ')}${keys.length > 6 ? '…' : ''})`
      parts.push(`${label}${kPreview}`)
    }
  }
  return truncateText(parts.join('; '), 220)
}

function diagramAttrsSemanticDiffRows(
  st: ModelEditorState,
  localA: DiagramAttrs,
  serverA: DiagramAttrs,
  serverPending: boolean,
  translate?: ConflictTranslateFn
): ConflictFieldRow[] {
  const rows: ConflictFieldRow[] = []
  const t = (key: string, params?: Record<string, string | number>): string => {
    if (translate) return translate(key, params)
    const tail = params ? ` ${JSON.stringify(params)}` : ''
    return `${key}${tail}`
  }

  const ln = localA.instances?.nodes?.length ?? 0
  const le = localA.instances?.edges?.length ?? 0
  const sn = serverPending ? 0 : (serverA.instances?.nodes?.length ?? 0)
  const se = serverPending ? 0 : (serverA.instances?.edges?.length ?? 0)

  if (serverPending) {
    rows.push({
      field: 'diagram.canvas.pending',
      fieldLabel: t('models.batchSaveConflictDiagramCanvasPending'),
      local: t('models.batchSaveConflictDiagramCanvasCounts', { nodes: ln, edges: le }),
      server: '…',
      differs: true,
    })
    return rows
  }

  const locDoc = localA.documentFileId ?? ''
  const srvDoc = serverA.documentFileId ?? ''
  if (locDoc !== srvDoc) {
    rows.push({
      field: 'diagram.attrs.documentFileId',
      fieldLabel: t('models.batchSaveConflictDiagramDocFile'),
      local: locDoc || '—',
      server: srvDoc || '—',
      differs: true,
    })
  }

  const locNodes = nodeInstanceMap(localA.instances?.nodes ?? [])
  const srvNodes = nodeInstanceMap(serverA.instances?.nodes ?? [])
  const allNodeIds = new Set([...locNodes.keys(), ...srvNodes.keys()])
  const sortedNodeIds = Array.from(allNodeIds).sort()

  for (const mid of sortedNodeIds) {
    const loc = locNodes.get(mid)
    const srv = srvNodes.get(mid)
    const name = nodeDisplayNameForConflict(st, mid, translate)

    if (loc && !srv) {
      rows.push({
        field: `diagram.canvas.node.${mid}.onlyLocal`,
        fieldLabel: t('models.batchSaveConflictDiagramNodeOnlyLocal', { name }),
        local: t('models.batchSaveConflictDiagramOnCanvas'),
        server: '—',
        differs: true,
      })
      continue
    }
    if (!loc && srv) {
      rows.push({
        field: `diagram.canvas.node.${mid}.onlyServer`,
        fieldLabel: t('models.batchSaveConflictDiagramNodeOnlyServer', { name }),
        local: '—',
        server: t('models.batchSaveConflictDiagramOnCanvas'),
        differs: true,
      })
      continue
    }
    if (loc && srv) {
      if (formatNodeGeom(loc) !== formatNodeGeom(srv)) {
        rows.push({
          field: `diagram.canvas.node.${mid}.geom`,
          fieldLabel: t('models.batchSaveConflictDiagramNodeGeom', { name }),
          local: formatNodeGeom(loc),
          server: formatNodeGeom(srv),
          differs: true,
        })
      }
      const lc = loc.attrs?.componentProperties
      const sc = srv.attrs?.componentProperties
      if (stableStringify(lc) !== stableStringify(sc)) {
        rows.push({
          field: `diagram.canvas.node.${mid}.componentProps`,
          fieldLabel: t('models.batchSaveConflictDiagramNodeComponentProps', { name }),
          local: summarizeComponentPropsReadable(st, lc),
          server: summarizeComponentPropsReadable(st, sc),
          differs: true,
        })
      }
      const lo = nodeAttrsWithoutComponentProps(loc)
      const so = nodeAttrsWithoutComponentProps(srv)
      if (stableStringify(lo) !== stableStringify(so)) {
        rows.push({
          field: `diagram.canvas.node.${mid}.otherAttrs`,
          fieldLabel: t('models.batchSaveConflictDiagramNodeOtherAttrs', { name }),
          local: truncateText(stableStringify(lo), 220),
          server: truncateText(stableStringify(so), 220),
          differs: true,
        })
      }
    }
  }

  const locEdges = edgeInstanceMap(localA.instances?.edges ?? [])
  const srvEdges = edgeInstanceMap(serverA.instances?.edges ?? [])
  const allLinkIds = new Set([...locEdges.keys(), ...srvEdges.keys()])
  const sortedLinkIds = Array.from(allLinkIds).sort()

  for (const lid of sortedLinkIds) {
    const loc = locEdges.get(lid)
    const srv = srvEdges.get(lid)
    const lineFor = (edge: DiagramEdgeInstance | undefined, attrs: DiagramAttrs): string =>
      canvasEdgeDisplayLine(st, attrs, edge, lid, translate)

    if (loc && !srv) {
      rows.push({
        field: `diagram.canvas.edge.${lid}.onlyLocal`,
        fieldLabel: t('models.batchSaveConflictDiagramEdgeOnlyLocal', { link: lineFor(loc, localA) }),
        local: t('models.batchSaveConflictDiagramOnCanvas'),
        server: '—',
        differs: true,
      })
      continue
    }
    if (!loc && srv) {
      rows.push({
        field: `diagram.canvas.edge.${lid}.onlyServer`,
        fieldLabel: t('models.batchSaveConflictDiagramEdgeOnlyServer', { link: lineFor(srv, serverA) }),
        local: '—',
        server: t('models.batchSaveConflictDiagramOnCanvas'),
        differs: true,
      })
      continue
    }
    if (loc && srv) {
      const lr = loc.attrs?.relationProperties
      const sr = srv.attrs?.relationProperties
      if (stableStringify(lr) !== stableStringify(sr)) {
        rows.push({
          field: `diagram.canvas.edge.${lid}.relationProps`,
          fieldLabel: t('models.batchSaveConflictDiagramEdgeRelationProps', {
            link: lineFor(loc, localA),
          }),
          local: summarizeRelationPropsReadable(st, lr),
          server: summarizeRelationPropsReadable(st, sr),
          differs: true,
        })
      }
      const lo = edgeAttrsWithoutRelationProps(loc)
      const so = edgeAttrsWithoutRelationProps(srv)
      if (stableStringify(lo) !== stableStringify(so)) {
        rows.push({
          field: `diagram.canvas.edge.${lid}.otherAttrs`,
          fieldLabel: t('models.batchSaveConflictDiagramEdgeOtherAttrs', {
            link: lineFor(loc, localA),
          }),
          local: truncateText(stableStringify(lo), 220),
          server: truncateText(stableStringify(so), 220),
          differs: true,
        })
      }
    }
  }

  /** Ребро в attrs есть, а модельной связи в state.links уже нет (часто poll); JSON локально и на сервере может совпадать — отдельная строка. */
  for (const edge of localA.instances?.edges ?? []) {
    if (edge.attrs?.isDiagramOnly === true) continue
    if (edge.modelLinkId.startsWith(DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX)) continue
    if (editorHasModelLinkRow(st, edge.modelLinkId)) continue
    const lid = edge.modelLinkId
    if (rows.some(r => r.field.startsWith(`diagram.canvas.edge.${lid}.`))) continue
    rows.push({
      field: `diagram.canvas.edge.${lid}.orphanNoModelLink`,
      fieldLabel: t('models.batchSaveConflictDiagramEdgeOrphanTitle', {
        link: canvasEdgeDisplayLine(st, localA, edge, lid, translate),
      }),
      local: t('models.batchSaveConflictDiagramOrphanLocalCol'),
      server: srvEdges.has(lid)
        ? t('models.batchSaveConflictDiagramOrphanServerAlsoInJson')
        : t('models.batchSaveConflictDiagramOrphanServerNotInJson'),
      differs: true,
    })
  }

  const wholeInstLocal = stableStringify(localA.instances)
  const wholeInstSrv = stableStringify(serverA.instances)
  if (rows.length === 0 && wholeInstLocal !== wholeInstSrv) {
    rows.push({
      field: 'diagram.canvas.fallback',
      fieldLabel: t('models.batchSaveConflictDiagramCanvasChanged'),
      local: t('models.batchSaveConflictDiagramCanvasCounts', { nodes: ln, edges: le }),
      server: t('models.batchSaveConflictDiagramCanvasCounts', { nodes: sn, edges: se }),
      differs: true,
    })
  }

  return rows
}

function diagramRows(
  c: BatchConflictItem,
  d: EditorDiagram | undefined,
  server: DiagramResponse | null,
  serverPending: boolean,
  st: ModelEditorState,
  translate?: ConflictTranslateFn
): ConflictFieldRow[] {
  const rows: ConflictFieldRow[] = [
    {
      field: 'timestamps.clientBaseUpdatedAt',
      local: displayInstant(c.clientBaseUpdatedAt),
      server: displayInstant(c.serverUpdatedAt),
      differs: c.clientBaseUpdatedAt !== c.serverUpdatedAt,
    },
  ]
  if (!d) {
    rows.push({
      field: 'entity',
      local: '—',
      server: serverPending ? '…' : '—',
      differs: true,
    })
    return rows
  }
  const sv = (f: keyof DiagramResponse): string =>
    serverPending ? '…' : stableStringify(server?.[f] ?? null)
  rows.push(
    {
      field: 'name',
      local: d.name,
      server: serverPending ? '…' : (server?.name ?? '—'),
      differs: serverPending || d.name !== server?.name,
    },
    {
      field: 'version',
      local: d.version,
      server: serverPending ? '…' : (server?.version ?? '—'),
      differs: serverPending || d.version !== server?.version,
    },
    {
      field: 'notationId',
      local: d.notationId,
      server: sv('notationId'),
      differs: serverPending || d.notationId !== server?.notationId,
    },
    {
      field: 'nodeId',
      local: d.nodeId ?? 'null',
      server: serverPending ? '…' : (server?.nodeId ?? 'null'),
      differs: serverPending || (d.nodeId ?? null) !== (server?.nodeId ?? null),
    }
  )
  const serverAttrsParsed = serverPending
    ? ({ instances: { nodes: [], edges: [] } } as DiagramAttrs)
    : canonicalDiagramAttrsForConflictCompare(parseDiagramAttrs(server?.attrs ?? null))
  const localAttrsCanonical = canonicalDiagramAttrsForConflictCompare(d.parsedAttrs)
  rows.push(
    ...diagramAttrsSemanticDiffRows(st, localAttrsCanonical, serverAttrsParsed, serverPending, translate)
  )
  return rows
}

export function buildConflictCompareRows(
  c: BatchConflictItem,
  st: ModelEditorState,
  serverEntity: NodeResponse | LinkResponse | DiagramResponse | null,
  serverLoading: boolean,
  _serverError: string | null,
  translate?: ConflictTranslateFn
): ConflictFieldRow[] {
  /** Пока идёт GET — «…»; после ошибки (например 404) сущность null — поля сравнения показывают расхождение с пустым сервером. */
  const pending = serverLoading
  if (c.kind === 'node') {
    const n = st.nodes.find(x => x.id === c.id)
    return nodeRows(c, n, serverEntity as NodeResponse | null, pending)
  }
  if (c.kind === 'link') {
    const l = st.links.find(x => x.id === c.id)
    return linkRows(c, l, serverEntity as LinkResponse | null, pending)
  }
  if (c.kind === 'diagram') {
    const d = st.diagrams.find(x => x.id === c.id)
    return diagramRows(c, d, serverEntity as DiagramResponse | null, pending, st, translate)
  }
  return []
}

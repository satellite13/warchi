import type { ApiResult } from '@/api/apiClient'
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

const DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX = '__diagram-note-edge__:'

export type ApiGetFn = <T>(path: string) => Promise<ApiResult<T>>

/** Строка таблицы «поле — у вас — на сервере» для одной конфликтной сущности. */
export type ConflictFieldRow = {
  field: string
  /** Подпись строки (i18n); если нет — в UI показывается `field`. */
  fieldLabel?: string
  local: string
  server: string
  differs: boolean
}

/** Перевод строк сравнения (ключи `models.*`). */
export type ConflictTranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string

export function batchConflictCompareKey(c: BatchConflictItem): string {
  return `${c.kind}:${c.id}`
}

/** Только расходящиеся поля; строку меток времени не показываем — она дублирует подпись над списком. */
export function filterConflictCompareRowsForUi(rows: ConflictFieldRow[]): ConflictFieldRow[] {
  return rows.filter(r => r.differs && !r.field.startsWith('timestamps.'))
}

function displayInstant(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso
}

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

/** Короткий идентификатор для подписи (UUID → префикс…). */
function formatEntityIdShort(id: string): string {
  if (!id) return '—'
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function nodeTypeLabelForConflict(st: ModelEditorState, nodeTypeId: string): string {
  const nt = st.nodeTypes.find(x => x.id === nodeTypeId)
  const label = nt?.name?.trim()
  return label && label.length > 0 ? label : formatEntityIdShort(nodeTypeId)
}

/** Подпись узла в текстах конфликта: имя, иначе тип ноды, иначе «нет в модели». */
function nodeDisplayNameForConflict(
  st: ModelEditorState,
  modelNodeId: string,
  translate?: ConflictTranslateFn
): string {
  const n =
    st.nodes.find(x => x.id === modelNodeId && !x._isDeleted) ??
    st.nodes.find(x => x.id === modelNodeId)

  if (!n) {
    const id = formatEntityIdShort(modelNodeId)
    return translate
      ? translate('models.batchSaveConflictUnknownNode', { id })
      : `? ${id}`
  }

  const typeLabel = nodeTypeLabelForConflict(st, n.nodeTypeId)
  const namePart = n.name?.trim()

  if (namePart && namePart.length > 0) {
    if (typeLabel && namePart.length <= 2 && namePart !== typeLabel) {
      return `${namePart} (${typeLabel})`
    }
    return namePart
  }

  return typeLabel
}

function linkDisplayLineForConflict(
  st: ModelEditorState,
  modelLinkId: string,
  translate?: ConflictTranslateFn
): string {
  const l =
    st.links.find(x => x.id === modelLinkId && !x._isDeleted) ??
    st.links.find(x => x.id === modelLinkId)
  if (!l) {
    const id = formatEntityIdShort(modelLinkId)
    return translate
      ? translate('models.batchSaveConflictUnknownLink', { id })
      : id
  }
  const src = nodeDisplayNameForConflict(st, l.sourceId, translate)
  const tgt = nodeDisplayNameForConflict(st, l.targetId, translate)
  const lt = st.linkTypes.find(x => x.id === l.linkTypeId)
  const tn = lt?.name?.trim()
  const linkTypeLabel = tn && tn.length > 0 ? tn : formatEntityIdShort(l.linkTypeId)
  return `${linkTypeLabel}: ${src} → ${tgt}`
}

function editorHasModelLinkRow(st: ModelEditorState, modelLinkId: string): boolean {
  return !!(
    st.links.find(x => x.id === modelLinkId && !x._isDeleted) ??
    st.links.find(x => x.id === modelLinkId)
  )
}

function modelNodeActiveInTree(st: ModelEditorState, modelNodeId: string): boolean {
  const n = st.nodes.find(x => x.id === modelNodeId && !x._isDeleted)
  return !!n
}

/**
 * Оба конца ребра на холсте указывают на ноды, которые сейчас есть в дереве модели.
 * Если нет — чаще всего устаревшие экземпляры в JSON диаграммы (после удаления нод / рассинхрона);
 * такие строки в предупреждении о «связи нет на сервере» только шумят.
 */
function canvasModelEdgeBothEndpointsInTree(
  st: ModelEditorState,
  diagramAttrs: DiagramAttrs,
  edge: DiagramEdgeInstance
): boolean {
  const nodes = diagramAttrs.instances?.nodes ?? []
  const src = nodes.find(n => n.id === edge.sourceInstanceId)
  const tgt = nodes.find(n => n.id === edge.targetInstanceId)
  if (!src || !tgt) return false
  return modelNodeActiveInTree(st, src.modelNodeId) && modelNodeActiveInTree(st, tgt.modelNodeId)
}

/**
 * Подпись ребра в конфликте диаграммы: если связь уже убрана из state (например poll после удаления
 * на сервере), строим «какой экземпляр с каким» по холсту и явно говорим, что модельной связи в редакторе нет.
 */
function canvasEdgeDisplayLine(
  st: ModelEditorState,
  diagramAttrs: DiagramAttrs,
  edge: DiagramEdgeInstance | undefined,
  modelLinkId: string,
  translate?: ConflictTranslateFn
): string {
  if (editorHasModelLinkRow(st, modelLinkId)) {
    return linkDisplayLineForConflict(st, modelLinkId, translate)
  }
  let topo = ''
  if (edge) {
    const nodes = diagramAttrs.instances?.nodes ?? []
    const src = nodes.find(n => n.id === edge.sourceInstanceId)
    const tgt = nodes.find(n => n.id === edge.targetInstanceId)
    if (src && tgt) {
      const a = nodeDisplayNameForConflict(st, src.modelNodeId, translate)
      const b = nodeDisplayNameForConflict(st, tgt.modelNodeId, translate)
      topo = translate
        ? translate('models.batchSaveConflictDiagramEdgeBetweenNodes', { from: a, to: b })
        : `${a} → ${b}`
    }
  }
  const base =
    topo ||
    (translate
      ? translate('models.batchSaveConflictDiagramEdgeLinkId', { id: formatEntityIdShort(modelLinkId) })
      : formatEntityIdShort(modelLinkId))
  const hint = translate
    ? translate('models.batchSaveConflictDiagramEdgeLinkMissingHint')
    : 'link not in editor'
  return `${base} — ${hint}`
}

/**
 * Рёбра на диаграммах с modelLinkId, которого нет среди связей на сервере.
 * Учитываются только рёбра, у которых **оба** конца — экземпляры нод, всё ещё присутствующих в дереве модели;
 * иначе это обычно хвосты в JSON диаграммы и только засоряют список.
 *
 * @param onlyDiagramId — если задан id неудалённой диаграммы, учитывается только её холст (остальные диаграммы в списке не попадают в предупреждение).
 */
export type MissingServerLinkOnCanvasRow = {
  /** Id модельной связи, которой нет на сервере (одна строка UI на id). */
  modelLinkId: string
  /** Диаграммы, на холсте которых есть ребро с этим modelLinkId. */
  diagramNames: string[]
  edgeSummary: string
}

export function computeMissingServerLinksOnCanvas(
  st: ModelEditorState,
  serverLinkIds: ReadonlySet<string>,
  translate?: ConflictTranslateFn,
  onlyDiagramId?: string | null
): MissingServerLinkOnCanvasRow[] {
  const byLinkId = new Map<
    string,
    { diagramNames: Set<string>; edgeSummary: string | null; seenPerDiagram: Set<string> }
  >()

  for (const d of st.diagrams) {
    if (d._isDeleted) continue
    if (onlyDiagramId != null && onlyDiagramId !== '' && d.id !== onlyDiagramId) continue
    const diagramLabel = d.name.trim() || `${d.id.slice(0, 8)}…`
    for (const edge of d.parsedAttrs.instances?.edges ?? []) {
      if (edge.attrs?.isDiagramOnly === true) continue
      if (edge.modelLinkId.startsWith(DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX)) continue
      const lid = edge.modelLinkId
      if (serverLinkIds.has(lid)) continue

      const localLink = st.links.find(l => l.id === lid && !l._isDeleted)
      if (localLink?._isNew) continue

      if (!canvasModelEdgeBothEndpointsInTree(st, d.parsedAttrs, edge)) continue

      const dedupeKey = `${d.id}:${lid}`
      let acc = byLinkId.get(lid)
      if (!acc) {
        acc = { diagramNames: new Set(), edgeSummary: null, seenPerDiagram: new Set() }
        byLinkId.set(lid, acc)
      }
      if (acc.seenPerDiagram.has(dedupeKey)) continue
      acc.seenPerDiagram.add(dedupeKey)

      acc.diagramNames.add(diagramLabel)
      if (!acc.edgeSummary) {
        acc.edgeSummary = canvasEdgeDisplayLine(st, d.parsedAttrs, edge, lid, translate)
      }
    }
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  return Array.from(byLinkId.entries())
    .map(([modelLinkId, acc]) => ({
      modelLinkId,
      diagramNames: [...acc.diagramNames].sort((a, b) => collator.compare(a, b)),
      edgeSummary: acc.edgeSummary ?? modelLinkId,
    }))
    .sort((a, b) => {
      const da = a.diagramNames[0] ?? ''
      const db = b.diagramNames[0] ?? ''
      const c = collator.compare(da, db)
      if (c !== 0) return c
      return a.modelLinkId.localeCompare(b.modelLinkId)
    })
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

export type ServerConflictEntity = NodeResponse | LinkResponse | DiagramResponse

export async function fetchServerConflictEntity(
  c: BatchConflictItem,
  apiGet: ApiGetFn
): Promise<
  { ok: true; data: ServerConflictEntity } | { ok: false; error: string }
> {
  const enc = encodeURIComponent(c.id)
  if (c.kind === 'node') {
    const r = await apiGet<NodeResponse>(`/nodes/${enc}`)
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message }
  }
  if (c.kind === 'link') {
    const r = await apiGet<LinkResponse>(`/links/${enc}`)
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message }
  }
  if (c.kind === 'diagram') {
    const r = await apiGet<DiagramResponse>(`/diagrams/${enc}`)
    return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.message }
  }
  return { ok: false, error: 'unknown kind' }
}

/** @deprecated оставлено для тестов совместимости сериализации */
export function formatLocalConflictPayload(c: BatchConflictItem, st: ModelEditorState): string {
  if (c.kind === 'node') {
    const n = st.nodes.find(x => x.id === c.id)
    if (!n) return ''
    return serializeNodeAttrs(n.parsedAttrs)
  }
  if (c.kind === 'link') {
    const l = st.links.find(x => x.id === c.id)
    if (!l) return ''
    return serializeLinkAttrs(l.parsedAttrs)
  }
  if (c.kind === 'diagram') {
    const d = st.diagrams.find(x => x.id === c.id)
    if (!d) return ''
    return serializeDiagramAttrs(d.parsedAttrs)
  }
  return ''
}

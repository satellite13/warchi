import type { BatchConflictItem } from '../composables'
import {
  type DiagramAttrs,
  type DiagramEdgeInstance,
  serializeDiagramAttrs,
  serializeLinkAttrs,
  serializeNodeAttrs,
} from '../modelAttrs'
import type { EditorLink, EditorNode, ModelEditorState } from '../types'

export const DIAGRAM_NOTE_EDGE_MODEL_LINK_PREFIX = '__diagram-note-edge__:'

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

/**
 * Рёбра на диаграммах с modelLinkId, которого нет среди связей на сервере.
 * Одна строка UI соответствует одному modelLinkId.
 */
export type MissingServerLinkOnCanvasRow = {
  /** Id модельной связи, которой нет на сервере. */
  modelLinkId: string
  /** Диаграммы, на холсте которых есть ребро с этим modelLinkId. */
  diagramNames: string[]
  edgeSummary: string
}

export function batchConflictCompareKey(c: BatchConflictItem): string {
  return `${c.kind}:${c.id}`
}

/** Только расходящиеся поля; строку меток времени не показываем — она дублирует подпись над списком. */
export function filterConflictCompareRowsForUi(rows: ConflictFieldRow[]): ConflictFieldRow[] {
  return rows.filter(r => r.differs && !r.field.startsWith('timestamps.'))
}

export function displayInstant(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso
}

export function stableStringify(value: unknown): string {
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

/** Короткий идентификатор для подписи (UUID → префикс…). */
export function formatEntityIdShort(id: string): string {
  if (!id) return '—'
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function nodeTypeLabelForConflict(st: ModelEditorState, nodeTypeId: string): string {
  const nt = st.nodeTypes.find(x => x.id === nodeTypeId)
  const label = nt?.name?.trim()
  return label && label.length > 0 ? label : formatEntityIdShort(nodeTypeId)
}

/** Подпись узла в текстах конфликта: имя, иначе тип ноды, иначе «нет в модели». */
export function nodeDisplayNameForConflict(
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

export function editorHasModelLinkRow(st: ModelEditorState, modelLinkId: string): boolean {
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
export function canvasEdgeDisplayLine(
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

/** @deprecated оставлено для тестов совместимости сериализации */
export function formatLocalConflictPayload(c: BatchConflictItem, st: ModelEditorState): string {
  if (c.kind === 'node') {
    const n: EditorNode | undefined = st.nodes.find(x => x.id === c.id)
    if (!n) return ''
    return serializeNodeAttrs(n.parsedAttrs)
  }
  if (c.kind === 'link') {
    const l: EditorLink | undefined = st.links.find(x => x.id === c.id)
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

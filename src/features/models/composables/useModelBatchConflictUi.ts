import { computed, ref, watch, type Ref } from 'vue'
import { apiGet } from '@/composables/useApi'
import { fetchAllPages } from '@/api/fetchAllPages'
import type { LinkResponse } from '@/types/api'
import { formatDate } from '@/utils/formatDate'
import type { BatchConflictItem } from './useModelBatchSave'
import type { ModelEditorState } from '../types'
import {
  batchConflictCompareKey,
  buildConflictCompareRows,
  computeMissingServerLinksOnCanvas,
  fetchServerConflictEntity,
  filterConflictCompareRowsForUi,
  type ConflictTranslateFn,
  type MissingServerLinkOnCanvasRow,
} from '../utils/batchSaveConflictDisplay'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

function conflictShortId(id: string): string {
  if (id.length <= 13) return id
  return `${id.slice(0, 8)}…`
}

function formatBatchCrossLinkDiagramNames(names: readonly string[]): string {
  return names.map(n => `«${n}»`).join(', ')
}

export function useModelBatchConflictUi(options: {
  state: Ref<ModelEditorState>
  batchSaveConflict: Ref<BatchConflictItem[] | null>
  selectedDiagramId: Ref<string | null>
  locale: Ref<string>
  t: TranslateFn
  resolveBatchSaveReload: () => Promise<void>
  resolveBatchSaveOverwrite: () => Promise<boolean | void>
}) {
  const batchConflictFieldT: ConflictTranslateFn = (key, params) =>
    String(options.t(key, (params ?? {}) as Record<string, unknown>))

  const diagramConflictOpenBaselineUpdatedAt = ref<Record<string, string>>({})

  watch(
    () => options.state.value.modelId,
    () => {
      diagramConflictOpenBaselineUpdatedAt.value = {}
    }
  )

  watch(
    () => options.selectedDiagramId.value,
    id => {
      if (!id) return
      const d = options.state.value.diagrams.find(x => x.id === id && !x._isDeleted)
      const u = d?.updatedAt
      if (typeof u === 'string' && u.length > 0) {
        diagramConflictOpenBaselineUpdatedAt.value = {
          ...diagramConflictOpenBaselineUpdatedAt.value,
          [id]: u,
        }
      }
    },
    { flush: 'post', immediate: true }
  )

  /** После сохранения `updatedAt` обновляется, вкладка та же — синхронизируем baseline для подсказок в модалке конфликта. */
  watch(
    () => {
      const id = options.selectedDiagramId.value
      if (!id) return null
      const d = options.state.value.diagrams.find(x => x.id === id && !x._isDeleted)
      if (!d || d._isDirty) return null
      const u = d.updatedAt
      if (typeof u !== 'string' || !u.length) return null
      return { id, u }
    },
    v => {
      if (!v) return
      diagramConflictOpenBaselineUpdatedAt.value = {
        ...diagramConflictOpenBaselineUpdatedAt.value,
        [v.id]: v.u,
      }
    },
    { flush: 'post' }
  )

  function batchConflictKindLabel(kind: string): string {
    switch (kind) {
      case 'node':
        return options.t('models.batchSaveConflictKindNode')
      case 'link':
        return options.t('models.batchSaveConflictKindLink')
      case 'diagram':
        return options.t('models.batchSaveConflictKindDiagram')
      default:
        return kind
    }
  }

  function batchConflictNodeContextLine(c: BatchConflictItem): string | null {
    if (c.kind !== 'node') return null
    const { nodes, nodeTypes } = options.state.value
    const n =
      nodes.find(x => x.id === c.id && !x._isDeleted) ?? nodes.find(x => x.id === c.id)
    if (!n) return null
    const typeName = nodeTypes.find(nt => nt.id === n.nodeTypeId)?.name?.trim()
    const typePart = typeName
      ? options.t('models.batchSaveConflictNodeTypeLabel', { name: typeName })
      : options.t('models.batchSaveConflictNodeTypeUnknown')
    let parentPart: string
    if (!n.parentNodeId) {
      parentPart = options.t('models.batchSaveConflictNodeRootParent')
    } else {
      const p = nodes.find(x => x.id === n.parentNodeId)
      const parentName = p?.name?.trim()
      parentPart = parentName
        ? options.t('models.batchSaveConflictNodeParentLabel', { name: parentName })
        : options.t('models.batchSaveConflictNodeParentMissing')
    }
    return `${typePart} · ${parentPart}`
  }

  function batchConflictPrimaryLine(c: BatchConflictItem): string {
    const { nodes, links, diagrams, linkTypes } = options.state.value
    if (c.kind === 'node') {
      const n =
        nodes.find(x => x.id === c.id && !x._isDeleted) ?? nodes.find(x => x.id === c.id)
      const name = n?.name?.trim()
      if (name) return name
      if (n) return options.t('models.batchSaveConflictUnnamedNode')
      return options.t('models.batchSaveConflictEntityMissing', { kind: batchConflictKindLabel('node') })
    }
    if (c.kind === 'link') {
      const l =
        links.find(x => x.id === c.id && !x._isDeleted) ?? links.find(x => x.id === c.id)
      if (l) {
        const src = nodes.find(x => x.id === l.sourceId)
        const tgt = nodes.find(x => x.id === l.targetId)
        const srcName = src?.name?.trim() || conflictShortId(l.sourceId)
        const tgtName = tgt?.name?.trim() || conflictShortId(l.targetId)
        const lt = linkTypes.find(x => x.id === l.linkTypeId)
        const typeName = lt?.name?.trim()
        if (typeName) {
          return options.t('models.batchSaveConflictLinkWithType', { type: typeName, from: srcName, to: tgtName })
        }
        return options.t('models.batchSaveConflictLinkLine', { from: srcName, to: tgtName })
      }
      return options.t('models.batchSaveConflictEntityMissing', { kind: batchConflictKindLabel('link') })
    }
    if (c.kind === 'diagram') {
      const d =
        diagrams.find(x => x.id === c.id && !x._isDeleted) ??
        diagrams.find(x => x.id === c.id)
      if (d) {
        return options.t('models.batchSaveConflictDiagramLine', { name: d.name, version: d.version })
      }
      return options.t('models.batchSaveConflictEntityMissing', { kind: batchConflictKindLabel('diagram') })
    }
    return conflictShortId(c.id)
  }

  function batchConflictDetailLine(c: BatchConflictItem): string | null {
    const loc = options.locale.value === 'ru' ? undefined : 'en'
    const your = c.clientBaseUpdatedAt
      ? options.t('models.batchSaveConflictYourBaseTime', {
          time: formatDate(c.clientBaseUpdatedAt, loc),
        })
      : null
    const server = c.serverUpdatedAt
      ? options.t('models.batchSaveConflictServerTime', {
          time: formatDate(c.serverUpdatedAt, loc),
        })
      : null
    if (your && server) return `${your} · ${server}`
    return server ?? your
  }

  async function handleBatchConflictReload(): Promise<void> {
    await options.resolveBatchSaveReload()
  }

  async function handleBatchConflictOverwrite(): Promise<void> {
    await options.resolveBatchSaveOverwrite()
  }

  const batchConflictCompare = ref<
    Record<
      string,
      {
        rows: ReturnType<typeof buildConflictCompareRows>
        serverLoading: boolean
        serverError: string | null
      }
    >
  >({})

  let batchConflictFetchGen = 0
  let batchConflictCrossLinkGen = 0

  const batchConflictCrossLinkWarnings = ref<{
    loading: boolean
    error: string | null
    items: MissingServerLinkOnCanvasRow[]
  }>({ loading: false, error: null, items: [] })

  const batchConflictCrossLinkWarningRows = computed(() => ({
    loading: batchConflictCrossLinkWarnings.value.loading,
    error: batchConflictCrossLinkWarnings.value.error,
    items: batchConflictCrossLinkWarnings.value.items.map((cw, cwi) => ({
      key: `${cw.modelLinkId}-${cwi}`,
      diagramNames: formatBatchCrossLinkDiagramNames(cw.diagramNames),
      edgeSummary: cw.edgeSummary,
    })),
  }))

  /** Id связей на сервере после последнего опроса при открытой модалке конфликта (для пересчёта предупреждений при смене диаграммы). */
  const batchConflictServerLinkIds = ref<ReadonlySet<string> | null>(null)

  function recomputeBatchCrossLinkWarningItems(): void {
    const ids = batchConflictServerLinkIds.value
    if (!ids) return
    const sid = options.selectedDiagramId.value
    const activeDiag = sid
      ? options.state.value.diagrams.find(d => d.id === sid && !d._isDeleted)
      : undefined
    const onlyDiagramId = activeDiag?.id
    const items = computeMissingServerLinksOnCanvas(
      options.state.value,
      ids,
      batchConflictFieldT,
      onlyDiagramId
    )
    batchConflictCrossLinkWarnings.value = {
      ...batchConflictCrossLinkWarnings.value,
      items,
    }
  }

  watch(
    () => options.batchSaveConflict.value,
    list => {
      batchConflictFetchGen += 1
      const gen = batchConflictFetchGen
      if (!list?.length) {
        batchConflictCompare.value = {}
        batchConflictCrossLinkGen += 1
        batchConflictServerLinkIds.value = null
        batchConflictCrossLinkWarnings.value = { loading: false, error: null, items: [] }
        return
      }
      const next: Record<
        string,
        {
          rows: ReturnType<typeof buildConflictCompareRows>
          serverLoading: boolean
          serverError: string | null
        }
      > = {}
      for (const c of list) {
        const key = batchConflictCompareKey(c)
        next[key] = {
          rows: buildConflictCompareRows(c, options.state.value, null, true, null, batchConflictFieldT),
          serverLoading: true,
          serverError: null,
        }
      }
      batchConflictCompare.value = next

      batchConflictCrossLinkGen += 1
      const gCross = batchConflictCrossLinkGen
      batchConflictServerLinkIds.value = null
      batchConflictCrossLinkWarnings.value = { loading: true, error: null, items: [] }
      void (async () => {
        const mid = options.state.value.modelId
        if (!mid) {
          if (gCross === batchConflictCrossLinkGen) {
            batchConflictServerLinkIds.value = null
            batchConflictCrossLinkWarnings.value = { loading: false, error: null, items: [] }
          }
          return
        }
        let collected: LinkResponse[]
        try {
          collected = await fetchAllPages<LinkResponse>(
            '/links',
            { modelId: mid },
            { pageSize: 2000, errorLabel: 'links' },
          )
        } catch (err) {
          if (gCross !== batchConflictCrossLinkGen) return
          batchConflictServerLinkIds.value = null
          batchConflictCrossLinkWarnings.value = {
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            items: [],
          }
          return
        }
        if (gCross !== batchConflictCrossLinkGen) return
        const serverIds = new Set(collected.map(l => l.id))
        batchConflictServerLinkIds.value = serverIds
        batchConflictCrossLinkWarnings.value = { loading: false, error: null, items: [] }
        recomputeBatchCrossLinkWarningItems()
      })()

      void Promise.all(
        list.map(async c => {
          const key = batchConflictCompareKey(c)
          const res = await fetchServerConflictEntity(c, apiGet)
          if (gen !== batchConflictFetchGen) return
          if (!batchConflictCompare.value[key]) return
          batchConflictCompare.value = {
            ...batchConflictCompare.value,
            [key]: {
              serverLoading: false,
              serverError: res.ok ? null : res.error,
              rows: buildConflictCompareRows(
                c,
                options.state.value,
                res.ok ? res.data : null,
                false,
                res.ok ? null : res.error,
                batchConflictFieldT
              ),
            },
          }
        })
      )
    }
  )

  watch(
    () => options.selectedDiagramId.value,
    () => {
      recomputeBatchCrossLinkWarningItems()
    }
  )

  const batchSaveConflictRows = computed(() => {
    const list = options.batchSaveConflict.value
    if (!list?.length) return []
    return list.map((c, idx) => {
      const key = batchConflictCompareKey(c)
      const cmp = batchConflictCompare.value[key]
      const rawRows = cmp?.rows ?? []
      const compareServerLoading = cmp?.serverLoading ?? true
      const compareServerError = cmp?.serverError ?? null
      const compareRows = compareServerLoading
        ? []
        : filterConflictCompareRowsForUi(rawRows)
      const compareOnlyTimestampDiff =
        !compareServerLoading &&
        compareRows.length === 0 &&
        rawRows.some(r => r.differs)
      const openBaseline = diagramConflictOpenBaselineUpdatedAt.value[c.id]
      const compareTimestampOnlySinceDiagramOpen =
        compareOnlyTimestampDiff &&
        c.kind === 'diagram' &&
        c.clientBaseUpdatedAt != null &&
        openBaseline === c.clientBaseUpdatedAt
      return {
        key: `${c.kind}-${c.id}-${idx}`,
        kindLabel: batchConflictKindLabel(c.kind),
        primary: batchConflictPrimaryLine(c),
        context: batchConflictNodeContextLine(c),
        detail: batchConflictDetailLine(c),
        compareRows,
        compareServerLoading,
        compareServerError,
        compareOnlyTimestampDiff,
        compareTimestampOnlySinceDiagramOpen,
      }
    })
  })

  return {
    batchSaveConflictRows,
    batchConflictCrossLinkWarningRows,
    handleBatchConflictReload,
    handleBatchConflictOverwrite,
  }
}

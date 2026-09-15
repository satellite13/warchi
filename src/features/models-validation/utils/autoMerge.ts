import type { DuplicateLinkGroup, DuplicateNodeGroup } from '../types'
import { fetchMergeLinksPreview, fetchMergeNodesPreview, mergeLinks } from '../api'
import { mergeNodesWithOefDecision } from './persistOefMergeDecision'

export type AutoMergeProgress = { done: number; total: number }

export type AutoMergeSkipReason = 'hasChildren' | 'hasDocuments' | 'propsDiffer' | 'error'

export type AutoMergePropsPolicy = 'skip' | 'keep' | 'fillEmpty'
export type AutoMergeChildrenPolicy = 'skip' | 'reparent'

export type AutoMergeOptions = {
  includeLinks: boolean
  propsPolicy: AutoMergePropsPolicy
  childrenPolicy: AutoMergeChildrenPolicy
}

export const defaultAutoMergeOptions: AutoMergeOptions = {
  includeLinks: true,
  propsPolicy: 'skip',
  childrenPolicy: 'skip',
}

export type AutoMergeResult = {
  mergedGroups: number
  skipped: Array<{ title: string; reason: AutoMergeSkipReason; message?: string }>
  aborted?: string
  stoppedByUser?: boolean
}

/** keep value wins; empty/missing keep values are filled from the dropped copy. */
export function fillEmptyProps(
  keep: Record<string, unknown>,
  drop: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(keep ?? {}) }
  for (const [key, value] of Object.entries(drop ?? {})) {
    const current = result[key]
    const currentEmpty = current === undefined || current === null || current === ''
    const valueEmpty = value === undefined || value === null || value === ''
    if (currentEmpty && !valueEmpty) result[key] = value
  }
  return result
}

/**
 * Merges every duplicate group into the member most used in diagrams. Structural
 * conflicts (documents) are always skipped; property and children conflicts follow
 * the chosen policies and are reported back when skipped.
 */
type PlanOutcome =
  { status: 'merged' } | { status: 'nothing' } | { status: 'abort'; message: string }

export async function autoMergeDuplicates(params: {
  modelId: string
  nodeGroups: DuplicateNodeGroup[]
  linkGroups: DuplicateLinkGroup[]
  options?: AutoMergeOptions
  onProgress?: (progress: AutoMergeProgress) => void
  shouldStop?: () => boolean
}): Promise<AutoMergeResult> {
  const options = params.options ?? defaultAutoMergeOptions
  const skipped: AutoMergeResult['skipped'] = []
  let mergedGroups = 0

  const plans: Array<{ title: string; run: () => Promise<PlanOutcome> }> = []
  for (const group of params.nodeGroups) {
    plans.push({
      title: `${group.nodeTypeName} · ${group.name}`,
      run: () => mergeNodeGroup(params.modelId, group, options, skipped),
    })
  }
  if (options.includeLinks) {
    for (const group of params.linkGroups) {
      plans.push({
        title: `${group.sourceName} → ${group.targetName} · ${group.linkTypeName}`,
        run: () => mergeLinkGroup(params.modelId, group, skipped),
      })
    }
  }

  let done = 0
  for (const plan of plans) {
    if (params.shouldStop?.()) {
      return { mergedGroups, skipped, stoppedByUser: true }
    }
    const outcome = await plan.run()
    done += 1
    params.onProgress?.({ done, total: plans.length })
    if (outcome.status === 'abort') {
      return { mergedGroups, skipped, aborted: outcome.message }
    }
    if (outcome.status === 'merged') {
      mergedGroups += 1
    }
  }

  return { mergedGroups, skipped }
}

/**
 * Returns false when the group was fully merged, or an abort message.
 * Skip reasons are appended to `skipped` and do not abort the run.
 */
async function mergeNodeGroup(
  modelId: string,
  group: DuplicateNodeGroup,
  options: AutoMergeOptions,
  skipped: AutoMergeResult['skipped']
): Promise<PlanOutcome> {
  const keep = pickMostUsed(group.nodes)
  if (!keep) return { status: 'nothing' }

  let mergedMembers = 0
  for (const drop of group.nodes) {
    if (drop.id === keep.id) continue

    const preview = await previewOf(() =>
      fetchMergeNodesPreview(modelId, { keepId: keep.id, dropId: drop.id })
    )
    if (!preview.ok) {
      return { status: 'abort', message: preview.message }
    }
    const { data } = preview

    if (data.hasDocuments) {
      skipped.push({ title: group.name, reason: 'hasDocuments' })
      continue
    }
    if (data.hasChildren && options.childrenPolicy === 'skip') {
      skipped.push({ title: group.name, reason: 'hasChildren' })
      continue
    }

    let typeProperties: Record<string, unknown>
    if (options.propsPolicy === 'skip') {
      if (!typePropertiesEqual(data.keepTypeProperties, data.dropTypeProperties)) {
        skipped.push({ title: group.name, reason: 'propsDiffer' })
        continue
      }
      typeProperties = data.keepTypeProperties
    } else if (options.propsPolicy === 'fillEmpty') {
      typeProperties = fillEmptyProps(data.keepTypeProperties, data.dropTypeProperties)
    } else {
      typeProperties = data.keepTypeProperties
    }

    const merged = await mergeOf(() =>
      mergeNodesWithOefDecision(modelId, {
        keepId: keep.id,
        dropId: drop.id,
        typeProperties,
        transferLinkIds: data.uniqueLinks.map(link => link.id),
        reparentChildren:
          data.hasChildren && options.childrenPolicy === 'reparent' ? true : undefined,
        keepUpdatedAt: data.keepUpdatedAt,
        dropUpdatedAt: data.dropUpdatedAt,
      })
    )
    if (!merged.ok) {
      skipped.push({ title: group.name, reason: 'error', message: merged.message })
      if (merged.status === 409) {
        return { status: 'abort', message: merged.message }
      }
      continue
    }
    mergedMembers += 1
  }

  return mergedMembers > 0 ? { status: 'merged' } : { status: 'nothing' }
}

async function mergeLinkGroup(
  modelId: string,
  group: DuplicateLinkGroup,
  skipped: AutoMergeResult['skipped']
): Promise<PlanOutcome> {
  const keep = pickMostUsed(group.links)
  if (!keep) return { status: 'nothing' }

  let mergedMembers = 0
  for (const drop of group.links) {
    if (drop.id === keep.id) continue

    const preview = await previewOf(() =>
      fetchMergeLinksPreview(modelId, { keepId: keep.id, dropId: drop.id })
    )
    if (!preview.ok) {
      return { status: 'abort', message: preview.message }
    }
    const { data } = preview

    if (!typePropertiesEqual(data.keepTypeProperties, data.dropTypeProperties)) {
      skipped.push({
        title: `${group.sourceName} → ${group.targetName}`,
        reason: 'propsDiffer',
      })
      continue
    }

    const merged = await mergeOf(() =>
      mergeLinks(modelId, {
        keepId: keep.id,
        dropId: drop.id,
        typeProperties: data.keepTypeProperties,
        keepUpdatedAt: data.keepUpdatedAt,
        dropUpdatedAt: data.dropUpdatedAt,
      })
    )
    if (!merged.ok) {
      skipped.push({
        title: `${group.sourceName} → ${group.targetName}`,
        reason: 'error',
        message: merged.message,
      })
      if (merged.status === 409) {
        return { status: 'abort', message: merged.message }
      }
      continue
    }
    mergedMembers += 1
  }

  return mergedMembers > 0 ? { status: 'merged' } : { status: 'nothing' }
}

function pickMostUsed<T extends { id: string; diagramCount?: number }>(
  members: T[]
): T | undefined {
  if (members.length < 2) return undefined
  return [...members].sort(
    (a, b) => (b.diagramCount ?? 0) - (a.diagramCount ?? 0) || a.id.localeCompare(b.id)
  )[0]
}

/** Equal when the same value on both copies (missing on both = equal). */
export function typePropertiesEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const key of keys) {
    if (!valuesEqual(a?.[key], b?.[key])) return false
  }
  return true
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const aEmpty = a === undefined || a === null || a === ''
  const bEmpty = b === undefined || b === null || b === ''
  if (aEmpty || bEmpty) return aEmpty && bEmpty
  return JSON.stringify(a) === JSON.stringify(b)
}

type ApiOutcome = { ok: true } | { ok: false; message: string; status?: number }

async function previewOf<T>(
  fetcher: () => Promise<
    { success: true; data: T } | { success: false; error: { message?: string; status?: number } }
  >
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const result = await fetcher()
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, message: result.error.message ?? 'preview failed' }
}

async function mergeOf(
  executor: () => Promise<
    { success: true } | { success: false; error: { message?: string; status?: number } }
  >
): Promise<ApiOutcome> {
  const result = await executor()
  if (result.success) return { ok: true }
  return {
    ok: false,
    message: result.error.message ?? 'merge failed',
    status: result.error.status,
  }
}

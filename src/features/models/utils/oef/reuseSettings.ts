import { loadJson, saveJson } from '@/utils/localStorage'

export type OefEntityImportMode = 'alwaysCreate' | 'reuseMatching'
export type OefLinkMatchCriterion = 'endpointsAndType' | 'endpointsTypeAndLabel'
export type OefOnMatchPolicy = 'reuseId' | 'updateFromOef'

export type OefReuseSettings = {
  nodesMode: OefEntityImportMode
  linksMode: OefEntityImportMode
  linkMatchCriterion: OefLinkMatchCriterion
  onNodeMatch: OefOnMatchPolicy
  onLinkMatch: OefOnMatchPolicy
}

type CachedOefReuseSettings = {
  version: 1
  notationId: string
} & OefReuseSettings

const STORAGE_PREFIX = 'warchi:model-import:oef-reuse'

const MODES = new Set<OefEntityImportMode>(['alwaysCreate', 'reuseMatching'])
const CRITERIA = new Set<OefLinkMatchCriterion>(['endpointsAndType', 'endpointsTypeAndLabel'])
const POLICIES = new Set<OefOnMatchPolicy>(['reuseId', 'updateFromOef'])

export function createDefaultOefReuseSettings(): OefReuseSettings {
  return {
    nodesMode: 'alwaysCreate',
    linksMode: 'alwaysCreate',
    linkMatchCriterion: 'endpointsAndType',
    onNodeMatch: 'reuseId',
    onLinkMatch: 'reuseId',
  }
}

function storageKey(notationId: string): string {
  return `${STORAGE_PREFIX}:${notationId}`
}

function sanitize(raw: Partial<OefReuseSettings> | null | undefined): OefReuseSettings {
  const defaults = createDefaultOefReuseSettings()
  if (!raw) return defaults
  return {
    nodesMode: MODES.has(raw.nodesMode as OefEntityImportMode)
      ? (raw.nodesMode as OefEntityImportMode)
      : defaults.nodesMode,
    linksMode: MODES.has(raw.linksMode as OefEntityImportMode)
      ? (raw.linksMode as OefEntityImportMode)
      : defaults.linksMode,
    linkMatchCriterion: CRITERIA.has(raw.linkMatchCriterion as OefLinkMatchCriterion)
      ? (raw.linkMatchCriterion as OefLinkMatchCriterion)
      : defaults.linkMatchCriterion,
    onNodeMatch: POLICIES.has(raw.onNodeMatch as OefOnMatchPolicy)
      ? (raw.onNodeMatch as OefOnMatchPolicy)
      : defaults.onNodeMatch,
    onLinkMatch: POLICIES.has(raw.onLinkMatch as OefOnMatchPolicy)
      ? (raw.onLinkMatch as OefOnMatchPolicy)
      : defaults.onLinkMatch,
  }
}

export function loadCachedOefReuseSettings(notationId: string): OefReuseSettings | null {
  const raw = loadJson<CachedOefReuseSettings>(storageKey(notationId))
  if (!raw || raw.version !== 1 || raw.notationId !== notationId) return null
  return sanitize(raw)
}

export function saveCachedOefReuseSettings(notationId: string, settings: OefReuseSettings): void {
  const payload: CachedOefReuseSettings = {
    version: 1,
    notationId,
    ...sanitize(settings),
  }
  saveJson(storageKey(notationId), payload)
}

export function mergeOefReuseSettings(
  defaults: OefReuseSettings,
  cached: Partial<OefReuseSettings> | null
): OefReuseSettings {
  if (!cached) return defaults
  return sanitize({ ...defaults, ...cached })
}

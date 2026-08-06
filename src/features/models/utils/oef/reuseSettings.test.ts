import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultOefReuseSettings,
  loadCachedOefReuseSettings,
  mergeOefReuseSettings,
  saveCachedOefReuseSettings,
  type OefReuseSettings,
} from './reuseSettings'

describe('reuseSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults', () => {
    expect(createDefaultOefReuseSettings()).toEqual({
      nodesMode: 'alwaysCreate',
      linksMode: 'alwaysCreate',
      linkMatchCriterion: 'endpointsAndType',
      onNodeMatch: 'reuseId',
      onLinkMatch: 'reuseId',
    })
  })

  it('round-trips cache per notationId', () => {
    const settings: OefReuseSettings = {
      nodesMode: 'reuseMatching',
      linksMode: 'reuseMatching',
      linkMatchCriterion: 'endpointsTypeAndLabel',
      onNodeMatch: 'updateFromOef',
      onLinkMatch: 'reuseId',
    }
    saveCachedOefReuseSettings('notation-1', settings)
    expect(loadCachedOefReuseSettings('notation-1')).toEqual(settings)
    expect(loadCachedOefReuseSettings('other')).toBeNull()
  })

  it('merges cached over defaults and drops invalid enums', () => {
    const merged = mergeOefReuseSettings(createDefaultOefReuseSettings(), {
      nodesMode: 'reuseMatching',
      linksMode: 'nope' as OefReuseSettings['linksMode'],
      linkMatchCriterion: 'endpointsAndType',
      onNodeMatch: 'reuseId',
      onLinkMatch: 'updateFromOef',
    })
    expect(merged.nodesMode).toBe('reuseMatching')
    expect(merged.linksMode).toBe('alwaysCreate')
    expect(merged.onLinkMatch).toBe('updateFromOef')
  })
})

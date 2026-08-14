import { describe, expect, it } from 'vitest'
import type { ApiKey } from '@/types/apiKeys'
import { formatApiKeySummary } from './apiKeySummary'

const t = (key: string, values?: Record<string, unknown>): string =>
  values ? `${key}:${JSON.stringify(values)}` : key

function key(partial: Partial<ApiKey>): ApiKey {
  return {
    id: '1',
    name: 'k',
    tokenPrefix: 'warchi_ak_',
    mode: 'all',
    scopes: ['models:read'],
    createdAt: '',
    ...partial,
  } as ApiKey
}

describe('formatApiKeySummary', () => {
  it('summarizes all-access read and write', () => {
    expect(formatApiKeySummary(key({ mode: 'all', scopes: ['models:read'] }), t)).toBe(
      'profile.apiKeysSummaryAllRead',
    )
    expect(formatApiKeySummary(key({ mode: 'all', scopes: ['models:write'] }), t)).toBe(
      'profile.apiKeysSummaryAllWrite',
    )
  })

  it('summarizes grants', () => {
    expect(
      formatApiKeySummary(
        key({
          mode: 'grants',
          grants: [{ modelId: 'm1', scopes: ['models:write'] }],
        }),
        t,
      ),
    ).toBe('profile.apiKeysSummaryGrantsWrite:{"count":1}')
  })
})

import { describe, expect, it } from 'vitest'
import { FEATURE_GRANT_KEYS } from './catalog'
import { messages } from '@/i18n/messages'

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, obj)
}

describe('FEATURE_GRANT_KEYS catalog (DGTW-4059)', () => {
  it('contains role model v2 keys', () => {
    expect(FEATURE_GRANT_KEYS).toContain('model.diagram.create')
    expect(FEATURE_GRANT_KEYS).toContain('model.tree.createNode')
    expect(FEATURE_GRANT_KEYS).toContain('profile.nav')
  })

  it('every key has ru and en label', () => {
    for (const key of FEATURE_GRANT_KEYS) {
      expect(
        resolvePath(messages.ru as unknown as Record<string, unknown>, `featureGrants.${key}`),
        `ru label missing for ${key}`
      ).toBeTypeOf('string')
      expect(
        resolvePath(messages.en as unknown as Record<string, unknown>, `featureGrants.${key}`),
        `en label missing for ${key}`
      ).toBeTypeOf('string')
    }
  })
})

import { describe, it, expect } from 'vitest'
import { messages, type SupportedLocale } from '@/i18n/messages'

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

describe('i18n completeness', () => {
  const locales = Object.keys(messages) as SupportedLocale[]

  it('has both ru and en locales', () => {
    expect(locales).toContain('ru')
    expect(locales).toContain('en')
  })

  it('ru and en have identical key sets', () => {
    const ruKeys = collectKeys(messages.ru as unknown as Record<string, unknown>)
    const enKeys = collectKeys(messages.en as unknown as Record<string, unknown>)

    const missingInEn = ruKeys.filter((k) => !enKeys.includes(k))
    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k))

    if (missingInEn.length > 0) {
      console.warn('Keys missing in EN:', missingInEn)
    }
    if (missingInRu.length > 0) {
      console.warn('Keys missing in RU:', missingInRu)
    }

    expect(missingInEn, `Keys present in RU but missing in EN:\n${missingInEn.join('\n')}`).toEqual(
      [],
    )
    expect(missingInRu, `Keys present in EN but missing in RU:\n${missingInRu.join('\n')}`).toEqual(
      [],
    )
  })
})

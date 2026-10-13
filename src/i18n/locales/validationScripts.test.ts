import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { validationScriptsMessages } from './validationScripts'

function messageKeys(node: unknown, prefix: string, out: string[]): void {
  if (typeof node === 'string') {
    out.push(prefix)
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    messageKeys(value, prefix ? `${prefix}.${key}` : key, out)
  }
}

describe('validationScripts messages', () => {
  it.each(['ru', 'en'] as const)('compiles every %s string, including literal braces', (locale) => {
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: { [locale]: validationScriptsMessages[locale] },
    })
    const keys: string[] = []
    messageKeys(validationScriptsMessages[locale], '', keys)
    for (const key of keys) {
      expect(() => i18n.global.t(key), key).not.toThrow()
    }
    expect(i18n.global.t('validationScripts.apiHelp.items.neighbors')).toContain('{ items, last }')
  })
})

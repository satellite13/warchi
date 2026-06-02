import { commonMessages } from './locales/common'
import { authMessages } from './locales/auth'
import { modelsMessages } from './locales/models'
import { notationsMessages } from './locales/notations'
import { typesMessages } from './locales/types'
import { diagramMessages } from './locales/diagram'
import { homeMessages } from './locales/home'
import { docsMessages } from './locales/docs'

type DeepRecord = Record<string, unknown>

function deepMerge(...objects: DeepRecord[]): DeepRecord {
  const result: DeepRecord = {}
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = deepMerge(
          (result[key] ?? {}) as DeepRecord,
          val as DeepRecord,
        )
      } else {
        result[key] = val
      }
    }
  }
  return result
}

const mergedMessages = deepMerge(
  commonMessages,
  authMessages,
  modelsMessages,
  notationsMessages,
  typesMessages,
  diagramMessages,
  homeMessages,
  docsMessages,
) as typeof commonMessages &
  typeof authMessages &
  typeof modelsMessages &
  typeof notationsMessages &
  typeof typesMessages &
  typeof diagramMessages &
  typeof homeMessages &
  typeof docsMessages

type SupportedMessages = {
  ru: (typeof mergedMessages)['ru']
  en: (typeof mergedMessages)['en']
}

export const messages: SupportedMessages = {
  ru: mergedMessages.ru,
  en: mergedMessages.en,
}

export type SupportedLocale = keyof typeof messages

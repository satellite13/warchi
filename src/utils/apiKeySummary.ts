import type { ApiKey } from '@/types/apiKeys'

export function formatApiKeySummary(
  key: ApiKey,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (key.mode === 'all') {
    const write = key.scopes?.includes('models:write')
    return write ? t('profile.apiKeysSummaryAllWrite') : t('profile.apiKeysSummaryAllRead')
  }
  const n = key.grants?.length ?? 0
  const allWrite = key.grants?.every((g) => g.scopes.includes('models:write'))
  const allRead = key.grants?.every((g) => !g.scopes.includes('models:write'))
  if (allWrite) return t('profile.apiKeysSummaryGrantsWrite', { count: n })
  if (allRead) return t('profile.apiKeysSummaryGrantsRead', { count: n })
  return t('profile.apiKeysSummaryGrantsMixed', { count: n })
}

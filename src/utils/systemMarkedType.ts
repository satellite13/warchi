type SystemAttrs = {
  system?: boolean | Record<string, unknown>
}

/**
 * Type marked as system in attrs — view-only in the types editor
 * (no edit / delete / share).
 *
 * Recognized shapes:
 * - `{ "system": true }`
 * - `{ "system": { "hiddenTreeRootType": true, ... } }` (any true boolean flag)
 */
export function isSystemMarkedType(item: {
  parsedAttrs?: SystemAttrs | null
} | null | undefined): boolean {
  if (!item?.parsedAttrs) return false
  const system = item.parsedAttrs.system
  if (system === true) return true
  if (!system || typeof system !== 'object' || Array.isArray(system)) return false
  return Object.values(system).some((value) => value === true)
}

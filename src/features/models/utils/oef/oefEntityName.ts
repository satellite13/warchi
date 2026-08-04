/** Matches arepos BatchNodeCreate/BatchDiagramCreate @Size(max = 255) on name. */
export const OEF_ENTITY_NAME_MAX_LENGTH = 255

export function truncateOefEntityName(name: string, maxLength = OEF_ENTITY_NAME_MAX_LENGTH): string {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength)
}

/** Trim + truncate; empty after trim stays empty (caller decides create fallback). */
export function normalizeOefNodeName(raw: string, maxLength = OEF_ENTITY_NAME_MAX_LENGTH): string {
  return truncateOefEntityName(raw.trim(), maxLength)
}

/**
 * Ensure unique (name, version) within one import batch.
 * DB constraint: diagrams_model_name_version_key.
 */
export function allocateUniqueEntityName(
  rawName: string,
  version: string,
  usedNameVersions: Set<string>,
  fallback = 'Untitled',
  maxLength = OEF_ENTITY_NAME_MAX_LENGTH
): { name: string; deduplicated: boolean } {
  const base = truncateOefEntityName(rawName.trim() || fallback, maxLength)
  const keyFor = (name: string): string => `${name}\0${version}`
  if (!usedNameVersions.has(keyFor(base))) {
    usedNameVersions.add(keyFor(base))
    return { name: base, deduplicated: false }
  }
  let index = 2
  while (true) {
    const suffix = ` (${index})`
    const truncatedBase = truncateOefEntityName(base, Math.max(1, maxLength - suffix.length))
    const candidate = `${truncatedBase}${suffix}`
    if (!usedNameVersions.has(keyFor(candidate))) {
      usedNameVersions.add(keyFor(candidate))
      return { name: candidate, deduplicated: true }
    }
    index += 1
  }
}

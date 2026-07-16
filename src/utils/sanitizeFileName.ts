/** Russian/Cyrillic → Latin for ASCII-safe download filenames. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

function transliterateToLatin(value: string): string {
  return [...value]
    .map((char) => {
      const lower = char.toLowerCase()
      const mapped = CYRILLIC_TO_LATIN[lower]
      if (mapped === undefined) return char
      if (char !== lower && mapped.length > 0) {
        return mapped[0]!.toUpperCase() + mapped.slice(1)
      }
      return mapped
    })
    .join('')
}

/**
 * Normalize a human-readable name into an ASCII filename slug
 * (lowercase, hyphen-separated, Latin-only).
 */
export function sanitizeFileName(value: string): string {
  return transliterateToLatin(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

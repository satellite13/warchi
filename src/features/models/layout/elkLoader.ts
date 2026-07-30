export type ElkLike = {
  layout: (graph: unknown) => Promise<unknown>
}

let cached: Promise<ElkLike> | null = null

export function getElk(): Promise<ElkLike> {
  if (!cached) {
    cached = (async () => {
      const ELK = (await import('elkjs/lib/elk.bundled.js')).default
      return new ELK() as ElkLike
    })().catch(err => {
      cached = null
      throw err
    })
  }
  return cached
}

export function resetElkCacheForTests(): void {
  cached = null
}

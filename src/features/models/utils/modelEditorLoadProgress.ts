export type ModelEditorLoadCollection = 'nodes' | 'diagrams' | 'links'
export type ModelEditorLoadPhase =
  | ModelEditorLoadCollection
  | 'catalog'
  | 'preparing'
  | 'complete'

export type ModelEditorLoadProgressEvent =
  | {
      kind: 'collection'
      collection: ModelEditorLoadCollection
      loaded: number
      total: number
    }
  | {
      kind: 'preparing'
      target: 'shell' | 'links'
      loaded: number
      total: number
    }
  | {
      kind: 'catalog'
      status: 'started' | 'complete'
    }
  | {
      kind: 'complete'
    }

export type ModelEditorLoadProgress = {
  generation: number
  modelId: string
  phase: ModelEditorLoadPhase
  percent: number
  loaded: number
  total: number
  blocking: boolean
}

type CollectionProgress = {
  loaded: number
  total: number
}

const SHELL_DOWNLOAD_END = 70
const SHELL_PREPARING_END = 80
const CATALOG_END = 85
const LINKS_DOWNLOAD_END = 97
const LINKS_PREPARING_END = 99

function ratio(loaded: number, total: number): number {
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, loaded / total))
}

export function createModelEditorLoadProgressTracker(context: {
  generation: number
  modelId: string
}): {
  update: (event: ModelEditorLoadProgressEvent) => ModelEditorLoadProgress
  setBlocking: (blocking: boolean) => void
  current: () => ModelEditorLoadProgress
} {
  const collections = new Map<ModelEditorLoadCollection, CollectionProgress>()
  let blocking = true
  let last: ModelEditorLoadProgress = {
    ...context,
    phase: 'nodes',
    percent: 0,
    loaded: 0,
    total: 0,
    blocking,
  }

  const publish = (
    phase: ModelEditorLoadPhase,
    percent: number,
    loaded: number,
    total: number
  ): ModelEditorLoadProgress => {
    last = {
      ...context,
      phase,
      percent: Math.max(last.percent, Math.min(100, Math.floor(percent))),
      loaded,
      total,
      blocking,
    }
    return last
  }

  return {
    update(event) {
      if (event.kind === 'collection') {
        collections.set(event.collection, {
          loaded: event.loaded,
          total: event.total,
        })
        if (event.collection === 'links') {
          const progress = ratio(event.loaded, event.total)
          return publish(
            'links',
            CATALOG_END + progress * (LINKS_DOWNLOAD_END - CATALOG_END),
            event.loaded,
            event.total
          )
        }

        const shell = (['nodes', 'diagrams'] as const)
          .map(collection => collections.get(collection))
          .filter((value): value is CollectionProgress => value !== undefined)
        const loaded = shell.reduce((sum, value) => sum + value.loaded, 0)
        const total = shell.reduce((sum, value) => sum + value.total, 0)
        return publish(event.collection, ratio(loaded, total) * SHELL_DOWNLOAD_END, loaded, total)
      }

      if (event.kind === 'preparing') {
        const progress = ratio(event.loaded, event.total)
        const start = event.target === 'shell' ? SHELL_DOWNLOAD_END : LINKS_DOWNLOAD_END
        const end = event.target === 'shell' ? SHELL_PREPARING_END : LINKS_PREPARING_END
        return publish('preparing', start + progress * (end - start), event.loaded, event.total)
      }

      if (event.kind === 'catalog') {
        return publish(
          'catalog',
          event.status === 'complete' ? CATALOG_END : SHELL_PREPARING_END,
          event.status === 'complete' ? 1 : 0,
          1
        )
      }

      return publish('complete', 100, 1, 1)
    },
    setBlocking(nextBlocking) {
      blocking = nextBlocking
      last = { ...last, blocking }
    },
    current: () => last,
  }
}

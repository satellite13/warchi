import { apiGet } from '@/composables/useApi'
import { fetchAllByModelId } from '@/features/models/composables/modelEditorLoadModel'
import { fetchAllComponentsByNotationIds } from '@/features/models/composables/modelNotationComponentsApi'
import { analyzeImportIconGaps } from '@/features/notations/utils/analyzeImportIconGaps'
import type { DiagramResponse } from '@/types/api'
import type { LibraryIconRecord } from '@/utils/libraryIconResolve'

function parseJsonAttr(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function missingIconsFromImportedEntities(
  entities: Array<{ attrs?: string | null }>,
  libraryNames: Iterable<string>,
): string[] {
  return analyzeImportIconGaps(
    entities.map((entity) => parseJsonAttr(entity.attrs)),
    libraryNames,
  )
}

export async function findMissingIconsAfterModelImport(modelId: string): Promise<string[]> {
  const [diagrams, libraryResult] = await Promise.all([
    fetchAllByModelId<DiagramResponse>('/diagrams', modelId, undefined, { includeAttrs: 'true' }),
    apiGet<LibraryIconRecord[]>('/library-icons'),
  ])
  const notationIds = [...new Set(diagrams.map((diagram) => diagram.notationId).filter(Boolean))]
  const components = await fetchAllComponentsByNotationIds(notationIds, { modelId })
  const libraryNames = libraryResult.success ? libraryResult.data.map((icon) => icon.name) : []
  return missingIconsFromImportedEntities([...diagrams, ...components], libraryNames)
}

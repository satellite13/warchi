import type { LocationQuery, RouteLocationRaw } from 'vue-router'

export function selectedDiagramQueryMatches(
  query: LocationQuery,
  diagramId: string | null
): boolean {
  const currentId = typeof query.diagramId === 'string' ? query.diagramId : ''
  return currentId === (diagramId ?? '')
}

export function withSelectedDiagramQuery(
  query: LocationQuery,
  diagramId: string | null
): LocationQuery {
  const next: LocationQuery = { ...query }
  if (diagramId) {
    next.diagramId = diagramId
  } else {
    delete next.diagramId
  }
  return next
}

export function modelEditorDiagramHref(
  resolve: (to: RouteLocationRaw) => { href: string },
  origin: string,
  modelId: string,
  diagramId: string
): string {
  const resolved = resolve({
    name: 'model-editor',
    params: { id: modelId },
    query: { diagramId },
  })
  return new URL(resolved.href, origin).href
}

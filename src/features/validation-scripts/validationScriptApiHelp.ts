import {
  validationScriptApiCatalog,
  type ValidationScriptApiCatalogItem,
} from './validationScriptApiCatalog'

export type ValidationScriptApiHelpGroupId = 'ctx' | 'report' | 'apply' | 'helpers'

export type ValidationScriptApiHelpGroup = {
  id: ValidationScriptApiHelpGroupId
  items: ValidationScriptApiCatalogItem[]
}

export function catalogItemKey(item: ValidationScriptApiCatalogItem): string {
  return item.parent ? `${item.parent}.${item.label}` : item.label
}

export function displayCatalogItemName(item: ValidationScriptApiCatalogItem): string {
  return catalogItemKey(item)
}

/** Groups catalog entries for the in-editor API help panel. */
export function getValidationScriptApiHelpGroups(): ValidationScriptApiHelpGroup[] {
  const ctxItems = validationScriptApiCatalog.filter(
    (item) => item.label === 'ctx' || item.parent === 'ctx'
  )
  const reportItems = validationScriptApiCatalog.filter(
    (item) => item.label === 'report' || item.parent === 'report'
  )
  const applyItems = validationScriptApiCatalog.filter(
    (item) => item.label === 'apply' || item.parent === 'apply'
  )
  const helperItems = validationScriptApiCatalog.filter(
    (item) =>
      !item.parent &&
      item.label !== 'ctx' &&
      item.label !== 'report' &&
      item.label !== 'apply'
  )
  return [
    { id: 'ctx', items: ctxItems },
    { id: 'report', items: reportItems },
    { id: 'apply', items: applyItems },
    { id: 'helpers', items: helperItems },
  ]
}

export type ValidationScriptApiStructureId =
  | 'node'
  | 'link'
  | 'folder'
  | 'diagram'
  | 'component'
  | 'relation'
  | 'relationRule'
  | 'type'
  | 'duplicateLink'
  | 'target'

export type ValidationScriptApiStructure = {
  id: ValidationScriptApiStructureId
  /** Language-agnostic field list for the compact panel. */
  fields: string
}

/** Compact snapshot shapes shown in the editor API help panel. */
export const VALIDATION_SCRIPT_API_STRUCTURES: ValidationScriptApiStructure[] = [
  {
    id: 'node',
    fields: '{ id, name, parentId, nodeTypeId, attrs }',
  },
  {
    id: 'link',
    fields: '{ id, name, sourceId, targetId, linkTypeId, attrs }',
  },
  {
    id: 'folder',
    fields: '{ id, name, parentId }',
  },
  {
    id: 'diagram',
    fields: '{ id, name, version, notationId, nodeIds[], linkIds[], instances[], edges[] }',
  },
  {
    id: 'component',
    fields: '{ id, name, notationId, nodeTypeId }',
  },
  {
    id: 'relation',
    fields: '{ id, name, notationId, linkTypeId }',
  },
  {
    id: 'relationRule',
    fields: '{ id, relationId, fromComponentId, toComponentId }',
  },
  {
    id: 'type',
    fields: '{ id, name, attrs /* JSON string | null */ }',
  },
  {
    id: 'duplicateLink',
    fields: '{ linkIds[], sourceId, targetId, linkTypeId? }  // directed by default',
  },
  {
    id: 'target',
    fields: "{ kind: 'node'|'link'|'diagram'|'folder', id }",
  },
]

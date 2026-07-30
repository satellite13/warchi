import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'

export interface ValidationScriptApiCatalogItem {
  label: string
  type: 'variable' | 'function' | 'property' | 'method' | 'namespace'
  detail?: string
  info?: string
  /** Parent namespace for dotted completions (e.g. `ctx` for `model`). */
  parent?: string
}

/** Public top-level sandbox bindings (stable v1 API). */
export const VALIDATION_SCRIPT_TOP_LEVEL_NAMES = [
  'ctx',
  'report',
  'diagramNodes',
  'diagramLinks',
  'nodesOfType',
  'linksOfType',
  'linksBetween',
  'findDuplicateLinks',
  'componentForNode',
  'relationRules',
] as const

export type ValidationScriptTopLevelName = (typeof VALIDATION_SCRIPT_TOP_LEVEL_NAMES)[number]

export const validationScriptApiCatalog: ValidationScriptApiCatalogItem[] = [
  {
    label: 'ctx',
    type: 'namespace',
    detail: 'Run context',
    info: 'Snapshot context: model, open diagram, notations, types.',
  },
  { label: 'model', type: 'property', parent: 'ctx', detail: 'Snapshot model graph' },
  { label: 'diagram', type: 'property', parent: 'ctx', detail: 'Open diagram or null' },
  { label: 'notations', type: 'property', parent: 'ctx', detail: 'Notation packages in snapshot' },
  {
    label: 'types',
    type: 'property',
    parent: 'ctx',
    detail: '{ nodeTypes, linkTypes }',
  },
  {
    label: 'report',
    type: 'namespace',
    detail: 'Issue reporter',
    info: 'Emit validation issues at error, warn, or info level.',
  },
  {
    label: 'error',
    type: 'method',
    parent: 'report',
    detail: '(message, target?)',
    info: 'Report an error-level issue.',
  },
  {
    label: 'warn',
    type: 'method',
    parent: 'report',
    detail: '(message, target?)',
    info: 'Report a warning-level issue.',
  },
  {
    label: 'info',
    type: 'method',
    parent: 'report',
    detail: '(message, target?)',
    info: 'Report an info-level issue.',
  },
  {
    label: 'diagramNodes',
    type: 'function',
    detail: '(diagram)',
    info: 'Model nodes visible on the given diagram.',
  },
  {
    label: 'diagramLinks',
    type: 'function',
    detail: '(diagram)',
    info: 'Model links visible on the given diagram.',
  },
  {
    label: 'nodesOfType',
    type: 'function',
    detail: '(typeIdOrName)',
    info: 'All model nodes matching a node type id or name.',
  },
  {
    label: 'linksOfType',
    type: 'function',
    detail: '(typeIdOrName)',
    info: 'All model links matching a link type id or name.',
  },
  {
    label: 'linksBetween',
    type: 'function',
    detail: '(a, b, options?)',
    info: 'Links between two nodes; optional linkType filter.',
  },
  {
    label: 'findDuplicateLinks',
    type: 'function',
    detail: '({ by, directed? })',
    info: "Find duplicate links by 'endpoints' or 'endpoints+type'. Direction matters by default.",
  },
  {
    label: 'componentForNode',
    type: 'function',
    detail: '(node)',
    info: 'Notation component for a model node on its diagram.',
  },
  {
    label: 'relationRules',
    type: 'function',
    detail: '(notationId)',
    info: 'Relation rules for the given notation.',
  },
]

function catalogItemToCompletion(item: ValidationScriptApiCatalogItem): Completion {
  return {
    label: item.label,
    type: item.type,
    detail: item.detail,
    info: item.info,
  }
}

function topLevelCompletions(): Completion[] {
  return validationScriptApiCatalog
    .filter((item) => !item.parent && VALIDATION_SCRIPT_TOP_LEVEL_NAMES.includes(item.label as ValidationScriptTopLevelName))
    .map(catalogItemToCompletion)
}

function memberCompletions(parent: string): Completion[] {
  return validationScriptApiCatalog
    .filter((item) => item.parent === parent)
    .map(catalogItemToCompletion)
}

export function validationScriptCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.]*$/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const text = word.text
  const dotIndex = text.lastIndexOf('.')
  if (dotIndex >= 0) {
    const parent = text.slice(0, dotIndex)
    const members = memberCompletions(parent)
    if (members.length === 0) return null
    return {
      from: word.from + dotIndex + 1,
      options: members,
      validFor: /^[\w]*$/,
    }
  }

  return {
    from: word.from,
    options: topLevelCompletions(),
    validFor: /^[\w]*$/,
  }
}

export const validationScriptAutocomplete = autocompletion({
  override: [validationScriptCompletionSource],
})

export function getValidationScriptTopLevelNames(): string[] {
  return [...VALIDATION_SCRIPT_TOP_LEVEL_NAMES]
}

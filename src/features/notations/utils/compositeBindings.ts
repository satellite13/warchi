import type { CustomProperty, CompositeSerializedCComponent, DiagramStyle } from '../notationAttrs'

const OUTER_TARGET_ID = '__compositeOuter__'

type PropertyType = CustomProperty['type']

export type CompositeBindingContext = {
  componentProperties: CustomProperty[]
  componentValues: Record<string, unknown>
  nodeTypeProperties: CustomProperty[]
  nodeTypeValues: Record<string, unknown>
}

export type CompositeBindingResult = {
  content: CompositeSerializedCComponent
  outerPatch: Record<string, unknown>
}

const bindingCache = new Map<string, CompositeBindingResult>()
const MAX_BINDING_CACHE = 200

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeMissingValue(type: PropertyType | undefined, value: unknown): unknown {
  if (value !== undefined && value !== null) return value
  if (type === 'boolean') return false
  if (type === 'string') return ''
  return undefined
}

function readPropertyType(
  source: 'component' | 'nodeType',
  propertyName: string,
  ctx: CompositeBindingContext
): PropertyType | undefined {
  const list = source === 'component' ? ctx.componentProperties : ctx.nodeTypeProperties
  return list.find((p) => p.name === propertyName)?.type
}

function readPropertyValue(
  source: 'component' | 'nodeType',
  propertyName: string,
  ctx: CompositeBindingContext
): unknown {
  const bag = source === 'component' ? ctx.componentValues : ctx.nodeTypeValues
  return bag[propertyName]
}

function evalWhen(when: Record<string, unknown>, value: unknown): boolean {
  const op = when.op
  if (typeof op !== 'string') return false

  switch (op) {
    case 'equals':
      return value === when.value
    case 'contains':
      return typeof value === 'string' && typeof when.value === 'string' && value.includes(when.value)
    case 'matchesRegex':
      if (typeof value !== 'string' || typeof when.value !== 'string') return false
      try {
        return new RegExp(when.value).test(value)
      } catch {
        return false
      }
    case 'isEmpty':
      return value === '' || value === undefined || value === null
    case 'isNotEmpty':
      return value !== '' && value !== undefined && value !== null
    case 'is':
      return typeof when.value === 'boolean' && value === when.value
    case 'range': {
      if (typeof value !== 'number') return false
      const min = typeof when.min === 'number' ? when.min : undefined
      const max = typeof when.max === 'number' ? when.max : undefined
      if (min != null && value < min) return false
      if (max != null && value > max) return false
      return min != null || max != null
    }
    case 'lt':
      return typeof value === 'number' && typeof when.value === 'number' && value < when.value
    case 'lte':
      return typeof value === 'number' && typeof when.value === 'number' && value <= when.value
    case 'gt':
      return typeof value === 'number' && typeof when.value === 'number' && value > when.value
    case 'gte':
      return typeof value === 'number' && typeof when.value === 'number' && value >= when.value
    default:
      return false
  }
}

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'type') continue
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      mergeInto(target[key] as Record<string, unknown>, value as Record<string, unknown>)
      continue
    }
    target[key] = clone(value)
  }
}

function applyPatchToTree(
  node: CompositeSerializedCComponent,
  targetId: string,
  patch: Record<string, unknown>
): boolean {
  if (node.id === targetId) {
    mergeInto(node as unknown as Record<string, unknown>, patch)
    return true
  }

  if (node.content && applyPatchToTree(node.content, targetId, patch)) {
    return true
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (applyPatchToTree(child, targetId, patch)) return true
    }
  }
  return false
}

export function applyStylePropertyBindings(
  ds: DiagramStyle | undefined,
  content: CompositeSerializedCComponent,
  ctx: CompositeBindingContext
): CompositeBindingResult {
  const bindings = ds?.stylePropertyBindings
  if (!bindings || bindings.length === 0) {
    return { content, outerPatch: {} }
  }

  const cacheKey = JSON.stringify({
    content,
    bindings,
    componentValues: ctx.componentValues,
    nodeTypeValues: ctx.nodeTypeValues,
  })
  const cached = bindingCache.get(cacheKey)
  if (cached) {
    return clone(cached)
  }

  const next = clone(content)
  const outerPatch: Record<string, unknown> = {}

  for (const group of bindings) {
    const propType = readPropertyType(group.valueSource, group.propertyName, ctx)
    const raw = readPropertyValue(group.valueSource, group.propertyName, ctx)
    const value = normalizeMissingValue(propType, raw)
    const match = group.branches.find((branch) =>
      evalWhen(branch.when as unknown as Record<string, unknown>, value)
    )
    if (!match) continue

    for (const patchItem of match.patches) {
      if (patchItem.targetId === OUTER_TARGET_ID) {
        mergeInto(outerPatch, patchItem.patch)
        continue
      }
      applyPatchToTree(next, patchItem.targetId, patchItem.patch)
    }
  }

  const result = { content: next, outerPatch }
  if (bindingCache.size >= MAX_BINDING_CACHE) {
    const oldest = bindingCache.keys().next().value
    if (oldest) bindingCache.delete(oldest)
  }
  bindingCache.set(cacheKey, clone(result))
  return result
}

export const BIND_TO_NAME = '__name__'

export function injectCompositeNameAndIcon(
  base: CompositeSerializedCComponent,
  options: {
    displayName: string
    notationIconName?: string
    propertyValues?: Record<string, unknown>
  },
): CompositeSerializedCComponent {
  const next = clone(base)
  const propValues = options.propertyValues ?? {}

  const visit = (node: CompositeSerializedCComponent): void => {
    if (node.type === 'text') {
      if (node.bindToProperty === BIND_TO_NAME) {
        node.text = options.displayName
      } else if (node.bindToProperty && node.bindToProperty in propValues) {
        const val = propValues[node.bindToProperty]
        node.text = val != null ? String(val) : ''
      }
    }
    if (node.type === 'icon' && node.bindsNotationIcon === true && options.notationIconName) {
      node.source = `/icons/${options.notationIconName}.svg`
    }
    if (node.content) visit(node.content)
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child)
    }
  }

  visit(next)
  return next
}

export function createDefaultCompositeContent(labelText: string): CompositeSerializedCComponent {
  return {
    type: 'container',
    direction: 'column',
    padding: 8,
    children: [
      {
        type: 'text',
        id: 'name',
        bindToProperty: BIND_TO_NAME,
        text: labelText,
      },
    ],
  }
}

export function countCompositeNodeMatches(
  root: CompositeSerializedCComponent,
  predicate: (node: CompositeSerializedCComponent) => boolean
): number {
  let count = 0
  const visit = (node: CompositeSerializedCComponent): void => {
    if (predicate(node)) count += 1
    if (node.content) visit(node.content)
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child)
    }
  }
  visit(root)
  return count
}

/**
 * Resolve the icon name from a composite tree's bindsNotationIcon icon element.
 * Returns the icon id (e.g. "widgets") or undefined if not found.
 */
export function resolveCompositeBoundIconName(
  root: CompositeSerializedCComponent | undefined,
): string | undefined {
  if (!root) return undefined
  let found: string | undefined
  const visit = (node: CompositeSerializedCComponent): void => {
    if (found) return
    if (
      node.type === 'icon' &&
      node.bindsNotationIcon === true &&
      typeof node.source === 'string'
    ) {
      const match = node.source.match(/\/icons\/(.+)\.svg$/)
      if (match?.[1]) {
        found = match[1]
        return
      }
    }
    if (node.content) visit(node.content)
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  visit(root)
  return found
}


import type { CustomProperty, CustomPropertyType } from '@/domain/attrs/notationAttrs'

export type ConvertOefPropertySuccess = { ok: true; value: string | number | boolean }
export type ConvertOefPropertySkip = { ok: 'skip' }
export type ConvertOefPropertyFailure = {
  ok: false
  reason: 'invalidNumber' | 'invalidBoolean' | 'invalidEnum'
}
export type ConvertOefPropertyResult =
  | ConvertOefPropertySuccess
  | ConvertOefPropertySkip
  | ConvertOefPropertyFailure

export function convertOefPropertyValue(
  raw: string,
  property: CustomProperty
): ConvertOefPropertyResult {
  const trimmed = raw.trim()
  switch (property.type) {
    case 'string':
      if (!trimmed) return { ok: 'skip' }
      return { ok: true, value: trimmed }
    case 'number': {
      if (!trimmed) return { ok: false, reason: 'invalidNumber' }
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return { ok: false, reason: 'invalidNumber' }
      return { ok: true, value: n }
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase()
      if (lower === 'true' || lower === '1' || lower === 'yes') return { ok: true, value: true }
      if (lower === 'false' || lower === '0' || lower === 'no') return { ok: true, value: false }
      return { ok: false, reason: 'invalidBoolean' }
    }
    case 'enum': {
      const values = property.enumValues ?? []
      if (values.includes(trimmed)) return { ok: true, value: trimmed }
      return { ok: false, reason: 'invalidEnum' }
    }
    default: {
      const _exhaustive: never = property.type
      void _exhaustive
      return { ok: 'skip' }
    }
  }
}

export type OefPropertyConversionFailure = {
  entityId: string
  entityKind: 'node' | 'link'
  propertyName: string
  targetType: CustomPropertyType
  rawValue: string
  reason: ConvertOefPropertyFailure['reason']
}

export type MergeOefPropertiesIntoBucketsParams = {
  oefProperties: Record<string, string>
  typeDefaults: Record<string, unknown>
  componentDefaults: Record<string, unknown>
  typeSchema: CustomProperty[]
  componentSchema: CustomProperty[]
  entityId: string
  entityKind: 'node' | 'link'
}

export type MergeOefPropertiesIntoBucketsResult = {
  typeValues: Record<string, unknown>
  componentValues: Record<string, unknown>
  unmatchedNames: string[]
  conversionFailures: OefPropertyConversionFailure[]
}

function findByExactName(schema: CustomProperty[], name: string): CustomProperty | undefined {
  return schema.find(p => p.name === name)
}

export function mergeOefPropertiesIntoBuckets(
  params: MergeOefPropertiesIntoBucketsParams
): MergeOefPropertiesIntoBucketsResult {
  const typeValues = { ...params.typeDefaults }
  const componentValues = { ...params.componentDefaults }
  const unmatchedNames: string[] = []
  const conversionFailures: OefPropertyConversionFailure[] = []

  for (const [rawName, rawValue] of Object.entries(params.oefProperties)) {
    const name = rawName.trim()
    if (!name) continue
    const typeProp = findByExactName(params.typeSchema, name)
    const componentProp = findByExactName(params.componentSchema, name)
    if (!typeProp && !componentProp) {
      unmatchedNames.push(name)
      continue
    }
    if (typeProp) {
      const converted = convertOefPropertyValue(rawValue, typeProp)
      if (converted.ok === true) typeValues[typeProp.name] = converted.value
      else if (converted.ok === false) {
        conversionFailures.push({
          entityId: params.entityId,
          entityKind: params.entityKind,
          propertyName: typeProp.name,
          targetType: typeProp.type,
          rawValue,
          reason: converted.reason,
        })
      }
    }
    if (componentProp) {
      const converted = convertOefPropertyValue(rawValue, componentProp)
      if (converted.ok === true) componentValues[componentProp.name] = converted.value
      else if (converted.ok === false) {
        conversionFailures.push({
          entityId: params.entityId,
          entityKind: params.entityKind,
          propertyName: componentProp.name,
          targetType: componentProp.type,
          rawValue,
          reason: converted.reason,
        })
      }
    }
  }

  return { typeValues, componentValues, unmatchedNames, conversionFailures }
}

/** Link-only: relation schema uses the type bucket (componentSchema empty). */
export function mergeOefPropertiesIntoRelationValues(params: {
  oefProperties: Record<string, string>
  relationDefaults: Record<string, unknown>
  relationSchema: CustomProperty[]
  entityId: string
}): {
  relationValues: Record<string, unknown>
  unmatchedNames: string[]
  conversionFailures: OefPropertyConversionFailure[]
} {
  const merged = mergeOefPropertiesIntoBuckets({
    oefProperties: params.oefProperties,
    typeDefaults: params.relationDefaults,
    componentDefaults: {},
    typeSchema: params.relationSchema,
    componentSchema: [],
    entityId: params.entityId,
    entityKind: 'link',
  })
  return {
    relationValues: merged.typeValues,
    unmatchedNames: merged.unmatchedNames,
    conversionFailures: merged.conversionFailures,
  }
}

export function aggregateUnmatchedPropertyNames(
  names: string[]
): Array<{ propertyName: string; count: number }> {
  const counts = new Map<string, number>()
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([propertyName, count]) => ({ propertyName, count }))
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName))
}

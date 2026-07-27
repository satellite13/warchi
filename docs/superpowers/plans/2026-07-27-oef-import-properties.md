# OEF Import Properties → Custom Properties — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При OEF-импорте парсить properties элементов/relationships и записывать значения в совпадающие по имени кастомные свойства (type/component/relation), с конвертацией text → typed value и warnings.

**Architecture:** Парсеры (клиент DOM + сервер StAX) отдают `properties: Record<string, string>` (имя definition → текст). Чистый модуль `oefPropertyConversion.ts` конвертирует и мержит в defaults. `buildOefBatchSaveRequest` применяет merge в `typeProperties` / `componentProperties` / `relationProperties`. UI только показывает новые warning-коды.

**Tech Stack:** Vue 3 + TypeScript + Vitest (warchi); Kotlin + JUnit (arepos-server).

**Spec:** `docs/superpowers/specs/2026-07-27-oef-import-properties-design.md`

**Branch:** `feat/oef-import-properties` в `warchi` и `arepos-server` (papirus не затрагивается).

---

## File map

| File | Responsibility |
|------|----------------|
| Create `warchi/.../oef/oefPropertyConversion.ts` | `convertOefPropertyValue`, `mergeOefPropertiesIntoBuckets`, unmatched aggregation |
| Create `warchi/.../oef/oefPropertyConversion.test.ts` | Unit tests for conversion + merge |
| Create `warchi/.../oef/__fixtures__/element-properties.xml` | Minimal OEF with definitions + properties |
| Modify `warchi/.../oef/types.ts` | `properties` on element/relationship/draft node/link |
| Modify `warchi/.../oef/oefParser.ts` | Parse definitions + resolve properties by name |
| Modify `warchi/.../oef/oefParser.test.ts` | Parser coverage |
| Modify `warchi/.../oef/oefDraftBuilder.ts` | Copy properties into draft |
| Modify `warchi/.../oef/oefDraftBuilder.test.ts` | Draft passthrough (if file exists) |
| Modify `warchi/.../oef/oefToBatchSave.ts` | Schemas params + merge + new warning codes |
| Modify `warchi/.../oef/oefToBatchSave.test.ts` | Override defaults, dual write, unmatched |
| Modify `warchi/.../composables/useOefImport.ts` | Pass schemas; i18n labels for new codes |
| Modify `warchi/src/i18n/locales/models.ts` | ru/en warning strings |
| Modify `warchi/.../oef/oefNormalizeApi.ts` | Preserve properties from normalize response |
| Modify `arepos-server/.../OefNormalizeDtos.kt` | `properties` map on element/relationship DTOs |
| Modify `arepos-server/.../OefParseService.kt` | Streaming parse + resolve names after definitions |
| Modify `arepos-server/.../OefParseServiceTest.kt` | Server parse coverage |
| Create `arepos-server/src/test/resources/oef/element-properties.xml` | Same fixture |

---

### Task 0: Feature branches

**Repos:** warchi, arepos-server

- [ ] **Step 1: Create matching branches**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/oef-import-properties
cd /Users/nikolaygroznyh/Work/arepos-server && git checkout -b feat/oef-import-properties
```

Expected: both on `feat/oef-import-properties`.

---

### Task 1: Conversion helper — failing tests first

**Files:**
- Create: `src/features/models/utils/oef/oefPropertyConversion.test.ts`
- Create: `src/features/models/utils/oef/oefPropertyConversion.ts` (after red)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import {
  convertOefPropertyValue,
  mergeOefPropertiesIntoBuckets,
} from './oefPropertyConversion'

function prop(
  overrides: Partial<CustomProperty> & { name: string; type: CustomProperty['type'] }
): CustomProperty {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name,
    type: overrides.type,
    required: false,
    min: null,
    max: null,
    enumValues: overrides.enumValues,
    defaultValue: overrides.defaultValue,
  }
}

describe('convertOefPropertyValue', () => {
  it('string: trims and accepts non-empty', () => {
    expect(convertOefPropertyValue('  hi ', prop({ name: 'a', type: 'string' }))).toEqual({
      ok: true,
      value: 'hi',
    })
  })

  it('string: empty after trim → skip (not fail)', () => {
    expect(convertOefPropertyValue('  ', prop({ name: 'a', type: 'string' }))).toEqual({
      ok: 'skip',
    })
  })

  it('number: parses finite', () => {
    expect(convertOefPropertyValue(' 42.5 ', prop({ name: 'n', type: 'number' }))).toEqual({
      ok: true,
      value: 42.5,
    })
  })

  it('number: rejects non-numeric', () => {
    expect(convertOefPropertyValue('abc', prop({ name: 'n', type: 'number' }))).toEqual({
      ok: false,
      reason: 'invalidNumber',
    })
  })

  it('boolean: accepts true/1/yes and false/0/no case-insensitive', () => {
    const p = prop({ name: 'b', type: 'boolean' })
    expect(convertOefPropertyValue('YES', p)).toEqual({ ok: true, value: true })
    expect(convertOefPropertyValue('0', p)).toEqual({ ok: true, value: false })
  })

  it('boolean: rejects unknown', () => {
    expect(convertOefPropertyValue('maybe', prop({ name: 'b', type: 'boolean' }))).toEqual({
      ok: false,
      reason: 'invalidBoolean',
    })
  })

  it('enum: exact match against enumValues', () => {
    const p = prop({ name: 'e', type: 'enum', enumValues: ['Draft', 'Done'] })
    expect(convertOefPropertyValue('Draft', p)).toEqual({ ok: true, value: 'Draft' })
    expect(convertOefPropertyValue('draft', p)).toEqual({ ok: false, reason: 'invalidEnum' })
  })
})

describe('mergeOefPropertiesIntoBuckets', () => {
  it('writes into all matching schemas and overrides defaults', () => {
    const result = mergeOefPropertiesIntoBuckets({
      oefProperties: { Owner: 'Team A', Status: 'live' },
      typeDefaults: { Owner: 'Default' },
      componentDefaults: { Status: 'draft' },
      typeSchema: [prop({ name: 'Owner', type: 'string' })],
      componentSchema: [prop({ name: 'Status', type: 'string' })],
      entityId: 'el-1',
      entityKind: 'node',
    })
    expect(result.typeValues.Owner).toBe('Team A')
    expect(result.componentValues.Status).toBe('live')
    expect(result.conversionFailures).toHaveLength(0)
    expect(result.unmatchedNames).toEqual([])
  })

  it('records unmatched names and conversion failures without wiping defaults', () => {
    const result = mergeOefPropertiesIntoBuckets({
      oefProperties: { Owner: 'x', Extra: '1', Count: 'nope' },
      typeDefaults: { Count: 3 },
      componentDefaults: {},
      typeSchema: [
        prop({ name: 'Count', type: 'number' }),
        prop({ name: 'Owner', type: 'string' }),
      ],
      componentSchema: [],
      entityId: 'el-1',
      entityKind: 'node',
    })
    expect(result.typeValues.Count).toBe(3)
    expect(result.typeValues.Owner).toBe('x')
    expect(result.unmatchedNames).toEqual(['Extra'])
    expect(result.conversionFailures).toEqual([
      expect.objectContaining({ propertyName: 'Count', targetType: 'number' }),
    ])
  })

  it('matches names with trim but case-sensitive', () => {
    const result = mergeOefPropertiesIntoBuckets({
      oefProperties: { ' Owner ': 'A', owner: 'B' },
      typeDefaults: {},
      componentDefaults: {},
      typeSchema: [prop({ name: 'Owner', type: 'string' })],
      componentSchema: [],
      entityId: 'el-1',
      entityKind: 'node',
    })
    expect(result.typeValues.Owner).toBe('A')
    expect(result.unmatchedNames).toEqual(['owner'])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/oef/oefPropertyConversion.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `oefPropertyConversion.ts`**

```ts
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/features/models/utils/oef/oefPropertyConversion.test.ts
```

- [ ] **Step 5: Commit (warchi)**

```bash
git add src/features/models/utils/oef/oefPropertyConversion.ts \
  src/features/models/utils/oef/oefPropertyConversion.test.ts
git commit -m "$(cat <<'EOF'
feat(oef): add property value conversion and merge helpers

EOF
)"
```

---

### Task 2: Types + client parser + draft

**Files:**
- Modify: `src/features/models/utils/oef/types.ts`
- Modify: `src/features/models/utils/oef/oefParser.ts`
- Modify: `src/features/models/utils/oef/oefParser.test.ts`
- Modify: `src/features/models/utils/oef/oefDraftBuilder.ts`
- Modify: `src/features/models/utils/oef/oefDraftBuilder.test.ts` (if present)
- Create: `src/features/models/utils/oef/__fixtures__/element-properties.xml`

- [ ] **Step 1: Extend types**

```ts
export type OefElement = {
  id: string
  type: string
  name: string
  /** Property definition name → text value from OEF */
  properties?: Record<string, string>
}

export type OefRelationship = {
  id: string
  type: string
  name: string
  sourceElementId: string
  targetElementId: string
  properties?: Record<string, string>
}

export type ImportDraftNode = {
  sourceElementId: string
  sourceType: string
  name: string
  properties?: Record<string, string>
}

export type ImportDraftLink = {
  sourceRelationshipId: string
  sourceType: string
  sourceElementId: string
  targetElementId: string
  name?: string
  properties?: Record<string, string>
}
```

- [ ] **Step 2: Add fixture `element-properties.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       identifier="id-model-props">
  <name>Props</name>
  <elements>
    <element identifier="id-el-1" xsi:type="BusinessService">
      <name>Svc</name>
      <properties>
        <property propertyDefinitionRef="prop-owner">
          <value>Team A</value>
        </property>
        <property propertyDefinitionRef="prop-count">
          <value>7</value>
        </property>
        <property propertyDefinitionRef="prop-unknown">
          <value>x</value>
        </property>
      </properties>
    </element>
  </elements>
  <relationships>
    <relationship identifier="id-rel-1" source="id-el-1" target="id-el-1" xsi:type="Association">
      <name>Self</name>
      <properties>
        <property propertyDefinitionRef="prop-owner">
          <value>Link Owner</value>
        </property>
      </properties>
    </relationship>
  </relationships>
  <propertyDefinitions>
    <propertyDefinition identifier="prop-owner" type="string">
      <name>Owner</name>
    </propertyDefinition>
    <propertyDefinition identifier="prop-count" type="string">
      <name>Count</name>
    </propertyDefinition>
    <propertyDefinition identifier="prop-unknown" type="string">
      <name>OrphanProp</name>
    </propertyDefinition>
  </propertyDefinitions>
</model>
```

Note: `propertyDefinitions` after elements — DOM parser should read definitions first (query), then resolve refs.

- [ ] **Step 3: Parser helpers**

```ts
function parsePropertyDefinitions(model: Element): Map<string, string> {
  const root = getDirectChild(model, 'propertyDefinitions')
  const map = new Map<string, string>()
  if (!root) return map
  for (const def of getDirectChildren(root, 'propertyDefinition')) {
    const id = (def.getAttribute('identifier') ?? '').trim()
    const name = textOfFirstDirectChild(def, 'name').trim()
    if (id && name) map.set(id, name)
  }
  return map
}

function parseEntityProperties(
  entity: Element,
  definitions: Map<string, string>
): Record<string, string> | undefined {
  const propsRoot = getDirectChild(entity, 'properties')
  if (!propsRoot) return undefined
  const out: Record<string, string> = {}
  for (const propEl of getDirectChildren(propsRoot, 'property')) {
    const ref = (propEl.getAttribute('propertyDefinitionRef') ?? '').trim()
    if (!ref) continue
    const name = definitions.get(ref)
    if (!name) continue
    out[name] = textOfFirstDirectChild(propEl, 'value')
  }
  return Object.keys(out).length > 0 ? out : undefined
}
```

In `parseOefXml`: `const definitions = parsePropertyDefinitions(model)`, pass into element/relationship parsers. Attach `...(properties ? { properties } : {})`.

- [ ] **Step 4: Draft builder passthrough**

```ts
nodes: parsed.elements.map(element => ({
  sourceElementId: element.id,
  sourceType: element.type,
  name: element.name || `Element ${element.id}`,
  ...(element.properties && Object.keys(element.properties).length > 0
    ? { properties: { ...element.properties } }
    : {}),
})),
links: parsed.relationships.map(relationship => {
  const name = (relationship.name ?? '').trim()
  return {
    sourceRelationshipId: relationship.id,
    sourceType: relationship.type,
    sourceElementId: relationship.sourceElementId,
    targetElementId: relationship.targetElementId,
    ...(name ? { name } : {}),
    ...(relationship.properties && Object.keys(relationship.properties).length > 0
      ? { properties: { ...relationship.properties } }
      : {}),
  }
}),
```

- [ ] **Step 5: Tests**

```ts
import propsXml from './__fixtures__/element-properties.xml?raw'

it('resolves element and relationship properties by definition name', () => {
  const parsed = parseOefXml(propsXml)
  expect(parsed.elements[0]?.properties).toEqual({
    Owner: 'Team A',
    Count: '7',
    OrphanProp: 'x',
  })
  expect(parsed.relationships[0]?.properties).toEqual({ Owner: 'Link Owner' })
})
```

Also assert draft carries the same maps.

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/features/models/utils/oef/oefParser.test.ts src/features/models/utils/oef/oefDraftBuilder.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/features/models/utils/oef/types.ts \
  src/features/models/utils/oef/oefParser.ts \
  src/features/models/utils/oef/oefParser.test.ts \
  src/features/models/utils/oef/oefDraftBuilder.ts \
  src/features/models/utils/oef/oefDraftBuilder.test.ts \
  src/features/models/utils/oef/__fixtures__/element-properties.xml
git commit -m "$(cat <<'EOF'
feat(oef): parse element and relationship properties into draft

EOF
)"
```

---

### Task 3: Batch-save merge

**Files:**
- Modify: `src/features/models/utils/oef/oefToBatchSave.ts`
- Modify: `src/features/models/utils/oef/oefToBatchSave.test.ts`

- [ ] **Step 1: Extend warning codes and params**

```ts
export type OefImportBuildWarningCode =
  | /* existing union members */
  | 'propertyConversionFailed'
  | 'propertyUnmatched'

export type BuildOefBatchSaveParams = {
  // ...existing fields
  nodeTypeCustomPropertiesById?: Record<string, CustomProperty[]>
  componentCustomPropertiesById?: Record<string, CustomProperty[]>
  relationCustomPropertiesById?: Record<string, CustomProperty[]>
}
```

Import `CustomProperty` from `@/domain/attrs/notationAttrs` and helpers from `./oefPropertyConversion`.

- [ ] **Step 2: Merge in node/link loops**

Collect `allUnmatched: string[]`. For each node:

```ts
const merged = mergeOefPropertiesIntoBuckets({
  oefProperties: node.properties ?? {},
  typeDefaults,
  componentDefaults,
  typeSchema: params.nodeTypeCustomPropertiesById?.[mapped.nodeTypeId] ?? [],
  componentSchema: params.componentCustomPropertiesById?.[mapped.componentId] ?? [],
  entityId: node.sourceElementId,
  entityKind: 'node',
})
allUnmatched.push(...merged.unmatchedNames)
for (const failure of merged.conversionFailures) {
  warnings.push({
    code: 'propertyConversionFailed',
    sourceType: node.sourceType,
    sourceId: failure.entityId,
    message: `Property "${failure.propertyName}" value "${failure.rawValue}" is not a valid ${failure.targetType}`,
  })
}
// makeNodeAttrs(..., merged.typeValues, merged.componentValues)
```

For links use `mergeOefPropertiesIntoRelationValues`. After loops:

```ts
for (const { propertyName, count } of aggregateUnmatchedPropertyNames(allUnmatched)) {
  warnings.push({
    code: 'propertyUnmatched',
    message: `OEF property "${propertyName}" did not match any custom property (${count})`,
  })
}
```

- [ ] **Step 3: Test**

```ts
it('merges OEF properties into type and component values by name', () => {
  const draft = buildImportDraft(parseOefXml(propsXml))
  const result = buildOefBatchSaveRequest({
    draft,
    mapping: {
      elementTypeMap: {
        BusinessService: { nodeTypeId: 'nt-1', componentId: 'cmp-1' },
      },
      relationshipTypeMap: {
        Association: { linkTypeId: 'lt-1', relationId: 'rel-1' },
      },
    },
    notationId: 'notation-1',
    nodeTypePropertyDefaultsById: { 'nt-1': { Owner: 'Default', Count: 1 } },
    componentPropertyDefaultsById: { 'cmp-1': {} },
    relationPropertyDefaultsById: { 'rel-1': {} },
    nodeTypeCustomPropertiesById: {
      'nt-1': [
        { id: '1', name: 'Owner', type: 'string', required: false, min: null, max: null },
        { id: '2', name: 'Count', type: 'number', required: false, min: null, max: null },
      ],
    },
    componentCustomPropertiesById: {
      'cmp-1': [
        { id: '3', name: 'Owner', type: 'string', required: false, min: null, max: null },
      ],
    },
    relationCustomPropertiesById: {
      'rel-1': [
        { id: '4', name: 'Owner', type: 'string', required: false, min: null, max: null },
      ],
    },
  })

  const nodeAttrs = parseNodeAttrs(result.request.nodes.create[0]!.attrs)
  expect(nodeAttrs.typeProperties.Owner).toBe('Team A')
  expect(nodeAttrs.typeProperties.Count).toBe(7)
  expect(nodeAttrs.componentProperties['notation-1']?.['cmp-1']?.Owner).toBe('Team A')

  const linkAttrs = parseLinkAttrs(result.request.links.create[0]!.attrs)
  expect(linkAttrs.relationProperties['notation-1']?.['rel-1']?.Owner).toBe('Link Owner')

  expect(
    result.warnings.some(w => w.code === 'propertyUnmatched' && w.message.includes('OrphanProp'))
  ).toBe(true)
})
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/features/models/utils/oef/oefToBatchSave.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/models/utils/oef/oefToBatchSave.ts \
  src/features/models/utils/oef/oefToBatchSave.test.ts
git commit -m "$(cat <<'EOF'
feat(oef): merge imported properties into custom property attrs

EOF
)"
```

---

### Task 4: Wire useOefImport + i18n

**Files:**
- Modify: `src/features/models/composables/useOefImport.ts`
- Modify: `src/i18n/locales/models.ts`

- [ ] **Step 1: Pass schemas**

```ts
const nodeTypeCustomPropertiesById = Object.fromEntries(
  options.state.value.nodeTypes.map(nodeType => [
    nodeType.id,
    parseTypeAttrs(nodeType.attrs ?? null).customProperties ?? [],
  ])
)
const componentCustomPropertiesById = Object.fromEntries(
  options.state.value.components.map(component => [
    component.id,
    parseEntityAttrs(component.attrs ?? null).customProperties,
  ])
)
const relationCustomPropertiesById = Object.fromEntries(
  options.state.value.relations.map(relation => [
    relation.id,
    parseEntityAttrs(relation.attrs ?? null).customProperties,
  ])
)
```

Pass into `buildOefBatchSaveRequest`.

- [ ] **Step 2: Warning labels**

```ts
case 'propertyConversionFailed':
  return options.t('models.oefImportWarningPropertyConversionFailed')
case 'propertyUnmatched':
  return options.t('models.oefImportWarningPropertyUnmatched')
```

- [ ] **Step 3: i18n ru + en**

```ts
// ru
oefImportWarningPropertyConversionFailed:
  'Значение свойства OEF не удалось привести к типу',
oefImportWarningPropertyUnmatched:
  'Свойство OEF не совпало ни с одним кастомным свойством',

// en
oefImportWarningPropertyConversionFailed:
  'OEF property value could not be converted to the target type',
oefImportWarningPropertyUnmatched:
  'OEF property did not match any custom property',
```

- [ ] **Step 4: Commit**

```bash
git add src/features/models/composables/useOefImport.ts src/i18n/locales/models.ts
git commit -m "$(cat <<'EOF'
feat(oef): wire property schemas into import and warn on mismatches

EOF
)"
```

---

### Task 5: Server normalize — DTOs + parse

**Repo:** arepos-server

- [ ] **Step 1: DTO fields**

```kotlin
data class OefElementDto(
    val id: String,
    val type: String,
    val name: String,
    val properties: Map<String, String> = emptyMap(),
)

data class OefRelationshipDto(
    val id: String,
    val type: String,
    val sourceElementId: String,
    val targetElementId: String,
    val name: String = "",
    val properties: Map<String, String> = emptyMap(),
)
```

- [ ] **Step 2: Streaming parse strategy**

ArchiMate places `propertyDefinitions` **after** elements/relationships. Therefore:

1. Accumulate `propertyDefinitions: MutableMap<String, String>` (id → name) when definitions appear.
2. On each element/relationship store **raw** props keyed by `propertyDefinitionRef` → value (last wins).
3. After the full document, resolve refs to names before building DTOs:

```kotlin
fun resolveProperties(
    rawByRef: Map<String, String>,
    definitions: Map<String, String>,
): Map<String, String> {
    val out = linkedMapOf<String, String>()
    for ((ref, value) in rawByRef) {
        val name = definitions[ref]?.trim().orEmpty()
        if (name.isNotEmpty()) out[name] = value
    }
    return out
}
```

StAX paths:
- `model/propertyDefinitions/propertyDefinition` → identifier + name text
- under element/relationship: `properties/property` → `propertyDefinitionRef`; `value` → text into raw map

Ignore model-level and view-level properties (out of scope).

- [ ] **Step 3: Fixture + test**

Copy `element-properties.xml` to `src/test/resources/oef/element-properties.xml`.

```kotlin
@Test
fun `resolves element and relationship properties by definition name`() {
    val parsed = OefParseService().parse(readFixture("oef/element-properties.xml"))
    val element = parsed.elements.single()
    assertEquals(
        mapOf("Owner" to "Team A", "Count" to "7", "OrphanProp" to "x"),
        element.properties,
    )
    val relationship = parsed.relationships.single()
    assertEquals(mapOf("Owner" to "Link Owner"), relationship.properties)
}
```

- [ ] **Step 4: Run server tests**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server && ./gradlew test --tests "OefParseServiceTest"
```

- [ ] **Step 5: Commit (arepos-server)**

```bash
git add src/main/kotlin/ru/kavader/arepos/dto/oef/OefNormalizeDtos.kt \
  src/main/kotlin/ru/kavader/arepos/service/OefParseService.kt \
  src/test/kotlin/ru/kavader/arepos/service/OefParseServiceTest.kt \
  src/test/resources/oef/element-properties.xml
git commit -m "$(cat <<'EOF'
feat(oef): include element and relationship properties in normalize

EOF
)"
```

---

### Task 6: Client normalize passthrough + regression

- [ ] **Step 1: Preserve properties in `toOefParsedModel`**

```ts
export function toOefParsedModel(response: OefNormalizeResponse): OefParsedModel {
  return {
    model: response.model,
    elements: response.elements.map(element => ({
      ...element,
      properties:
        element.properties && typeof element.properties === 'object'
          ? element.properties
          : undefined,
    })),
    relationships: response.relationships.map(relationship => ({
      ...relationship,
      name: typeof relationship.name === 'string' ? relationship.name : '',
      properties:
        relationship.properties && typeof relationship.properties === 'object'
          ? relationship.properties
          : undefined,
    })),
    views: response.views,
    organizations: Array.isArray(response.organizations) ? response.organizations : [],
  }
}
```

Add/adjust unit test with a fake normalize response containing properties.

- [ ] **Step 2: Regression suite**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/oef/
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/models/utils/oef/oefNormalizeApi.ts \
  src/features/models/utils/oef/oefNormalizeApi.test.ts
git commit -m "$(cat <<'EOF'
fix(oef): preserve properties from server normalize response

EOF
)"
```

---

### Task 7: Spec status + plan commit

- [ ] **Step 1: Update design status**

In `docs/superpowers/specs/2026-07-27-oef-import-properties-design.md`:

`Status: approved design; plan ready`

- [ ] **Step 2: Final verification**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/oef/
cd /Users/nikolaygroznyh/Work/arepos-server && ./gradlew test --tests "OefParseServiceTest"
```

- [ ] **Step 3: Commit docs in warchi**

```bash
git add docs/superpowers/specs/2026-07-27-oef-import-properties-design.md \
  docs/superpowers/plans/2026-07-27-oef-import-properties.md
git commit -m "$(cat <<'EOF'
docs: add OEF property import implementation plan

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Parse propertyDefinitions + properties (client) | Task 2 |
| Parse on server normalize | Task 5 |
| Draft carries properties | Task 2 |
| Convert string/number/boolean/enum | Task 1 |
| Write to type + component + relation | Task 3 |
| Exact name match after trim | Task 1 |
| Conversion fail → warning, keep default | Task 1 + 3 |
| Unmatched → aggregated warning | Task 3 |
| OEF overrides defaults | Task 1 + 3 |
| No required/min/max/regex hardening | implicit (converter only types) |
| i18n warning labels | Task 4 |
| Preserve via normalize API | Task 6 |
| Regression without properties | Task 6 |

## Self-review notes

- StAX must resolve definitions after the full document (XSD order).
- Link merge reuses node helper via `mergeOefPropertiesIntoRelationValues`.
- `propertyUnmatched`: one warning per unique name with count; `propertyConversionFailed`: per failure (UI groups by code).

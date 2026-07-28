# OEF Import Relation Rules Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При OEF-импорте проверять связи по `relationRules` выбранной нотации; на шаге маппинга требовать явный `skip`/`import` по каждой группе недопустимых связей и отражать решение в batch-save + отчёте.

**Architecture:** Pure helper `oefRelationRuleValidation.ts` группирует disallowed links (component-level, как `allowedRelationsForConnection`). Wizard на шаге 2 показывает группы и копит `ruleDecisions`. `buildOefBatchSaveRequest` применяет решения: skip без model link/edge (без дубля diagram-warning), import с warning `linkImportedAgainstRelationRules`.

**Tech Stack:** Vue 3 + TypeScript (warchi), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-oef-import-relation-rules-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| Create `src/features/models/utils/oef/oefRelationRuleValidation.ts` | `isOefLinkAllowedByRelationRules`, `buildDisallowedOefLinkGroupKey`, `collectDisallowedOefLinkGroups` |
| Create `src/features/models/utils/oef/oefRelationRuleValidation.test.ts` | Unit tests for helper |
| Modify `src/features/models/utils/oef/oefToBatchSave.ts` | Accept `relationRules` + `ruleDecisions`; filter links; suppress diagram warning on rule-skip |
| Modify `src/features/models/utils/oef/oefToBatchSave.test.ts` | Allowing rules for happy path; skip/import cases |
| Modify `src/features/models/components/ModelImportWizard.vue` | Prop `relationRules`, UI groups, gate, emit `ruleDecisions`, preview counts |
| Modify `src/features/models/composables/useOefImport.ts` | Pass decisions + rules into build; warning labels |
| Modify `src/features/models/ModelEditor.vue` | Pass `:relation-rules="state.relationRules"` |
| Modify `src/i18n/locales/models.ts` | ru/en strings |

---

### Task 1: Pure helper — failing tests first

**Files:**
- Create: `src/features/models/utils/oef/oefRelationRuleValidation.test.ts`
- Create: `src/features/models/utils/oef/oefRelationRuleValidation.ts` (minimal stubs only after red)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { ImportDraft } from './types'
import type { ImportMappingState } from './mappingState'
import {
  buildDisallowedOefLinkGroupKey,
  collectDisallowedOefLinkGroups,
  isOefLinkAllowedByRelationRules,
} from './oefRelationRuleValidation'

describe('isOefLinkAllowedByRelationRules', () => {
  it('returns true when a matching rule exists', () => {
    expect(
      isOefLinkAllowedByRelationRules({
        fromComponentId: 'c-from',
        toComponentId: 'c-to',
        relationId: 'rel-1',
        relationRules: [
          { relationId: 'rel-1', fromComponentId: 'c-from', toComponentId: 'c-to' },
        ],
      })
    ).toBe(true)
  })

  it('returns false when no matching rule exists', () => {
    expect(
      isOefLinkAllowedByRelationRules({
        fromComponentId: 'c-from',
        toComponentId: 'c-to',
        relationId: 'rel-1',
        relationRules: [
          { relationId: 'rel-1', fromComponentId: 'other', toComponentId: 'c-to' },
        ],
      })
    ).toBe(false)
  })
})

describe('collectDisallowedOefLinkGroups', () => {
  const draft: ImportDraft = {
    sourceModelId: 'm1',
    sourceModelName: 'M',
    nodes: [
      { sourceElementId: 'e1', sourceType: 'BusinessService', name: 'A' },
      { sourceElementId: 'e2', sourceType: 'BusinessProcess', name: 'B' },
      { sourceElementId: 'e3', sourceType: 'BusinessProcess', name: 'C' },
    ],
    links: [
      {
        sourceRelationshipId: 'r1',
        sourceType: 'Serving',
        sourceElementId: 'e1',
        targetElementId: 'e2',
      },
      {
        sourceRelationshipId: 'r2',
        sourceType: 'Serving',
        sourceElementId: 'e1',
        targetElementId: 'e3',
      },
      {
        sourceRelationshipId: 'r3',
        sourceType: 'Triggering',
        sourceElementId: 'e2',
        targetElementId: 'e3',
      },
    ],
    diagrams: [],
    organizations: [],
    sourceElementTypes: ['BusinessService', 'BusinessProcess'],
    sourceRelationshipTypes: ['Serving', 'Triggering'],
  }

  const mapping: ImportMappingState = {
    elementTypeMap: {
      BusinessService: { nodeTypeId: 'nt-s', componentId: 'cmp-s' },
      BusinessProcess: { nodeTypeId: 'nt-p', componentId: 'cmp-p' },
    },
    relationshipTypeMap: {
      Serving: { linkTypeId: 'lt-s', relationId: 'rel-serving' },
      Triggering: { linkTypeId: 'lt-t', relationId: 'rel-triggering' },
    },
  }

  it('groups disallowed links by stable key and skips allowed ones', () => {
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping,
      relationRules: [
        {
          relationId: 'rel-triggering',
          fromComponentId: 'cmp-p',
          toComponentId: 'cmp-p',
        },
      ],
    })
    expect(groups).toHaveLength(1)
    expect(groups[0]!.count).toBe(2)
    expect(groups[0]!.sourceRelationshipIds).toEqual(['r1', 'r2'])
    expect(groups[0]!.key).toBe(
      buildDisallowedOefLinkGroupKey({
        sourceElementType: 'BusinessService',
        targetElementType: 'BusinessProcess',
        relationshipType: 'Serving',
        relationId: 'rel-serving',
        fromComponentId: 'cmp-s',
        toComponentId: 'cmp-p',
      })
    )
    expect(groups[0]!.relationshipType).toBe('Serving')
    expect(groups[0]!.sourceElementType).toBe('BusinessService')
    expect(groups[0]!.targetElementType).toBe('BusinessProcess')
    expect(groups[0]!.relationId).toBe('rel-serving')
  })

  it('skips links without full mapping', () => {
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping: {
        elementTypeMap: {
          BusinessService: { nodeTypeId: 'nt-s', componentId: 'cmp-s' },
          BusinessProcess: { nodeTypeId: null, componentId: null },
        },
        relationshipTypeMap: {
          Serving: { linkTypeId: 'lt-s', relationId: 'rel-serving' },
          Triggering: { linkTypeId: null, relationId: null },
        },
      },
      relationRules: [],
    })
    expect(groups).toHaveLength(0)
  })

  it('skips rel→rel endpoints (relationship id as source/target)', () => {
    const withRelEndpoint: ImportDraft = {
      ...draft,
      links: [
        {
          sourceRelationshipId: 'r1',
          sourceType: 'Serving',
          sourceElementId: 'e1',
          targetElementId: 'e2',
        },
        {
          sourceRelationshipId: 'r-assoc',
          sourceType: 'Association',
          sourceElementId: 'r1',
          targetElementId: 'e2',
        },
      ],
    }
    const groups = collectDisallowedOefLinkGroups({
      draft: withRelEndpoint,
      mapping: {
        ...mapping,
        relationshipTypeMap: {
          ...mapping.relationshipTypeMap,
          Association: { linkTypeId: 'lt-a', relationId: 'rel-a' },
        },
      },
      // Serving e1→e2 allowed; Association with rel endpoint must be ignored (not grouped)
      relationRules: [
        {
          relationId: 'rel-serving',
          fromComponentId: 'cmp-s',
          toComponentId: 'cmp-p',
        },
      ],
    })
    expect(groups).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/utils/oef/oefRelationRuleValidation.test.ts
```

Expected: FAIL — cannot find module / exports.

- [ ] **Step 3: Implement helper**

Create `src/features/models/utils/oef/oefRelationRuleValidation.ts`:

```ts
import type { ImportMappingState } from './mappingState'
import type { ImportDraft } from './types'

export type OefRelationRuleDecision = 'skip' | 'import'

export type OefRelationRuleRef = {
  relationId: string
  fromComponentId: string
  toComponentId: string
}

export type DisallowedOefLinkGroup = {
  key: string
  count: number
  sourceRelationshipIds: string[]
  relationshipType: string
  sourceElementType: string
  targetElementType: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}

const GROUP_KEY_SEP = '\u001f'

export function buildDisallowedOefLinkGroupKey(parts: {
  sourceElementType: string
  targetElementType: string
  relationshipType: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}): string {
  return [
    parts.sourceElementType,
    parts.targetElementType,
    parts.relationshipType,
    parts.relationId,
    parts.fromComponentId,
    parts.toComponentId,
  ].join(GROUP_KEY_SEP)
}

export function isOefLinkAllowedByRelationRules(params: {
  fromComponentId: string
  toComponentId: string
  relationId: string
  relationRules: OefRelationRuleRef[]
}): boolean {
  return params.relationRules.some(
    rule =>
      rule.relationId === params.relationId &&
      rule.fromComponentId === params.fromComponentId &&
      rule.toComponentId === params.toComponentId
  )
}

export function collectDisallowedOefLinkGroups(params: {
  draft: ImportDraft
  mapping: ImportMappingState
  relationRules: OefRelationRuleRef[]
}): DisallowedOefLinkGroup[] {
  const nodeTypeByElementId = new Map(
    params.draft.nodes.map(node => [node.sourceElementId, node.sourceType])
  )
  const relationshipIds = new Set(params.draft.links.map(link => link.sourceRelationshipId))
  const groups = new Map<string, DisallowedOefLinkGroup>()

  for (const link of params.draft.links) {
    if (relationshipIds.has(link.sourceElementId) || relationshipIds.has(link.targetElementId)) {
      continue
    }
    const sourceElementType = nodeTypeByElementId.get(link.sourceElementId)
    const targetElementType = nodeTypeByElementId.get(link.targetElementId)
    if (!sourceElementType || !targetElementType) continue

    const sourceMapped = params.mapping.elementTypeMap[sourceElementType]
    const targetMapped = params.mapping.elementTypeMap[targetElementType]
    const relMapped = params.mapping.relationshipTypeMap[link.sourceType]
    if (
      !sourceMapped?.componentId ||
      !targetMapped?.componentId ||
      !relMapped?.relationId ||
      !relMapped.linkTypeId
    ) {
      continue
    }

    if (
      isOefLinkAllowedByRelationRules({
        fromComponentId: sourceMapped.componentId,
        toComponentId: targetMapped.componentId,
        relationId: relMapped.relationId,
        relationRules: params.relationRules,
      })
    ) {
      continue
    }

    const key = buildDisallowedOefLinkGroupKey({
      sourceElementType,
      targetElementType,
      relationshipType: link.sourceType,
      relationId: relMapped.relationId,
      fromComponentId: sourceMapped.componentId,
      toComponentId: targetMapped.componentId,
    })
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.sourceRelationshipIds.push(link.sourceRelationshipId)
      continue
    }
    groups.set(key, {
      key,
      count: 1,
      sourceRelationshipIds: [link.sourceRelationshipId],
      relationshipType: link.sourceType,
      sourceElementType,
      targetElementType,
      relationId: relMapped.relationId,
      fromComponentId: sourceMapped.componentId,
      toComponentId: targetMapped.componentId,
    })
  }

  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/features/models/utils/oef/oefRelationRuleValidation.test.ts
```

- [ ] **Step 5: Commit** (если пользователь просит коммиты в ходе реализации)

```bash
git add src/features/models/utils/oef/oefRelationRuleValidation.ts \
  src/features/models/utils/oef/oefRelationRuleValidation.test.ts
git commit -m "$(cat <<'EOF'
feat(oef): add relation-rule validation helpers for import

EOF
)"
```

---

### Task 2: Wire validation into `buildOefBatchSaveRequest`

**Files:**
- Modify: `src/features/models/utils/oef/oefToBatchSave.ts`
- Modify: `src/features/models/utils/oef/oefToBatchSave.test.ts`

- [ ] **Step 1: Extend warning codes and params**

In `oefToBatchSave.ts`:

1. Import helpers:

```ts
import {
  buildDisallowedOefLinkGroupKey,
  isOefLinkAllowedByRelationRules,
  type OefRelationRuleDecision,
  type OefRelationRuleRef,
} from './oefRelationRuleValidation'
```

2. Add to `OefImportBuildWarningCode`:

```ts
  | 'linkNotAllowedByRelationRules'
  | 'linkImportedAgainstRelationRules'
```

3. Extend `BuildOefBatchSaveParams`:

```ts
  /** When set (including empty), enforce notation relation rules for mapped links. */
  relationRules?: OefRelationRuleRef[]
  /** Required for each disallowed group when relationRules is set. Missing → treat as skip. */
  ruleDecisions?: Record<string, OefRelationRuleDecision>
```

- [ ] **Step 2: Apply decisions in links loop**

After `sourceId`/`targetId` checks succeed and before creating the link:

```ts
  const skippedByRelationRules = new Set<string>()

  // inside links loop, after mapped + sourceId/targetId ok:
  const sourceElementType = /* from draft node map — build Map<sourceElementId, sourceType> once before loop */
  const targetElementType = ...
  const fromComponentId = params.mapping.elementTypeMap[sourceElementType!]?.componentId
  const toComponentId = params.mapping.elementTypeMap[targetElementType!]?.componentId

  if (params.relationRules && fromComponentId && toComponentId) {
    const allowed = isOefLinkAllowedByRelationRules({
      fromComponentId,
      toComponentId,
      relationId: mapped.relationId,
      relationRules: params.relationRules,
    })
    if (!allowed) {
      const groupKey = buildDisallowedOefLinkGroupKey({
        sourceElementType: sourceElementType!,
        targetElementType: targetElementType!,
        relationshipType: link.sourceType,
        relationId: mapped.relationId,
        fromComponentId,
        toComponentId,
      })
      const decision = params.ruleDecisions?.[groupKey] ?? 'skip'
      if (decision === 'skip') {
        skippedByRelationRules.add(link.sourceRelationshipId)
        warnings.push({
          code: 'linkNotAllowedByRelationRules',
          sourceType: link.sourceType,
          sourceId: link.sourceRelationshipId,
          message: `Link "${link.sourceRelationshipId}" skipped: not allowed by notation relation rules`,
        })
        continue
      }
      warnings.push({
        code: 'linkImportedAgainstRelationRules',
        sourceType: link.sourceType,
        sourceId: link.sourceRelationshipId,
        message: `Link "${link.sourceRelationshipId}" imported against notation relation rules`,
      })
      // fall through to create
    }
  }
```

Build `elementTypeById` once before the links loop from `params.draft.nodes`.

- [ ] **Step 3: Suppress diagram warning for rule-skips**

Where model connections check `linkTempBySourceRelationshipId`:

```ts
      const modelLinkId = linkTempBySourceRelationshipId.get(connection.sourceRelationshipId)
      if (!modelLinkId) {
        if (skippedByRelationRules.has(connection.sourceRelationshipId)) {
          continue
        }
        warnings.push({
          code: 'diagramConnectionMissingModelLink',
          ...
        })
        continue
      }
```

- [ ] **Step 4: Update existing happy-path tests**

Any test that expects links created **and** will pass `relationRules` must include allowing rules. Prefer: **do not pass** `relationRules` in existing tests (validation off when undefined) — keep backward compatible. Add **new** tests that pass `relationRules`.

Add tests:

```ts
  it('skips links disallowed by relation rules when decision is skip', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const mapping = buildFullMappingState()
    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
      relationRules: [], // all mapped links disallowed
      ruleDecisions: Object.fromEntries(
        // build keys for all disallowed groups via collectDisallowedOefLinkGroups
      ),
    })
    // After computing groups with collectDisallowedOefLinkGroups + decision skip for each:
    expect(result.request.links.create).toHaveLength(0)
    expect(result.warnings.every(w => w.code === 'linkNotAllowedByRelationRules')).toBe(true)
    expect(result.warnings.some(w => w.code === 'diagramConnectionMissingModelLink')).toBe(false)
  })

  it('force-imports disallowed links when decision is import', () => {
    const draft = buildImportDraft(parseOefXml(mainXml))
    const mapping = buildFullMappingState()
    const groups = collectDisallowedOefLinkGroups({
      draft,
      mapping,
      relationRules: [],
    })
    const ruleDecisions = Object.fromEntries(groups.map(g => [g.key, 'import' as const]))
    const result = buildOefBatchSaveRequest({
      draft,
      mapping,
      notationId: 'notation-1',
      relationRules: [],
      ruleDecisions,
    })
    expect(result.request.links.create).toHaveLength(5)
    expect(
      result.warnings.filter(w => w.code === 'linkImportedAgainstRelationRules')
    ).toHaveLength(5)
  })
```

Use `collectDisallowedOefLinkGroups` in the skip test to fill `ruleDecisions` with `'skip'` for every group (or omit decisions — defensive default skip).

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/features/models/utils/oef/oefToBatchSave.test.ts src/features/models/utils/oef/oefRelationRuleValidation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit** (по запросу)

```bash
git add src/features/models/utils/oef/oefToBatchSave.ts \
  src/features/models/utils/oef/oefToBatchSave.test.ts
git commit -m "$(cat <<'EOF'
feat(oef): apply relation-rule decisions in batch-save build

EOF
)"
```

---

### Task 3: i18n strings

**Files:**
- Modify: `src/i18n/locales/models.ts`

- [ ] **Step 1: Add ru keys** (near other `oefImport*` keys)

```ts
oefImportRelationRulesTitle: 'Связи вне правил нотации',
oefImportRelationRulesHint:
  'Для каждой группы выберите: пропустить или импортировать вопреки правилам. Без выбора дальше нельзя.',
oefImportRelationRulesSkip: 'Пропустить',
oefImportRelationRulesImport: 'Импортировать всё равно',
oefImportRelationRulesNeedDecision: 'Нужен выбор для всех групп недопустимых связей',
oefImportRelationRulesGroupLabel:
  '{relationshipType}: {sourceType} → {targetType} ({relationName}) — {count}',
oefImportStatLinksPlanned: 'Связей к созданию: {count}',
oefImportWarningLinkNotAllowedByRelationRules:
  'Связь пропущена: не допускается правилами нотации',
oefImportWarningLinkImportedAgainstRelationRules:
  'Связь импортирована вопреки правилам нотации',
```

- [ ] **Step 2: Add en keys** (English section of same file)

```ts
oefImportRelationRulesTitle: 'Links outside notation rules',
oefImportRelationRulesHint:
  'For each group choose skip or import anyway. You cannot continue until every group has a choice.',
oefImportRelationRulesSkip: 'Skip',
oefImportRelationRulesImport: 'Import anyway',
oefImportRelationRulesNeedDecision: 'Choose an action for every disallowed link group',
oefImportRelationRulesGroupLabel:
  '{relationshipType}: {sourceType} → {targetType} ({relationName}) — {count}',
oefImportStatLinksPlanned: 'Links to create: {count}',
oefImportWarningLinkNotAllowedByRelationRules:
  'Link skipped: not allowed by notation relation rules',
oefImportWarningLinkImportedAgainstRelationRules:
  'Link imported against notation relation rules',
```

- [ ] **Step 3: Commit** (по запросу)

---

### Task 4: Wizard UI + gates + preview counts

**Files:**
- Modify: `src/features/models/components/ModelImportWizard.vue`

- [ ] **Step 1: Props, imports, state**

```ts
import type { RelationRuleResponse } from '@/types/api'
import {
  collectDisallowedOefLinkGroups,
  type DisallowedOefLinkGroup,
  type OefRelationRuleDecision,
} from '../utils/oef/oefRelationRuleValidation'

// props:
relationRules?: RelationRuleResponse[]

// emit submit:
submit: [{
  draft: ImportDraft
  notationId: string
  mapping: ImportMappingState
  ruleDecisions: Record<string, OefRelationRuleDecision>
}]

const ruleDecisions = ref<Record<string, OefRelationRuleDecision>>({})
```

Default prop: `relationRules: () => []`.

- [ ] **Step 2: Computed groups + prune decisions**

```ts
const disallowedLinkGroups = computed((): DisallowedOefLinkGroup[] => {
  if (!draft.value || !selectedNotationId.value) return []
  return collectDisallowedOefLinkGroups({
    draft: draft.value,
    mapping: mappingState.value,
    relationRules: props.relationRules ?? [],
  })
})

const allRelationRuleDecisionsMade = computed(() =>
  disallowedLinkGroups.value.every(group => {
    const d = ruleDecisions.value[group.key]
    return d === 'skip' || d === 'import'
  })
)

watch(disallowedLinkGroups, groups => {
  const alive = new Set(groups.map(g => g.key))
  const next: Record<string, OefRelationRuleDecision> = {}
  for (const [key, value] of Object.entries(ruleDecisions.value)) {
    if (alive.has(key)) next[key] = value
  }
  ruleDecisions.value = next
})
```

Reset `ruleDecisions` in `resetState` and when notation changes (same place mapping is rebuilt).

- [ ] **Step 3: Gate `canMoveToPreview`**

```ts
const canMoveToPreview = computed(
  () =>
    canMoveToMappings.value &&
    mappedElementsCount.value === (draft.value?.sourceElementTypes.length ?? 0) &&
    mappedRelationshipsCount.value === (draft.value?.sourceRelationshipTypes.length ?? 0) &&
    allRelationRuleDecisionsMade.value
)
```

- [ ] **Step 4: Planned links count for step 3**

```ts
const plannedLinksCount = computed(() => {
  if (!draft.value) return 0
  const skipped = new Set<string>()
  for (const group of disallowedLinkGroups.value) {
    if (ruleDecisions.value[group.key] === 'skip') {
      for (const id of group.sourceRelationshipIds) skipped.add(id)
    }
  }
  // Approximate: model links that are fully mapped and not rule-skipped.
  // Prefer recount with same filters as collect (non-rel→rel, mapped endpoints).
  let count = 0
  const relationshipIds = new Set(draft.value.links.map(l => l.sourceRelationshipId))
  const nodeTypeById = new Map(draft.value.nodes.map(n => [n.sourceElementId, n.sourceType]))
  for (const link of draft.value.links) {
    if (relationshipIds.has(link.sourceElementId) || relationshipIds.has(link.targetElementId)) continue
    const st = nodeTypeById.get(link.sourceElementId)
    const tt = nodeTypeById.get(link.targetElementId)
    if (!st || !tt) continue
    const sm = mappingState.value.elementTypeMap[st]
    const tm = mappingState.value.elementTypeMap[tt]
    const rm = mappingState.value.relationshipTypeMap[link.sourceType]
    if (!sm?.componentId || !tm?.componentId || !rm?.relationId || !rm.linkTypeId) continue
    if (skipped.has(link.sourceRelationshipId)) continue
    count += 1
  }
  return count
})
```

On step 3 stats, show `plannedLinksCount` (e.g. replace or add `oefImportStatLinksPlanned`).

- [ ] **Step 5: Template block after relationship mappings**

```vue
        <div
          v-if="disallowedLinkGroups.length > 0"
          class="oef-import__mapping oef-import__relation-rules"
        >
          <h4>{{ t('models.oefImportRelationRulesTitle') }}</h4>
          <p class="oef-import__hint">{{ t('models.oefImportRelationRulesHint') }}</p>
          <p
            v-if="!allRelationRuleDecisionsMade"
            class="oef-import__hint oef-import__hint--warn"
          >
            {{ t('models.oefImportRelationRulesNeedDecision') }}
          </p>
          <div
            v-for="group in disallowedLinkGroups"
            :key="group.key"
            class="oef-import__rule-group"
          >
            <span class="oef-import__source">
              {{
                t('models.oefImportRelationRulesGroupLabel', {
                  relationshipType: group.relationshipType,
                  sourceType: group.sourceElementType,
                  targetType: group.targetElementType,
                  relationName: relationById.get(group.relationId)?.name ?? group.relationId,
                  count: group.count,
                })
              }}
            </span>
            <div class="oef-import__rule-actions">
              <label>
                <input
                  type="radio"
                  :name="`rule-${group.key}`"
                  :checked="ruleDecisions[group.key] === 'skip'"
                  @change="ruleDecisions[group.key] = 'skip'"
                />
                {{ t('models.oefImportRelationRulesSkip') }}
              </label>
              <label>
                <input
                  type="radio"
                  :name="`rule-${group.key}`"
                  :checked="ruleDecisions[group.key] === 'import'"
                  @change="ruleDecisions[group.key] = 'import'"
                />
                {{ t('models.oefImportRelationRulesImport') }}
              </label>
            </div>
          </div>
        </div>
```

Note: `ruleDecisions` is a ref — in template use `ruleDecisions[group.key]` (auto-unwrap) and assign via small helpers if reactivity on nested keys is flaky:

```ts
function setRuleDecision(key: string, decision: OefRelationRuleDecision): void {
  ruleDecisions.value = { ...ruleDecisions.value, [key]: decision }
}
```

- [ ] **Step 6: Styles** (scoped, match existing BEM)

```css
.oef-import__rule-group {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border, #e5e5e5);
}
.oef-import__rule-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.oef-import__hint--warn {
  color: var(--warning, #e67e22);
}
```

- [ ] **Step 7: `submitImport`**

```ts
  emit('submit', {
    draft: draft.value,
    notationId: selectedNotationId.value,
    mapping: mappingState.value,
    ruleDecisions: { ...ruleDecisions.value },
  })
```

---

### Task 5: Wire ModelEditor + useOefImport

**Files:**
- Modify: `src/features/models/ModelEditor.vue`
- Modify: `src/features/models/composables/useOefImport.ts`

- [ ] **Step 1: ModelEditor prop**

```vue
  <ModelImportWizard
    ...
    :relation-rules="state.relationRules"
    ...
  />
```

- [ ] **Step 2: `handleOefImportSubmit` payload**

```ts
  async function handleOefImportSubmit(payload: {
    draft: ImportDraft
    notationId: string
    mapping: ImportMappingState
    ruleDecisions: Record<string, OefRelationRuleDecision>
  }): Promise<void> {
    ...
    const built = buildOefBatchSaveRequest({
      draft: payload.draft,
      notationId: payload.notationId,
      mapping: payload.mapping,
      relationRules: options.state.value.relationRules,
      ruleDecisions: payload.ruleDecisions,
      directoryNodeTypeId,
      ...
    })
```

Import `OefRelationRuleDecision` type from the validation module.

- [ ] **Step 3: Warning labels**

```ts
      case 'linkNotAllowedByRelationRules':
        return options.t('models.oefImportWarningLinkNotAllowedByRelationRules')
      case 'linkImportedAgainstRelationRules':
        return options.t('models.oefImportWarningLinkImportedAgainstRelationRules')
```

- [ ] **Step 4: Run focused tests + typecheck**

```bash
npx vitest run src/features/models/utils/oef/oefRelationRuleValidation.test.ts \
  src/features/models/utils/oef/oefToBatchSave.test.ts
npx vue-tsc --noEmit
```

Expected: PASS / no errors related to this change.

- [ ] **Step 5: Manual smoke** (локально)

1. Открыть модель → Import OEF → выбрать нотацию с правилами.
2. Смэппить типы так, чтобы появились disallowed-группы.
3. Next на шаг 3 заблокирован без выбора.
4. Skip всех → импорт: links=0 по этим группам, warning в отчёте.
5. Import anyway → links созданы, warning force в отчёте.

- [ ] **Step 6: Commit** (по запросу)

```bash
git add \
  src/features/models/components/ModelImportWizard.vue \
  src/features/models/composables/useOefImport.ts \
  src/features/models/ModelEditor.vue \
  src/i18n/locales/models.ts \
  docs/superpowers/specs/2026-07-25-oef-import-relation-rules-design.md \
  docs/superpowers/plans/2026-07-25-oef-import-relation-rules.md
git commit -m "$(cat <<'EOF'
feat(oef): validate import links against notation relation rules

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Component-level rule check helper | Task 1 |
| Group by key + count | Task 1 |
| Skip unmapped / rel→rel | Task 1 |
| Build skip + warning | Task 2 |
| Build force-import + warning | Task 2 |
| No duplicate diagram warning on rule-skip | Task 2 |
| Wizard step 2 UI + mandatory decision | Task 4 |
| `relationRules` prop + emit decisions | Task 4–5 |
| Preview planned link counts | Task 4 |
| i18n + report labels | Task 3, 5 |
| Empty rules → all typed mapped links disallowed | Task 1–2 (`relationRules: []`) |
| Decisions not in localStorage cache | Task 4 (only `ruleDecisions` ref) |
| Backend unchanged | — |

## Out of scope (do not implement)

- Server-side rule validation in batch-save
- Per-link remap / editing notation rules from wizard
- Auto-creating missing relation rules

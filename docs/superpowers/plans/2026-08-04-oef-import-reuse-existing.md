# OEF Import Reuse Existing Nodes/Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На шаге preview OEF-импорта дать настройки переиспользования существующих нод/связей модели (create vs reuse, критерий связи, reuseId vs updateFromOef) и применить резолв в chunked batch-save.

**Architecture:** Pure `resolveOefEntityMatches` (preview + inside build). Label criterion uses `edge.attrs.label`; when active, hydrate all diagram attrs via `ensureDiagramAttrsLoaded` first. `buildOefBatchSaveRequest` + update chunks; wizard settings/counters. See updated spec for relation-rules-only-on-create, no nodeUpdateNameSkipped.

**Tech Stack:** Vue 3 + TypeScript (warchi), Vitest. Backend без изменений.

**Spec:** `docs/superpowers/specs/2026-08-04-oef-import-reuse-existing-design.md`

**Branch:** `feat/oef-import-reuse-existing` в `warchi` (papirus / arepos-server не трогаем).

---

## File map

| File | Responsibility |
|------|----------------|
| Create `src/features/models/utils/oef/reuseSettings.ts` | Types, defaults, localStorage load/save/merge |
| Create `src/features/models/utils/oef/reuseSettings.test.ts` | Cache sanitize tests |
| Create `src/features/models/utils/oef/oefEntityReuse.ts` | `resolveOefEntityMatches` + summary counters |
| Create `src/features/models/utils/oef/oefEntityReuse.test.ts` | Match / ambiguous / link criteria |
| Modify `src/features/models/utils/oef/oefToBatchSave.ts` | Accept existing nodes/links + settings; create/reuse/update |
| Modify `src/features/models/utils/oef/oefToBatchSave.test.ts` | Reuse/update cases |
| Modify `src/features/models/utils/oef/chunkOefBatchSave.ts` | Plan/apply update chunks; progress counts |
| Modify `src/features/models/utils/oef/chunkOefBatchSave.test.ts` | Update chunks + mixed remap |
| Modify `src/features/models/components/ModelImportWizard.vue` | Preview settings UI + emit settings |
| Modify `src/features/models/composables/useOefImport.ts` | Pass existing + settings; report counters; warning labels |
| Modify `src/features/models/ModelEditor.vue` | Only if wizard props need existing lists (prefer pass via useOefImport submit path) |
| Modify `src/i18n/locales/models.ts` | ru/en strings |
| Modify `src/features/docs/content/models.md` + `models.en.md` | Document reuse settings |

---

### Task 0: Feature branch

**Repos:** warchi

- [ ] **Step 1: Create branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi && git checkout -b feat/oef-import-reuse-existing
```

Expected: on `feat/oef-import-reuse-existing`.

- [ ] **Step 2: Commit restored/approved spec if untracked**

```bash
git add docs/superpowers/specs/2026-08-04-oef-import-reuse-existing-design.md \
        docs/superpowers/plans/2026-08-04-oef-import-reuse-existing.md
git commit -m "$(cat <<'EOF'
docs: OEF import reuse existing nodes/links design and plan

EOF
)"
```

---

### Task 1: `reuseSettings` — types + cache

**Files:**
- Create: `src/features/models/utils/oef/reuseSettings.test.ts`
- Create: `src/features/models/utils/oef/reuseSettings.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultOefReuseSettings,
  loadCachedOefReuseSettings,
  mergeOefReuseSettings,
  saveCachedOefReuseSettings,
  type OefReuseSettings,
} from './reuseSettings'

describe('reuseSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults', () => {
    expect(createDefaultOefReuseSettings()).toEqual({
      nodesMode: 'alwaysCreate',
      linksMode: 'alwaysCreate',
      linkMatchCriterion: 'endpointsAndType',
      onNodeMatch: 'reuseId',
      onLinkMatch: 'reuseId',
    })
  })

  it('round-trips cache per notationId', () => {
    const settings: OefReuseSettings = {
      nodesMode: 'reuseMatching',
      linksMode: 'reuseMatching',
      linkMatchCriterion: 'endpointsTypeAndLabel',
      onNodeMatch: 'updateFromOef',
      onLinkMatch: 'reuseId',
    }
    saveCachedOefReuseSettings('notation-1', settings)
    expect(loadCachedOefReuseSettings('notation-1')).toEqual(settings)
    expect(loadCachedOefReuseSettings('other')).toBeNull()
  })

  it('merges cached over defaults and drops invalid enums', () => {
    const merged = mergeOefReuseSettings(createDefaultOefReuseSettings(), {
      nodesMode: 'reuseMatching',
      linksMode: 'nope' as OefReuseSettings['linksMode'],
      linkMatchCriterion: 'endpointsAndType',
      onNodeMatch: 'reuseId',
      onLinkMatch: 'updateFromOef',
    })
    expect(merged.nodesMode).toBe('reuseMatching')
    expect(merged.linksMode).toBe('alwaysCreate')
    expect(merged.onLinkMatch).toBe('updateFromOef')
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
npx vitest run src/features/models/utils/oef/reuseSettings.test.ts
```

- [ ] **Step 3: Implement**

```ts
import { loadJson, saveJson } from '@/utils/localStorage'

export type OefEntityImportMode = 'alwaysCreate' | 'reuseMatching'
export type OefLinkMatchCriterion = 'endpointsAndType' | 'endpointsTypeAndLabel'
export type OefOnMatchPolicy = 'reuseId' | 'updateFromOef'

export type OefReuseSettings = {
  nodesMode: OefEntityImportMode
  linksMode: OefEntityImportMode
  linkMatchCriterion: OefLinkMatchCriterion
  onNodeMatch: OefOnMatchPolicy
  onLinkMatch: OefOnMatchPolicy
}

type Cached = { version: 1; notationId: string } & OefReuseSettings

const STORAGE_PREFIX = 'warchi:model-import:oef-reuse'

const MODES = new Set<OefEntityImportMode>(['alwaysCreate', 'reuseMatching'])
const CRITERIA = new Set<OefLinkMatchCriterion>(['endpointsAndType', 'endpointsTypeAndLabel'])
const POLICIES = new Set<OefOnMatchPolicy>(['reuseId', 'updateFromOef'])

export function createDefaultOefReuseSettings(): OefReuseSettings {
  return {
    nodesMode: 'alwaysCreate',
    linksMode: 'alwaysCreate',
    linkMatchCriterion: 'endpointsAndType',
    onNodeMatch: 'reuseId',
    onLinkMatch: 'reuseId',
  }
}

function storageKey(notationId: string): string {
  return `${STORAGE_PREFIX}:${notationId}`
}

function sanitize(raw: Partial<OefReuseSettings> | null | undefined): OefReuseSettings {
  const d = createDefaultOefReuseSettings()
  if (!raw) return d
  return {
    nodesMode: MODES.has(raw.nodesMode as OefEntityImportMode)
      ? (raw.nodesMode as OefEntityImportMode)
      : d.nodesMode,
    linksMode: MODES.has(raw.linksMode as OefEntityImportMode)
      ? (raw.linksMode as OefEntityImportMode)
      : d.linksMode,
    linkMatchCriterion: CRITERIA.has(raw.linkMatchCriterion as OefLinkMatchCriterion)
      ? (raw.linkMatchCriterion as OefLinkMatchCriterion)
      : d.linkMatchCriterion,
    onNodeMatch: POLICIES.has(raw.onNodeMatch as OefOnMatchPolicy)
      ? (raw.onNodeMatch as OefOnMatchPolicy)
      : d.onNodeMatch,
    onLinkMatch: POLICIES.has(raw.onLinkMatch as OefOnMatchPolicy)
      ? (raw.onLinkMatch as OefOnMatchPolicy)
      : d.onLinkMatch,
  }
}

export function loadCachedOefReuseSettings(notationId: string): OefReuseSettings | null {
  const raw = loadJson<Cached>(storageKey(notationId))
  if (!raw || raw.version !== 1 || raw.notationId !== notationId) return null
  return sanitize(raw)
}

export function saveCachedOefReuseSettings(notationId: string, settings: OefReuseSettings): void {
  const payload: Cached = { version: 1, notationId, ...sanitize(settings) }
  saveJson(storageKey(notationId), payload)
}

export function mergeOefReuseSettings(
  defaults: OefReuseSettings,
  cached: Partial<OefReuseSettings> | null
): OefReuseSettings {
  if (!cached) return defaults
  return sanitize({ ...defaults, ...cached })
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/models/utils/oef/reuseSettings.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/models/utils/oef/reuseSettings.ts src/features/models/utils/oef/reuseSettings.test.ts
git commit -m "$(cat <<'EOF'
feat(oef): add reuse settings types and localStorage cache

EOF
)"
```

---

### Task 2: `resolveOefEntityMatches` — pure resolver

**Files:**
- Create: `src/features/models/utils/oef/oefEntityReuse.test.ts`
- Create: `src/features/models/utils/oef/oefEntityReuse.ts`

Use minimal stubs for `EditorNode` / `EditorLink` shapes (`id`, `name`, `nodeTypeId`, `parsedAttrs`, `sourceId`, `targetId`, `linkTypeId`, `updatedAt` optional).

- [ ] **Step 1: Write failing tests** (key cases)

```ts
import { describe, expect, it } from 'vitest'
import type { EditorDiagram, EditorLink, EditorNode } from '../../types'
import type { ImportDraft } from './types'
import type { ImportMappingState } from './mappingState'
import { createDefaultOefReuseSettings } from './reuseSettings'
import { resolveOefEntityMatches } from './oefEntityReuse'

function node(partial: Partial<EditorNode> & Pick<EditorNode, 'id' | 'name' | 'nodeTypeId'>): EditorNode {
  return {
    modelId: 'm',
    ownerId: 'o',
    createdAt: null,
    updatedAt: null,
    attrs: null,
    parentNodeId: null,
    parsedAttrs: {
      treeOrder: 0,
      notationComponents: {},
      componentProperties: {},
      typeProperties: {},
    },
    ...partial,
  } as EditorNode
}

function link(partial: Partial<EditorLink> & Pick<EditorLink, 'id' | 'sourceId' | 'targetId' | 'linkTypeId'>): EditorLink {
  return {
    modelId: 'm',
    ownerId: 'o',
    createdAt: null,
    updatedAt: null,
    attrs: null,
    parsedAttrs: { notationRelations: {}, relationProperties: {} },
    ...partial,
  } as EditorLink
}

const mapping: ImportMappingState = {
  elementTypeMap: {
    BusinessService: { nodeTypeId: 'nt-svc', componentId: 'cmp-svc' },
    BusinessProcess: { nodeTypeId: 'nt-proc', componentId: 'cmp-proc' },
  },
  relationshipTypeMap: {
    Serving: { linkTypeId: 'lt-serving', relationId: 'rel-serving' },
  },
}

const draft: ImportDraft = {
  sourceModelId: 'src',
  sourceModelName: 'S',
  nodes: [
    { sourceElementId: 'e1', sourceType: 'BusinessService', name: 'Alpha' },
    { sourceElementId: 'e2', sourceType: 'BusinessProcess', name: 'Beta' },
  ],
  links: [
    {
      sourceRelationshipId: 'r1',
      sourceType: 'Serving',
      sourceElementId: 'e1',
      targetElementId: 'e2',
      name: '',
    },
  ],
  diagrams: [],
  organizations: [],
}

describe('resolveOefEntityMatches', () => {
  it('alwaysCreate ignores existing nodes', () => {
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' })],
      existingLinks: [],
      settings: createDefaultOefReuseSettings(),
    })
    expect(result.nodes.e1?.action).toBe('create')
  })

  it('reuses node by name+type; ambiguous picks lowest id', () => {
    const settings = { ...createDefaultOefReuseSettings(), nodesMode: 'reuseMatching' as const }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-b', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-a', name: 'Alpha', nodeTypeId: 'nt-svc' }),
      ],
      existingLinks: [],
      existingDiagrams: [],
      settings,
    })
    expect(result.nodes.e1).toEqual({ action: 'reuse', id: 'n-a' })
    expect(result.warnings.some(w => w.code === 'nodeMatchAmbiguous')).toBe(true)
  })

  it('requires componentId when candidate has notation binding', () => {
    const settings = { ...createDefaultOefReuseSettings(), nodesMode: 'reuseMatching' as const }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({
          id: 'n-1',
          name: 'Alpha',
          nodeTypeId: 'nt-svc',
          parsedAttrs: {
            treeOrder: 0,
            notationComponents: { n1: { componentId: 'other-cmp' } },
            componentProperties: {},
            typeProperties: {},
          },
        }),
      ],
      existingLinks: [],
      existingDiagrams: [],
      settings,
    })
    expect(result.nodes.e1?.action).toBe('create')
  })

  it('reuses link only when both endpoints resolve to existing ids', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      linksMode: 'reuseMatching' as const,
    }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        link({ id: 'l-1', sourceId: 'n-alpha', targetId: 'n-beta', linkTypeId: 'lt-serving' }),
      ],
      existingDiagrams: [],
      settings,
    })
    expect(result.links.r1).toEqual({ action: 'reuse', id: 'l-1' })
  })

  it('endpointsTypeAndLabel matches OEF name against diagram edge attrs.label', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      linksMode: 'reuseMatching' as const,
      linkMatchCriterion: 'endpointsTypeAndLabel' as const,
    }
    const namedDraft: ImportDraft = {
      ...draft,
      links: [{ ...draft.links[0]!, name: 'Flow' }],
    }
    const diagram = {
      id: 'd1',
      name: 'D',
      version: '1.0.0',
      modelId: 'm',
      ownerId: 'o',
      notationId: 'n1',
      nodeId: null,
      createdAt: null,
      updatedAt: null,
      attrs: null,
      parsedAttrs: {
        instances: {
          nodes: [],
          edges: [
            {
              id: 'e1',
              modelLinkId: 'l-1',
              sourceInstanceId: 'a',
              targetInstanceId: 'b',
              attrs: { label: 'Flow' },
            },
          ],
        },
      },
    } as EditorDiagram
    const result = resolveOefEntityMatches({
      draft: namedDraft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        link({ id: 'l-1', sourceId: 'n-alpha', targetId: 'n-beta', linkTypeId: 'lt-serving' }),
      ],
      existingDiagrams: [diagram],
      settings,
    })
    expect(result.links.r1).toEqual({ action: 'reuse', id: 'l-1' })
  })

  it('endpointsTypeAndLabel does not match when edge label differs from OEF name', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      linksMode: 'reuseMatching' as const,
      linkMatchCriterion: 'endpointsTypeAndLabel' as const,
    }
    const namedDraft: ImportDraft = {
      ...draft,
      links: [{ ...draft.links[0]!, name: 'Flow' }],
    }
    const diagram = {
      id: 'd1',
      name: 'D',
      version: '1.0.0',
      modelId: 'm',
      ownerId: 'o',
      notationId: 'n1',
      nodeId: null,
      createdAt: null,
      updatedAt: null,
      attrs: null,
      parsedAttrs: {
        instances: {
          nodes: [],
          edges: [
            {
              id: 'e1',
              modelLinkId: 'l-1',
              sourceInstanceId: 'a',
              targetInstanceId: 'b',
              attrs: { label: 'Other' },
            },
          ],
        },
      },
    } as EditorDiagram
    const result = resolveOefEntityMatches({
      draft: namedDraft,
      mapping,
      notationId: 'n1',
      existingNodes: [
        node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' }),
        node({ id: 'n-beta', name: 'Beta', nodeTypeId: 'nt-proc' }),
      ],
      existingLinks: [
        link({ id: 'l-1', sourceId: 'n-alpha', targetId: 'n-beta', linkTypeId: 'lt-serving' }),
      ],
      existingDiagrams: [diagram],
      settings,
    })
    expect(result.links.r1?.action).toBe('create')
  })

  it('updateFromOef marks action update', () => {
    const settings = {
      ...createDefaultOefReuseSettings(),
      nodesMode: 'reuseMatching' as const,
      onNodeMatch: 'updateFromOef' as const,
    }
    const result = resolveOefEntityMatches({
      draft,
      mapping,
      notationId: 'n1',
      existingNodes: [node({ id: 'n-alpha', name: 'Alpha', nodeTypeId: 'nt-svc' })],
      existingLinks: [],
      existingDiagrams: [],
      settings,
    })
    expect(result.nodes.e1).toEqual({ action: 'update', id: 'n-alpha' })
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
npx vitest run src/features/models/utils/oef/oefEntityReuse.test.ts
```

- [ ] **Step 3: Implement `oefEntityReuse.ts`**

Export types:

```ts
export type OefResolvedAction = 'create' | 'reuse' | 'update'

export type OefNodeResolution = { action: OefResolvedAction; id?: string }
export type OefLinkResolution = { action: OefResolvedAction; id?: string }

export type OefReuseWarning = {
  code: 'nodeMatchAmbiguous' | 'linkMatchAmbiguous'
  sourceId: string
  message: string
  candidateIds: string[]
}

export type OefReuseSummary = {
  nodes: { create: number; reuse: number; update: number; ambiguous: number }
  links: { create: number; reuse: number; update: number; ambiguous: number }
}

export function resolveOefEntityMatches(params: {
  draft: ImportDraft
  mapping: ImportMappingState
  notationId: string
      existingNodes: EditorNode[]
      existingLinks: EditorLink[]
      existingDiagrams: EditorDiagram[]
      settings: OefReuseSettings
    }): {
  nodes: Record<string, OefNodeResolution>
  links: Record<string, OefLinkResolution>
  warnings: OefReuseWarning[]
  summary: OefReuseSummary
}
```

Logic per spec:
- Import `truncateOefEntityName` from `oefToBatchSave` **or** extract truncate to a tiny shared helper if circular import appears — prefer extract `oefEntityName.ts` with `truncateOefEntityName` + `OEF_ENTITY_NAME_MAX_LENGTH` if needed (only if import cycle; otherwise import from oefToBatchSave if already exported).
- Skip deleted editor entities (`_isDeleted`).
- For `endpointsTypeAndLabel`, build `Map<linkId, effectiveLabel>` from `existingDiagrams` edges (`attrs.label`); skip `_attrsPending` diagrams without loaded attrs; conflicting non-empty labels ⇒ link fails label criterion.
- Build summary from resolutions + ambiguous warning counts.

- [ ] **Step 4: Run — PASS**

```bash
npx vitest run src/features/models/utils/oef/oefEntityReuse.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/models/utils/oef/oefEntityReuse.ts src/features/models/utils/oef/oefEntityReuse.test.ts
# plus oefEntityName extract if done
git commit -m "$(cat <<'EOF'
feat(oef): resolve draft entities against existing model nodes/links

EOF
)"
```

---

### Task 3: Wire resolutions into `buildOefBatchSaveRequest`

**Files:**
- Modify: `src/features/models/utils/oef/oefToBatchSave.ts`
- Modify: `src/features/models/utils/oef/oefToBatchSave.test.ts`

- [ ] **Step 1: Extend params**

```ts
import type { EditorDiagram, EditorLink, EditorNode } from '../../types'
import type { OefReuseSettings } from './reuseSettings'
import { createDefaultOefReuseSettings } from './reuseSettings'
import { resolveOefEntityMatches } from './oefEntityReuse'

// BuildOefBatchSaveParams additions:
existingNodes?: EditorNode[]
existingLinks?: EditorLink[]
existingDiagrams?: EditorDiagram[]
reuseSettings?: OefReuseSettings
```

Default: empty existing + `createDefaultOefReuseSettings()` → current create-only behavior (all existing tests stay green).

- [ ] **Step 2: Node loop**

After mapping check:
1. Call `resolveOefEntityMatches` once at start (or accept precomputed resolutions — prefer call inside build once).
2. For each draft node:
   - `create` → current create path; register `sourceElementId → tempId` in remap map used by links/diagrams.
   - `reuse` → no create; register `sourceElementId → realId`.
   - `update` → push `nodes.update` with id, same parentNodeId/nodeTypeId from existing, merged attrs/name rules from spec; register remap to realId.
3. Extend `createdCounts` → also `reused` / `updated` (or separate `reuseCounts` on result). Prefer:

```ts
createdCounts: { nodes, links, diagrams, ... }
reuseCounts: {
  nodesReused: number
  nodesUpdated: number
  linksReused: number
  linksUpdated: number
}
```

4. Merge resolver warnings into `warnings` with codes `nodeMatchAmbiguous` / `linkMatchAmbiguous` / `nodeUpdateNameSkipped`.

- [ ] **Step 3: Link loop**

- `create` → current (sourceId/targetId from remap — may be real UUID or temp).
- `reuse` → skip create; register relationship → real link id for diagrams.
- `update` → `links.update` with existing endpoints + merged relation properties.

- [ ] **Step 4: Diagrams**

Unchanged create; `modelNodeId` / `modelLinkId` already come from remap maps (real or temp).

- [ ] **Step 5: Tests**

Add cases:
1. Existing Alpha node + reuseMatching + reuseId → `nodes.create` without Alpha; link create may use real id.
2. `updateFromOef` → `nodes.update.length === 1`, properties merged, parent unchanged.
3. Link reuse when both endpoints reused.
4. Default settings → still create-only on fixture Main.xml (existing test).

- [ ] **Step 6: Run**

```bash
npx vitest run src/features/models/utils/oef/oefToBatchSave.test.ts
```

- [ ] **Step 7: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(oef): apply reuse/update resolutions in batch-save builder

EOF
)"
```

---

### Task 4: Chunk planner — support updates

**Files:**
- Modify: `src/features/models/utils/oef/chunkOefBatchSave.ts`
- Modify: `src/features/models/utils/oef/chunkOefBatchSave.test.ts`

- [ ] **Step 1: Extend `planOefBatchSaveChunks`**

Order:
1. node create chunks (as now)
2. node update chunks (size `OEF_NODE_CHUNK_SIZE`)
3. link create chunks
4. link update chunks
5. diagram create chunks

For update chunks, `kind` can stay `'nodes' | 'links' | 'diagrams'` (progress label same) — distinguish only by non-empty `update` arrays. Optionally extend progress with `nodesUpdated` / `linksUpdated` later; v1: progress may under-count updates (acceptable) **or** add fields to `OefChunkProgress` and `useOefImport.formatOefProgress`. Prefer add:

```ts
nodesUpdated: number
linksUpdated: number
```

to progress + apply result.

- [ ] **Step 2: `applyOefBatchSaveChunks`**

When applying node/link chunks, remap **create** as now; updates need no temp remap (ids are real). Accumulate update counts from request sizes on success.

- [ ] **Step 3: Test**

- Request with 2 node updates → planned chunk has `nodes.update`.
- Mixed: create temp node + link create referencing real reused id — after apply, link source/target remap works (`??` identity).

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/features/models/utils/oef/chunkOefBatchSave.test.ts
git commit -am "$(cat <<'EOF'
feat(oef): chunk batch-save updates for reused entity refresh

EOF
)"
```

---

### Task 5: Wizard UI + i18n

**Files:**
- Modify: `src/features/models/components/ModelImportWizard.vue`
- Modify: `src/i18n/locales/models.ts`

- [ ] **Step 1: State**

```ts
const reuseSettings = ref<OefReuseSettings>(createDefaultOefReuseSettings())
```

On notation change (alongside mapping rebuild):  
`reuseSettings.value = mergeOefReuseSettings(createDefaultOefReuseSettings(), loadCachedOefReuseSettings(notationId))`  
On submit / when leaving preview: `saveCachedOefReuseSettings(notationId, reuseSettings.value)`.

Props: add optional `existingNodes` / `existingLinks` **or** compute preview summary inside wizard if props provided. Prefer props from ModelEditor:

```ts
existingNodes: EditorNode[]
existingLinks: EditorLink[]
```

Computed preview summary via `resolveOefEntityMatches` when step===3.

- [ ] **Step 2: Emit**

```ts
submit: [{
  draft, notationId, mapping, ruleDecisions,
  reuseSettings: OefReuseSettings,
}]
```

- [ ] **Step 3: Template (step 3)** — section after stats:

- select/radio: nodesMode, linksMode
- select: linkMatchCriterion (disabled if linksMode===alwaysCreate)
- select: onNodeMatch / onLinkMatch (disabled when corresponding mode alwaysCreate)
- summary line using `models.oefImportReuseSummaryNodes` / `…Links` with create/reuse/update/ambiguous

- [ ] **Step 4: i18n keys (ru + en)**

`oefImportReuseTitle`, `oefImportReuseNodesMode`, `oefImportReuseLinksMode`, `oefImportReuseAlwaysCreate`, `oefImportReuseMatching`, `oefImportReuseLinkCriterion`, `oefImportReuseCriterionEndpointsType`, `oefImportReuseCriterionEndpointsTypeLabel`, `oefImportReuseOnNodeMatch`, `oefImportReuseOnLinkMatch`, `oefImportReuseOnlyId`, `oefImportReuseUpdate`, `oefImportReuseSummaryNodes`, `oefImportReuseSummaryLinks`, warning labels for ambiguous / name skipped.

- [ ] **Step 5: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(oef): preview settings for reusing existing nodes and links

EOF
)"
```

---

### Task 6: `useOefImport` + ModelEditor wiring

**Files:**
- Modify: `src/features/models/composables/useOefImport.ts`
- Modify: `src/features/models/ModelEditor.vue` (wizard props)
- Modify: report UI if shown in header/modal

- [ ] **Step 1: `handleOefImportSubmit` payload** includes `reuseSettings`.

Pass into `buildOefBatchSaveRequest`:

```ts
existingNodes: options.state.value.nodes.filter(n => !n._isDeleted),
existingLinks: options.state.value.links.filter(l => !l._isDeleted),
existingDiagrams: options.state.value.diagrams.filter(d => !d._isDeleted),
reuseSettings: payload.reuseSettings,
```

- [ ] **Step 2: Report**

Extend `OefImportReport` with reuse/update counts; `oefWarningLabel` for new codes.

- [ ] **Step 3: Wizard props**

```vue
:existing-nodes="state.nodes"
:existing-links="state.links"
:existing-diagrams="state.diagrams"
```

Also pass `existingDiagrams` into every `resolveOefEntityMatches` call in wizard preview.


- [ ] **Step 4: Manual smoke checklist** (document in commit body / PR later)

1. Import OEF twice with defaults → duplicates.
2. Second import: nodes+links reuseMatching, reuseId → no new duplicate nodes/links; new diagrams appear.
3. updateFromOef changes a custom property on existing node.

- [ ] **Step 5: Run focused tests + commit**

```bash
npx vitest run src/features/models/utils/oef/
git commit -am "$(cat <<'EOF'
feat(oef): wire reuse settings through import submit path

EOF
)"
```

---

### Task 7: In-app docs

**Files:**
- Modify: `src/features/docs/content/models.md`
- Modify: `src/features/docs/content/models.en.md`

- [ ] **Step 1:** In OEF import section, document preview reuse controls, match rules (name+type; links endpoints+type / +name caveat), defaults always-create, diagrams always create, ambiguous → first id.

- [ ] **Step 2: Commit**

```bash
git commit -am "$(cat <<'EOF'
docs: describe OEF import reuse of existing model entities

EOF
)"
```

---

## Verification (end)

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models/utils/oef/
npm run lint
# optional: npm run build
```

Expected: all oef unit tests green; no new lint errors on touched files.

---

## Execution note

After this plan is accepted, implement via **subagent-driven-development** or **executing-plans**, task-by-task with TDD and commits as listed. Do not expand scope to diagram/folder reuse.

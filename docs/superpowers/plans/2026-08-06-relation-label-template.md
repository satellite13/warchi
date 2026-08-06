# Relation Label Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let notation relations define `labelTemplate` like components, resolve `${name}` / `#{linkType}` / `${relation}` on notation preview and model diagrams, and store link-type values in `ModelLinkAttrs.typeProperties`.

**Architecture:** Reuse `resolveLabelTemplate`. Extend `buildEdgeLabel` and add `resolveDiagramEdgeLabelTemplate`. Persist `typeProperties` on model links. UI: unlock CustomPropertiesPanel for relations; add Template in edge Style; add link-type properties section in ModelPropertiesPanel. Model canvas resolves template when set (ignores `attrs.label` for display).

**Tech Stack:** Vue 3, TypeScript, Vitest, existing `diagramStyle` / model attrs JSON

**Spec:** `docs/superpowers/specs/2026-08-06-relation-label-template-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| Modify `src/features/models/modelAttrs.ts` | `typeProperties` on `ModelLinkAttrs` + parse default |
| Create `src/features/models/utils/edgeLabelTemplate.ts` | Thin resolver wrapper (mirror `nodeLabelTemplate.ts`) |
| Create `src/features/models/utils/edgeLabelTemplate.test.ts` | Unit tests for edge placeholders |
| Modify `src/features/notations/utils/notationElementBuilders.ts` | `buildEdgeLabel` resolves template |
| Modify `src/features/notations/utils/notationElementBuilders.test.ts` | Edge template cases |
| Modify `src/features/notations/composables/useNotationDiagram.ts` | Pass relation + link-type schemas into `buildEdgeLabel` |
| Modify `src/features/notations/components/CustomPropertiesPanel.vue` | Show composite label for relations |
| Modify `src/features/diagram-style/composables/useEdgeStyleState.ts` | `labelTemplate` in load/build |
| Modify `src/features/diagram-style/components/NodeStylePanel.vue` | Template field in edge Label section |
| Modify `src/features/models/utils/diagramCanvasBuilders.ts` | Optional: helper to build label from template context |
| Modify `src/features/models/components/ModelDiagramCanvas.vue` | Resolve edge template when present |
| Modify `src/features/models/components/ModelPropertiesPanel.vue` | Link type properties UI |
| Modify `src/features/models/ModelEditor.vue` | Wire link type props + `setLinkTypePropertyValue` |
| Modify `src/features/models/composables/ModelEditor.vue` bind/load | Defaults for `typeProperties` on bind (optional apply) |
| Modify `src/i18n/locales/diagram.ts` | Syntax hint covers nodes **and** relations |
| Modify `src/features/docs/content/notations.md` + `.en.md` | Document edge templates |
| Modify `src/features/docs/content/models.md` + `.en.md` | Brief link type properties note |

---

### Task 0: Feature branch

**Files:** none (git only)

- [ ] **Step 1: Create branch**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git checkout master
git pull --ff-only || true
git checkout -b feat/relation-label-template
```

- [ ] **Step 2: Confirm clean start**

```bash
git status -sb
```

Expected: on `feat/relation-label-template`, no unrelated staged files (leave unrelated dirty files unstaged).

---

### Task 1: `ModelLinkAttrs.typeProperties` + parse

**Files:**
- Modify: `src/features/models/modelAttrs.ts`
- Test: extend existing parse tests if any, or add cases in a colocated test / `modelAttrs` consumer test

- [ ] **Step 1: Write failing expectation**

If there is no dedicated `modelAttrs` test file, add assertions in a small new test or extend an existing one that calls `parseLinkAttrs`. Prefer creating `src/features/models/modelAttrs.test.ts` if missing:

```ts
import { describe, expect, it } from 'vitest'
import { parseLinkAttrs } from './modelAttrs'

describe('parseLinkAttrs', () => {
  it('defaults typeProperties to empty object', () => {
    expect(parseLinkAttrs(null).typeProperties).toEqual({})
  })

  it('round-trips typeProperties', () => {
    const attrs = parseLinkAttrs(JSON.stringify({ typeProperties: { code: 'L1' } }))
    expect(attrs.typeProperties).toEqual({ code: 'L1' })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/nikolaygroznyh/Work/warchi && npx vitest run src/features/models/modelAttrs.test.ts
```

Expected: FAIL — `typeProperties` undefined.

- [ ] **Step 3: Implement**

In `modelAttrs.ts`:

```ts
export type ModelLinkAttrs = {
  notationRelations: Record<string, LinkRelationBinding>
  relationProperties: Record<string, Record<string, Record<string, unknown>>>
  /** Link-type custom property values (model-wide, not diagram-scoped) */
  typeProperties: Record<string, unknown>
}
```

In `parseLinkAttrs`:

```ts
export const parseLinkAttrs = (raw: string | null | undefined): ModelLinkAttrs => {
  const data = parseJson(raw)
  return {
    notationRelations: toLinkBindings(data.notationRelations),
    relationProperties: toScopedMap(data.relationProperties),
    typeProperties: toClonedRecord(data.typeProperties),
  }
}
```

(`toClonedRecord` already used for node `typeProperties`.)

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run src/features/models/modelAttrs.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/models/modelAttrs.ts src/features/models/modelAttrs.test.ts
git commit -m "$(cat <<'EOF'
feat: add typeProperties to model link attrs

EOF
)"
```

---

### Task 2: Edge label template resolver + `buildEdgeLabel`

**Files:**
- Create: `src/features/models/utils/edgeLabelTemplate.ts`
- Create: `src/features/models/utils/edgeLabelTemplate.test.ts`
- Modify: `src/features/notations/utils/notationElementBuilders.ts`
- Modify: `src/features/notations/utils/notationElementBuilders.test.ts`

- [ ] **Step 1: Failing tests for resolver**

Create `edgeLabelTemplate.ts` stub export and test:

```ts
// edgeLabelTemplate.test.ts
import { describe, expect, it } from 'vitest'
import { resolveDiagramEdgeLabelTemplate } from './edgeLabelTemplate'
import type { CustomProperty } from '@/domain/attrs/notationAttrs'

const prop = (partial: Partial<CustomProperty> & { name: string }): CustomProperty =>
  ({
    id: partial.id ?? partial.name,
    name: partial.name,
    type: partial.type ?? 'string',
    required: false,
    defaultValue: partial.defaultValue,
    ...partial,
  }) as CustomProperty

describe('resolveDiagramEdgeLabelTemplate', () => {
  it('uses relation name for ${name}', () => {
    expect(
      resolveDiagramEdgeLabelTemplate('${name}', 'Serving', {
        typeProperties: [],
        typeValues: {},
        relationProperties: [],
        relationValues: {},
      }),
    ).toBe('Serving')
  })

  it('resolves #{ } from link type values and ${ } from relation values', () => {
    expect(
      resolveDiagramEdgeLabelTemplate('#{code} · ${protocol}', 'Serving', {
        typeProperties: [prop({ name: 'code' })],
        typeValues: { code: 'T1' },
        relationProperties: [prop({ name: 'protocol' })],
        relationValues: { protocol: 'https' },
      }),
    ).toBe('T1 · https')
  })
})
```

- [ ] **Step 2: Implement resolver**

```ts
// edgeLabelTemplate.ts
import type { CustomProperty } from '@/domain/attrs/notationAttrs'
import { resolveLabelTemplate } from '@/domain/attrs/labelTemplate'

export type DiagramEdgeLabelTemplateContext = {
  typeProperties: CustomProperty[]
  typeValues: Record<string, unknown>
  relationProperties: CustomProperty[]
  relationValues: Record<string, unknown>
}

/**
 * Edge label template on a model diagram:
 * - `#{prop}` — link-type custom property (`link.parsedAttrs.typeProperties`)
 * - `${prop}` — relation custom property (diagram-scoped)
 * - `${name}` — notation relation name
 */
export function resolveDiagramEdgeLabelTemplate(
  template: string,
  relationName: string,
  ctx: DiagramEdgeLabelTemplateContext,
): string {
  return resolveLabelTemplate(
    template,
    relationName,
    ctx.relationProperties,
    ctx.typeProperties,
    {
      typeValues: ctx.typeValues,
      componentValues: ctx.relationValues,
    },
  )
}
```

- [ ] **Step 3: Extend `buildEdgeLabel` (notation builders)**

Replace `buildEdgeLabel` to mirror `buildNodeLabel` template path:

```ts
export function buildEdgeLabel(
  name: string,
  ds?: DiagramStyle,
  relationProperties?: CustomProperty[],
  linkTypeProperties?: CustomProperty[],
): string | TextLabelOptions | undefined {
  if (ds?.showLabel === false) {
    return undefined
  }

  const hasTemplate = !!ds?.labelTemplate
  const displayText = hasTemplate
    ? resolveLabelTemplate(
        ds!.labelTemplate!,
        name,
        relationProperties ?? [],
        linkTypeProperties ?? [],
      )
    : name

  const labelInset = ds?.labelInset
  const hasStyle = !!(
    ds?.labelColor ||
    ds?.labelOpacity != null ||
    ds?.labelFontSize ||
    labelInset != null
  )

  if (!hasStyle && !hasTemplate) {
    return displayText
  }
  const opts: TextLabelOptions = { text: displayText }
  if (hasTemplate) {
    opts.editableText = name
  }
  const style: TextStyle = {}
  if (ds?.labelColor) style.color = ds.labelColor
  if (ds?.labelOpacity != null) style.opacity = ds.labelOpacity
  if (ds?.labelFontSize) style.fontSize = ds.labelFontSize
  if (Object.keys(style).length) opts.style = style
  if (labelInset != null) opts.inset = labelInset
  return opts
}
```

Add tests in `notationElementBuilders.test.ts` for template resolution and `showLabel: false`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/features/models/utils/edgeLabelTemplate.test.ts src/features/notations/utils/notationElementBuilders.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/models/utils/edgeLabelTemplate.ts \
  src/features/models/utils/edgeLabelTemplate.test.ts \
  src/features/notations/utils/notationElementBuilders.ts \
  src/features/notations/utils/notationElementBuilders.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve label templates for edge builders

EOF
)"
```

---

### Task 3: Notation preview wiring (`useNotationDiagram`)

**Files:**
- Modify: `src/features/notations/composables/useNotationDiagram.ts`

- [ ] **Step 1: Pass schemas into `buildEdgeLabel`**

At both call sites (~415 and ~564), resolve:

- `relation.parsedAttrs.customProperties` (or `parseEntityAttrs(relation.attrs).customProperties`)
- link type custom properties from the loaded link type for `relation.linkTypeId` (same pattern as `typeCustomPropertiesForComponent` for nodes)

```ts
const relationProps = parseEntityAttrs(relation.attrs ?? null).customProperties
const linkType = /* lookup by relation.linkTypeId from state */
const linkTypeProps = parseEntityAttrs(linkType?.attrs ?? null).customProperties.filter(p => !p.system)
const labelConfig = buildEdgeLabel(relation.name, ds, relationProps, linkTypeProps)
```

When updating an existing edge that currently forces `existingEdge.label.text = relation.name`, switch to assigning the resolved `buildEdgeLabel` result (same as create path), so templates refresh on style/name changes.

- [ ] **Step 2: Manual / unit smoke**

If there is no dedicated composable test, rely on builder tests + quick notation editor check later. Optionally add a focused test if the composable already has a test harness.

- [ ] **Step 3: Commit**

```bash
git add src/features/notations/composables/useNotationDiagram.ts
git commit -m "$(cat <<'EOF'
feat: apply relation label templates on notation canvas

EOF
)"
```

---

### Task 4: Notation UI — Properties + Style Template

**Files:**
- Modify: `src/features/notations/components/CustomPropertiesPanel.vue`
- Modify: `src/features/diagram-style/composables/useEdgeStyleState.ts`
- Modify: `src/features/diagram-style/components/NodeStylePanel.vue`
- Modify: `src/i18n/locales/diagram.ts`

- [ ] **Step 1: Show composite label for relations**

In `CustomPropertiesPanel.vue`, change the section guard from:

```vue
v-if="selectedItem && !('linkTypeId' in selectedItem)"
```

to:

```vue
v-if="selectedItem"
```

Ensure `labelTemplatePreview` already uses `props.typeProperties` (link type props are already passed from `NotationEditorPage.selectedItemTypeProperties` for relations).

Update syntax copy in preview hint via i18n (Step 3) so it mentions both nodes and relations.

- [ ] **Step 2: Edge style `labelTemplate`**

In `useEdgeStyleState.ts`:

- Add `const edgeLabelTemplate = ref('')`
- In `loadEdgeProps`: `edgeLabelTemplate.value = styleFromDiagram?.labelTemplate ?? ''`
- In `buildEdgeStyle`: `...(edgeLabelTemplate.value ? { labelTemplate: edgeLabelTemplate.value } : {})`
- Export `edgeLabelTemplate`

In `NodeStylePanel.vue` edge Label section (after the label text input ~1757), add (mirror node Template block):

```vue
<div class="sp-field">
  <span class="sp-field__label">{{ t("nodeStyle.template") }}</span>
  <input
    class="sp-input sp-input--full"
    :value="edgeLabelTemplate"
    :placeholder="t('diagram.compositeLabelPlaceholder')"
    @input="handleEdgeLabelTemplateChange(($event.target as HTMLInputElement).value)"
  >
  <p class="sp-field__hint sp-field__hint--small">{{ t('diagram.compositeLabelSyntax') }}</p>
</div>
```

Wire `handleEdgeLabelTemplateChange` to set ref + `emitEdgeStyle()` (include `labelTemplate` in `currentEdgeStyleSnapshot` / emit payload — same places that already emit `labelColor`).

Destructure `edgeLabelTemplate` from `useEdgeStyleState` alongside other edge refs.

- [ ] **Step 3: i18n**

Update `diagram.compositeLabelSyntax` (ru + en) to cover both cases, e.g. ru:

> `${name}` — имя ноды или relation; `#{ключ}` — свойство типа ноды/типа связи; `${ключ}` — свойство компонента/relation.

Keep placeholder example working for both.

- [ ] **Step 4: Commit**

```bash
git add src/features/notations/components/CustomPropertiesPanel.vue \
  src/features/diagram-style/composables/useEdgeStyleState.ts \
  src/features/diagram-style/components/NodeStylePanel.vue \
  src/i18n/locales/diagram.ts
git commit -m "$(cat <<'EOF'
feat: expose edge label template in notation UI

EOF
)"
```

---

### Task 5: Model properties — link type values UI

**Files:**
- Modify: `src/features/models/components/ModelPropertiesPanel.vue`
- Modify: `src/features/models/ModelEditor.vue`
- Modify: `src/i18n/locales/models.ts` (add `linkTypeProperties` if missing)

- [ ] **Step 1: Props / emits**

Add to `ModelPropertiesPanel`:

```ts
linkTypeCustomProperties?: CustomProperty[]
linkTypeScopedValues?: Record<string, unknown>
// emit:
setLinkTypePropertyValue: [key: string, value: unknown]
```

Add a section **above** the relation picker (mirror node-type before notation picker): title `t('models.linkTypeProperties')`, fields bound to `linkTypeScopedValues`, emit `setLinkTypePropertyValue`. Show diagram token hint `#{name}` like nodes.

- [ ] **Step 2: Wire ModelEditor**

```ts
const linkTypeCustomProperties = computed(() => {
  const link = selectedLink.value
  if (!link) return []
  const lt = state.value.linkTypes.find(t => t.id === link.linkTypeId)
  return parseEntityAttrs(lt?.attrs ?? null).customProperties.filter(p => !p.system)
})

const linkTypeScopedValues = computed(() => selectedLink.value?.parsedAttrs.typeProperties ?? {})

function setLinkTypePropertyValue(key: string, value: unknown): void {
  const link = selectedLink.value
  if (!link || readOnly) return
  if (!Object.is(link.parsedAttrs.typeProperties[key], value)) {
    link.parsedAttrs.typeProperties[key] = value
    link._isDirty = true
    // trigger reactivity / schedule canvas refresh the same way setNodeTypePropertyValue does
  }
}
```

Pass props/emits into `<ModelPropertiesPanel>`.

On `bindLinkRelation`, after creating relationProperties bucket, ensure `typeProperties` exists and optionally fill missing defaults from link type schema via `applyDefaultCustomPropertyValuesFromAttrs(link.parsedAttrs.typeProperties, linkType.attrs, { skipSystem: true })`.

- [ ] **Step 3: i18n**

```ts
// models.ts ru
linkTypeProperties: 'Свойства типа связи',
// en
linkTypeProperties: 'Link type properties',
```

- [ ] **Step 4: Commit**

```bash
git add src/features/models/components/ModelPropertiesPanel.vue \
  src/features/models/ModelEditor.vue \
  src/i18n/locales/models.ts
git commit -m "$(cat <<'EOF'
feat: edit link type properties for edge label templates

EOF
)"
```

---

### Task 6: Model diagram canvas — resolve templates

**Files:**
- Modify: `src/features/models/components/ModelDiagramCanvas.vue`
- Modify: `src/features/models/utils/diagramCanvasBuilders.ts` (if extracting helper)
- Test: extend `diagramCanvasBuilders.test.ts` and/or canvas-focused unit if practical

- [ ] **Step 1: Build display label helper**

In `ModelDiagramCanvas.vue` (or a small util used by it):

```ts
function buildEdgeDisplayLabel(
  edgeInst: DiagramEdgeInstance,
  link: EditorLink,
  relation: { name: string; attrs?: string | null } | undefined,
  ds: DiagramStyle | undefined,
): string | TextLabelOptions | undefined {
  const relationProps = parseEntityAttrs(relation?.attrs ?? null).customProperties
  const linkType = linkTypesById.get(link.linkTypeId)
  const typeProps = parseEntityAttrs(linkType?.attrs ?? null).customProperties.filter(p => !p.system)
  const relationValues = getDiagramScopedLinkValues(/* existing args for this edge/link */)
  const typeValues = link.parsedAttrs.typeProperties

  if (ds?.labelTemplate) {
    const text = resolveDiagramEdgeLabelTemplate(ds.labelTemplate, relation?.name ?? '', {
      typeProperties: typeProps,
      typeValues,
      relationProperties: relationProps,
      relationValues,
    })
    return buildModelEdgeLabelConfig(text, ds) // may need to allow empty string / still apply style
  }

  const edgeLabel = getInstanceEdgeLabel(edgeInst) ?? relation?.name
  return buildModelEdgeLabelConfig(edgeLabel, ds)
}
```

**Important:** When template is set, do **not** use `attrs.label` for display (spec v1). When unset, keep `getInstanceEdgeLabel` / relation name behavior.

Adjust `buildModelEdgeLabelConfig` if it currently returns `undefined` for empty trimmed text — templates may intentionally resolve to `''`; prefer still creating a label object when template is set (or omit label when empty — match node behavior for empty template result).

- [ ] **Step 2: Use helper in syncDiagram edge loop (~1364)**

Replace the current `getInstanceEdgeLabel` → `buildModelEdgeLabelConfig` chain with `buildEdgeDisplayLabel`.

When applying `TextLabel` / `editableText`: if template set, set `editableText` to relation name (for consistency with notation `buildEdgeLabel`); in-canvas edits that write `attrs.label` remain for **non-template** edges. If detecting label changes from canvas while template is active, either skip persisting display text back to `attrs.label` or keep writing `attrs.label` but understand it does not affect `${name}` — **prefer skip updating `attrs.label` from canvas when template is set** (avoids confusion). Implement by guarding `detectEdgeLabelChanges` when bound relation has `labelTemplate`.

- [ ] **Step 3: Tests**

Add unit coverage for the pure resolution path (already in Task 2). Add a builder-level test if a pure function is extracted. For canvas, at minimum document manual check.

- [ ] **Step 4: Commit**

```bash
git add src/features/models/components/ModelDiagramCanvas.vue \
  src/features/models/utils/diagramCanvasBuilders.ts \
  src/features/models/utils/diagramCanvasBuilders.test.ts
git commit -m "$(cat <<'EOF'
feat: render relation label templates on model diagrams

EOF
)"
```

---

### Task 7: Docs + verification

**Files:**
- Modify: `src/features/docs/content/notations.md`
- Modify: `src/features/docs/content/notations.en.md`
- Modify: `src/features/docs/content/models.md` (brief)
- Modify: `src/features/docs/content/models.en.md` (brief)

- [ ] **Step 1: Docs**

Remove “templates only for nodes”. Document edge placeholders:

- `${name}` — relation name  
- `#{key}` — link type property  
- `${key}` — relation property  

Note model panel **Link type properties**.

- [ ] **Step 2: Full test run (touched areas)**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npx vitest run src/features/models/modelAttrs.test.ts \
  src/features/models/utils/edgeLabelTemplate.test.ts \
  src/features/notations/utils/notationElementBuilders.test.ts \
  src/features/models/utils/diagramCanvasBuilders.test.ts
npm run lint
```

- [ ] **Step 3: Manual smoke**

1. Notation: select relation → set template `${name} · #{code}` + relation prop  
2. Style panel edge → Template field persists  
3. Model: set link type `code`, bind relation → diagram shows resolved text  
4. Without template → previous label behavior  

- [ ] **Step 4: Commit docs**

```bash
git add src/features/docs/content/notations.md \
  src/features/docs/content/notations.en.md \
  src/features/docs/content/models.md \
  src/features/docs/content/models.en.md
git commit -m "$(cat <<'EOF'
docs: document label templates for relations

EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Template on notation relation | 4 |
| Resolve on notation + model | 2, 3, 6 |
| `${name}` / `#{ }` / `${ }` | 2, 5, 6 |
| `ModelLinkAttrs.typeProperties` | 1, 5 |
| UI like components | 4 |
| Model link type properties panel | 5 |
| No papirus / no DB migration | — |
| Docs | 7 |
| Tests | 1–2, 6–7 |

## Placeholder / consistency notes

- `resolveLabelTemplate` maps “component” slot → relation properties for edges (same function, different schema args).
- Defer edge `showLabel` unless already trivial via `buildEdgeLabel`’s `showLabel === false` branch (included in Task 2); Style toggle for edges is optional and not required if Style already lacks it.

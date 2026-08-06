# Design: Label templates for notation relations (edges)

**Date:** 2026-08-06  
**Status:** Approved for planning  
**Scope:** warchi (notation + model editors, docs); papirus unchanged; no DB migration (attrs JSON)

## Problem

Components support a composite **label template** (`diagramStyle.labelTemplate`) with `${name}`, `#{typeProp}`, `${componentProp}`. Relations store the same `diagramStyle` field, but:

- Properties panel hides the template UI for relations (`linkTypeId` guard)
- Style panel Template field exists only in the **node** Label section
- `buildEdgeLabel` always shows the raw relation name (no template resolution)
- Model canvas edge labels ignore `labelTemplate`
- Docs state templates are nodes-only

Users want the same template capability for links.

## Goals

1. Configure `labelTemplate` on a **notation relation** (same places as for components).
2. Resolve templates on notation preview and model diagrams with the same syntax engine.
3. Support full placeholder parity:
   - `${name}` → relation name (notation)
   - `#{key}` → **link type** custom property values
   - `${key}` → **relation** custom property values (diagram-scoped, existing)
4. Persist link-type values on the model link (`typeProperties`), analogous to nodes.

## Non-goals

- Per-instance template override on a diagram edge (template lives only on the relation in the notation).
- Changing papirus edge APIs.
- Migrating historical `${key}` usages for link types (there was no prior edge template).
- Renaming model `Link.name` field semantics beyond current usage.

## Decisions

| Topic | Choice |
|-------|--------|
| Where template lives | Notation relation `diagramStyle.labelTemplate` |
| `${name}` | Relation name from notation |
| `#{…}` / `${…}` | Link type props / relation props (mirror node type / component) |
| Model storage for `#{…}` | `ModelLinkAttrs.typeProperties: Record<string, unknown>` (new) |
| Relation props | Existing `relationProperties` (+ diagram edge snapshot as today) |
| UI | Same as components: Properties «Составная подпись» + Style Template on edge Label |
| Engine | Reuse `resolveLabelTemplate` / thin edge wrapper like `resolveDiagramNodeLabelTemplate` |

## Data model

### Notation (unchanged shape)

```ts
// DiagramStyle (already)
labelTemplate?: string
showLabel?: boolean  // if edge label already respects it elsewhere, keep consistent; otherwise wire like nodes
```

Stored on relation `attrs` via existing `diagramStyle` serialization.

### Model link attrs

```ts
export type ModelLinkAttrs = {
  notationRelations: Record<string, LinkRelationBinding>
  relationProperties: Record<string, Record<string, Record<string, unknown>>>
  /** Link-type custom property values (model-wide, not diagram-scoped) */
  typeProperties: Record<string, unknown>
}
```

- `parseLinkAttrs` / `serializeLinkAttrs`: default `typeProperties` to `{}` when missing (backward compatible).
- Defaults from link-type schema applied on bind / load (same patterns as node `typeProperties` + `syncDefaultsOnLoad`).

## Resolution

### Shared engine

Keep `resolveLabelTemplate(template, name, relationPropertiesSchema, linkTypePropertiesSchema, values?)`.

Mapping for edges:

| Placeholder | Schema source | Runtime values |
|-------------|---------------|----------------|
| `${name}` | — | relation `.name` |
| `#{key}` | link type `customProperties` | `link.parsedAttrs.typeProperties` |
| `${key}` | relation `customProperties` | scoped relation values (edge instance / link fallback, existing helpers) |

### Notation preview

Extend `buildEdgeLabel(name, ds, relationProps?, linkTypeProps?)` (or dedicated helper) to resolve `ds.labelTemplate` like `buildNodeLabel`. Preview uses schema defaults when values omitted.

### Model diagram

When building/updating a papirus edge:

1. Resolve bound relation → `ds.labelTemplate`, relation property schema.
2. Resolve link type → type property schema + `link.parsedAttrs.typeProperties`.
3. Resolve relation property values via existing diagram-scoped helpers.
4. `displayText = resolve…(template, relation.name, …)` when template set; else keep current label fallback (`attrs.label` / relation name) as today.
5. `editableText` for in-canvas edit: stored diagram edge label string (or empty → relation name), **not** the resolved template — mirror node `editableText = name`.

Double-click / commit behavior: writing the edited text updates diagram edge `attrs.label` as today; template still drives displayed text when present (same pattern as nodes: display = template result, edit buffer = name/label base).

Clarify edit semantics to match nodes:

- **Nodes:** template uses `${name}` from node name; edit renames the node.
- **Edges:** `${name}` is **relation name** (notation), not the diagram `attrs.label`.  
  In-canvas label edit continues to set **`attrs.label`**. When a template is set:
  - If the template includes `${name}`, display uses relation name (edit of `attrs.label` does not change `${name}`).
  - Prefer documenting that `${name}` is the relation title; free-text diagram labels remain available when **no** template is set, or via properties that are not `${name}`.
  - Optional later: expose diagram label as a separate placeholder (out of scope).

**v1 display when template is set:** always resolve from relation name + property values; ignore `attrs.label` for the rendered string (consistent with nodes ignoring a separate “label text” when template drives display). When template is unset, keep current `attrs.label` / relation name behavior.

## UI

### Notation editor — Properties

Remove the `!('linkTypeId' in selectedItem)` guard on the composite-label section. Preview uses relation name + defaults from link type / relation schemas (`typeProperties` prop already passed for components — pass link-type props when a relation is selected).

### Notation editor — Style (edge)

In the edge Label section of `NodeStylePanel` (or edge style block), add Template (+ syntax hint), wired through `useEdgeStyleState.buildEdgeStyle` → `labelTemplate`. Optionally `showLabel` for edges if not already present; if missing, add only if nodes already have the flag and edge rendering can honor it with minimal work — otherwise defer `showLabel` for edges.

### Model editor — Properties

When a link is selected, add a **Link type properties** block (schema from `linkTypes`, values in `link.parsedAttrs.typeProperties`), parallel to node type properties. Keep existing relation properties section for `${…}`.

## Docs / i18n

- Update `notations.md` / `notations.en.md`: remove “nodes only”; document edge placeholders.
- Brief note in models docs if link type properties gain a panel.
- Reuse existing `diagram.compositeLabel*` strings; adjust syntax hint if it currently says “node” only.

## Tests

- `buildEdgeLabel` / edge template resolution: name, `#{ }`, `${ }`, missing keys → `''`.
- `parseLinkAttrs` defaults `typeProperties`.
- Notation CustomPropertiesPanel: template section visible for relations.
- Model canvas / builder: template on relation style produces resolved edge label; no template → previous behavior.
- Style panel / `buildEdgeStyle` round-trips `labelTemplate`.

## Compatibility

- Existing relations without `labelTemplate`: unchanged labels.
- Existing links without `typeProperties`: treat as `{}`; `#{…}` → empty until values set.
- No API / Liquibase changes.

## Feature branch

`feat/relation-label-template` in **warchi** only (papirus not required).

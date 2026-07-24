# Model relation matrix — notation mode by types/rules — Design Spec

Date: 2026-07-25  
Status: approved  
Repos: warchi  
Related:

- `src/features/models-matrix/utils/buildRelationMatrix.ts`
- `src/views/ModelRelationMatrixView.vue`
- `src/i18n/locales/models.ts` (`relationMatrix*`)
- `src/features/docs/content/models.md` (section «Матрица связей»)

## Goal

When a **notation** is selected in the model **«Матрица связей компонентов»**, classify links by **node types** and **link types**, and mark cells that are **allowed by that notation’s relation rules** — without requiring `notationComponents` / `notationRelations` attrs bindings.

## Problem summary

Today, notation mode buckets links into **«Не сопоставлено»** when `notationRelations[selectedNotationId]` (or component binding) is missing. Links created under another notation (e.g. C4 `relationship` with link type `flow`) appear unmapped under Archimate even if Archimate has a `flow` relation of the same link type. That bucket mostly means “no binding for this notation”, not “invalid for this notation”, and is rarely useful for audit.

## Decisions

| Topic | Choice |
|-------|--------|
| Notation-mode axes (rows/columns) | **Node types** (same as «Без нотации (типы)») |
| Notation-mode relation axis | **Link types** present among the selected notation’s **relations** |
| Link placement in a cell | `source.nodeTypeId` × `target.nodeTypeId` × `link.linkTypeId` |
| Attrs bindings | **Ignored** for matrix membership in notation mode |
| «Не сопоставлено» row/column/relation | **Remove** in notation mode |
| «Только сопоставленные» | Replace with **«Только пары с правилом»** (optional filter): keep cells/links only where the pair+linkType is **allowed** by rules (see below) |
| Rules role | **Highlight / flag** allowed cells (not hide by default) |
| Mode «Без нотации (типы)» | Unchanged (axes = node types, relations = link types of model, no rules highlight) |
| Matching relations across notations | **No** name matching (`relationship` ≠ `flow`); only shared underlying **link type id** |
| Multiple components with same node type | Rule matches if **any** component with `from`/`to` node type + any relation with that link type has a rule |
| Multiple relations with same link type | Treated as one matrix relation bucket (the link type) |
| Link types with no relation in notation N | Not listed on the «Связи» axis when N is selected; links of those types still appear only if we also show “other” — **Decision: do not show** those link types on the axis; such links are **excluded** from notation-mode matrix (they are outside N’s vocabulary) |
| Backend | No API changes |
| Out of scope | Changing how links are created/bound; editing rules from this matrix; CSV schema break without versioning note |

## Allowed-cell definition

Given selected notation `N`, cell `(nodeTypeA, nodeTypeB, linkTypeL)` is **allowed** iff there exists:

1. Components `Cfrom`, `Cto` of `N` with `Cfrom.nodeTypeId = A`, `Cto.nodeTypeId = B` (same component allowed for `A → A`);
2. Relation `R` of `N` with `R.linkTypeId = L`;
3. Relation rule for `R` with `fromComponentId = Cfrom.id`, `toComponentId = Cto.id` (active / non-deleted rules only, same as editor).

If (1)–(3) hold → cell gets `allowedByNotationRules: true` (heatmap/marker). Links still count in the cell whether or not allowed.

## Filters / UX copy

- Notation selector: unchanged.
- Rows / columns: node type multi-select (labels = type names).
- Relations: link type multi-select (labels = link type names; options = distinct `linkTypeId` of relations of `N`).
- Replace `relationMatrixMappedOnly` / «Только сопоставленные» with e.g. **«Только допустимые по правилам»** (`allowedOnly`).
- Remove `relationMatrixUnmapped` from notation-mode UI (types mode never had it).
- Optional cell styling: allowed vs not-allowed (e.g. border/tint), keep count heatmap.

## Data / code impact (sketch)

- `buildRelationMatrix`: notation branch builds options from `nodeTypes` + link types of `N.relations`; resolve ids via `nodeTypeId` / `linkTypeId`; drop `UNMAPPED_ENTITY_ID` for notation mode; accept `relationRules` + component/relation catalogs to compute `allowed` per cell (or per item).
- View/i18n/docs: update labels and help text in `models.md` / `models.en.md`.
- Tests: replace binding-based unmapped cases with type/linkType + rules highlight cases (C4 link visible under Archimate when same link type; allowed flag when rules match).

## Non-goals / explicit non-changes

- Notation editor **rules matrix** (component × component editor) — separate feature; unchanged.
- Persisted model attrs schema — unchanged.
- Auto-writing `notationRelations` when viewing the matrix — out of scope.

## Open points (resolved in this doc)

| Question | Resolution |
|----------|------------|
| Group by? | Link type |
| Axes? | Node types |
| Rules? | Highlight allowed cells |
| Unmapped? | Remove in notation mode |
| Links whose link type is not used by any relation of N? | Exclude from notation-mode matrix |

## Success criteria

1. Selecting Archimate shows a C4-created link with the same link type `flow` under the **flow** link-type bucket between the correct **node types**, not under «Не сопоставлено».
2. Cells allowed by Archimate rules are visually distinguishable.
3. Mode «Без нотации» behavior and exports still work.
4. Docs and RU/EN strings match the new meaning.

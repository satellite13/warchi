# Notation relation rules matrix — Design Spec

Date: 2026-07-24  
Status: approved  
Repos: warchi  
Related:

- `src/features/notations/components/RelationRulesSection.vue`
- `src/features/notations/types.ts` (`EditorRelationRule`)
- `src/features/notations/NotationEditorPage.vue`
- `src/features/models-matrix/` (visual/filter patterns only; do not couple data)

## Goal

In the notation editor, provide a **component × component** matrix overlay for editing relation rules: click a cell (`from` → `to`) and pick allowed relations in a dialog. Complements the existing per-component list in the properties panel.

## Problem summary

With many components and relations, creating rules one row at a time in `RelationRulesSection` is slow and hard to overview. The model editor already has a relation matrix, but it is **read-only analytics** of existing links — not an editor for notation rules.

## Decisions

| Topic | Choice |
|-------|--------|
| Placement | Full-screen **overlay** inside notation editor (toolbar button) |
| Existing panel | **Keep** `RelationRulesSection` + copy-from unchanged |
| Axes | Directed: **rows = from**, **columns = to** |
| Components | Active typed components only (exclude deleted and untyped / «diagram only») |
| Self cells | Allowed (`A → A`), same as current list |
| Cell display | **Count** of allowed relations + **tooltip** with relation names |
| Heat | Color fill when `count > 0` (scale by max count like model matrix) |
| Empty cell | Click opens dialog; applying non-empty selection creates a rule |
| Clear cell | Dialog with all relations unchecked → remove/delete editor rule |
| Filters | Like model matrix: multi-select rows / columns / relations + hide empty axes |
| Persistence | Mutate `state.relationRules` via existing editor flags; Save notation as today (`relation-rules/sync`) |
| Backend | No new API |
| Out of scope MVP | Separate route, CSV/PNG export, row/column bulk fill, replacing panel UI |

## UX

1. User opens a notation in the editor.
2. Toolbar action **«Матрица правил»** (i18n `ru`/`en`) opens a full-screen overlay over the editor.
3. Overlay contains:
   - Header: title, close
   - Filter bar: row components, column components, relations, hide empty
   - Scrollable matrix grid
4. Click cell → modal **«Правила: {From} → {To}»**:
   - Checklist / multi-select of all active typed relations in the notation
   - Pre-checked = current `allowedRelationIds` for that pair (or none)
   - Cancel / Apply
5. Apply updates local `relationRules` immediately; overlay stays open; notation becomes dirty until Save.
6. Closing overlay returns to canvas/properties; panel list reflects the same state.

## Data model

Reuse existing editor type (no schema change):

```ts
interface EditorRelationRule {
  id: string
  fromComponentId: string
  toComponentId: string
  allowedRelationIds: string[]
  _isNew?: boolean
  _isDirty?: boolean
  _isDeleted?: boolean
}
```

One editor rule per `(from, to)` pair (already how the UI groups API flat rows).

### Cell apply algorithm

Pure helper (preferred: `src/features/notations/utils/applyRelationRuleCell.ts`):

```ts
applyRelationRuleCell(
  rules: EditorRelationRule[],
  fromComponentId: string,
  toComponentId: string,
  allowedRelationIds: string[],
  createId: () => string,
): void
```

Steps:

1. Find active rule: `from` + `to` and `!_isDeleted`.
2. If `allowedRelationIds` is empty:
   - if rule `_isNew` → splice out
   - else if rule exists → `_isDeleted = true`, `_isDirty = true`
   - else no-op
3. If non-empty:
   - if rule exists → set `allowedRelationIds` (unique), `_isDirty` unless `_isNew`
   - else push `{ id: createId(), from, to, allowedRelationIds, _isNew: true }`

Filters for the matrix **view** do not delete rules; they only hide axes/cells.

When filter «selected relations» is non-empty, cell **count/color** should reflect only rules whose allowed set intersects the filter (display filter), while the edit dialog still shows the full relation list and full current selection for that pair.

## Architecture

New UI under notations feature (do **not** extend `models-matrix` with edit mode):

```
src/features/notations/
  components/
    RelationRulesMatrixOverlay.vue   # shell: filters + grid + cell dialog
    RelationRulesMatrixGrid.vue      # table; count, tooltip, heat, click
    RelationRulesMatrixFilters.vue   # multi-select axes + hide empty
    RelationRulesCellDialog.vue      # multi-select relations Apply/Cancel
  utils/
    buildRelationRulesMatrix.ts      # pure: filters → rows/cols/cells
    applyRelationRuleCell.ts         # pure mutate helper
```

Wire-up in `NotationEditorPage.vue`:

- `showRelationRulesMatrix` ref
- Toolbar action opens overlay
- Overlay receives `components`, `relations`, `relationRules`, `onMutateRelationRules` (same as panel)

Visual patterns may mirror `RelationMatrixGrid` / filters from `models-matrix`, but types and click behavior stay local.

## i18n

Add keys under notations/diagram locale modules (`ru` + `en`), e.g.:

- open / title / axes labels
- filters (select all / clear / hide empty)
- cell empty / count / tooltip
- dialog title / apply / cancel
- no components / no relations empty states

## Testing

- Unit: `buildRelationRulesMatrix` (filters, hide empty, heat max, intersection with relation filter)
- Unit: `applyRelationRuleCell` (create, update, clear new, soft-delete existing)
- Component smoke optional: dialog Apply emits / calls mutate

## Docs

Short mention in in-app notations help (`src/features/docs/content/notations.md` + `.en.md`): matrix overlay for bulk rule editing; panel remains for per-component edits.

## Non-goals

- Editing rules from the model relation matrix
- Server-side matrix endpoint
- Changing API shape of relation rules

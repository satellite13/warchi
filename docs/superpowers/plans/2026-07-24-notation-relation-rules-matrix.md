# Notation relation rules matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fullscreen overlay matrix in the notation editor to edit `EditorRelationRule` by clicking component×component cells and selecting allowed relations.

**Architecture:** New pure utils + Vue components under `src/features/notations/`; mutate the same `state.relationRules` as `RelationRulesSection` via `handleMutateRelationRules`. Visual/filter UX mirrors `models-matrix` but stays a separate module (no shared edit mode).

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest, existing `MultiSelect` / modal patterns, i18n in `src/i18n`.

**Spec:** [docs/superpowers/specs/2026-07-24-notation-relation-rules-matrix-design.md](../specs/2026-07-24-notation-relation-rules-matrix-design.md)

---

## File map

| File | Role |
|------|------|
| `src/features/notations/utils/applyRelationRuleCell.ts` | Pure mutate create/update/clear |
| `src/features/notations/utils/applyRelationRuleCell.test.ts` | TDD for apply helper |
| `src/features/notations/utils/buildRelationRulesMatrix.ts` | Pure build filtered matrix |
| `src/features/notations/utils/buildRelationRulesMatrix.test.ts` | TDD for matrix build |
| `src/features/notations/components/RelationRulesCellDialog.vue` | Relation multi-select dialog |
| `src/features/notations/components/RelationRulesMatrixFilters.vue` | Axis/relation filters + hide empty |
| `src/features/notations/components/RelationRulesMatrixGrid.vue` | Table: count, tooltip, heat, click |
| `src/features/notations/components/RelationRulesMatrixOverlay.vue` | Shell composing filters/grid/dialog |
| `src/features/notations/layout/NotationEditorHeader.vue` | Toolbar button |
| `src/features/notations/NotationEditorPage.vue` | Open overlay + wire state |
| `src/i18n/locales/*.ts` (notations/diagram as appropriate) | ru/en strings |
| `src/features/docs/content/notations.md` (+ `.en.md`) | Short help mention |

---

### Task 1: `applyRelationRuleCell` (TDD)

- [ ] Write failing tests for: create new rule; update existing; clear `_isNew` (splice); soft-delete existing; no-op when clearing missing pair; dedupe relation ids.
- [ ] Implement `applyRelationRuleCell` per spec.
- [ ] Run `npx vitest src/features/notations/utils/applyRelationRuleCell.test.ts` — pass.

### Task 2: `buildRelationRulesMatrix` (TDD)

- [ ] Define types locally (or small `relationRulesMatrixTypes.ts`): filters, cell `{ fromId, toId, total, relationIds, relationNames }`, result with `rows`, `columns`, `cells`, `maxCellTotal`.
- [ ] Write failing tests: full matrix; exclude deleted/untyped; multi-select row/col filters; hide empty; relation filter affects displayed count/heat only; empty notation.
- [ ] Implement builder. Cell key helper e.g. `${from}::${to}`.
- [ ] Run vitest for this file — pass.

### Task 3: Cell dialog UI

- [ ] Implement `RelationRulesCellDialog.vue`: title with from/to names, `MultiSelect` (or checkbox list) of active relations, Cancel / Apply.
- [ ] Emit apply with selected ids; do not mutate rules inside dialog.

### Task 4: Filters + Grid

- [ ] `RelationRulesMatrixFilters.vue`: multi-select rows/cols/relations, select all / clear, hide-empty checkbox — mirror control density of `RelationMatrixFilters.vue` but with notation i18n keys.
- [ ] `RelationRulesMatrixGrid.vue`: sticky header/first column; cell shows count; `title` tooltip with names; heat via alpha from `maxCellTotal` when count > 0; emit `select(fromId, toId)` on cell click (including empty).

### Task 5: Overlay shell

- [ ] `RelationRulesMatrixOverlay.vue`: props for components, relations, relationRules, nodeTypes (for untyped filter), `onMutateRelationRules`; local filter state; open cell dialog on select; on Apply call `applyRelationRuleCell` inside `onMutateRelationRules`; Escape / close button emits `close`.
- [ ] Exclude untyped components/relations the same way as `RelationRulesSection` (`diagram only` node/link types).

### Task 6: Wire into editor

- [ ] Add toolbar button in `NotationEditorHeader.vue` (canvas mode), event e.g. `open-relation-rules-matrix`.
- [ ] In `NotationEditorPage.vue` `handleToolbarAction`: set `showRelationRulesMatrix = true`; render overlay when true; pass `state` slices + `handleMutateRelationRules`.
- [ ] Ensure overlay sits above canvas (z-index) and does not break existing save/dirty.

### Task 7: i18n + docs

- [ ] Add ru/en keys for open button, title, filters, axes, empty/count/tooltip, dialog, empty states.
- [ ] Mention matrix in `notations.md` / `notations.en.md`.

### Task 8: Verify

- [ ] Run targeted vitest for new utils.
- [ ] Manual smoke: open overlay, filter, set cell, clear cell, confirm panel list syncs, Save still syncs rules via existing path.
- [ ] `npm run lint` on touched files if practical.

---

## Notes for implementer

- Reuse `createId` from `@/domain/attrs/notationAttrs`.
- Do not import from `src/features/models-matrix` for types/build — copy patterns only if needed to avoid coupling.
- Keep `RelationRulesSection` untouched functionally.
- Commits: prefer small commits per task when user asks to commit; do not commit unless asked.

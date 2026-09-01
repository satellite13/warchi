# Structure Reuse — God-file Decomposition Plan (post Wave 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`structure-reuse-audit-implementation-plan.md`](https://github.com/satellite13/warchi/blob/cursor/structure-reuse-audit-plan-ec41/docs/structure-reuse-audit-implementation-plan.md) ([PR #1](https://github.com/satellite13/warchi/pull/1))  
**Status of parent DoD (waves 0–3):** closed by PRs #2–#5 (boundaries / list-detail / shared UI / ModelEditor modal+script-run extract).  
**This document:** follow-up decomposition of remaining god-files. **Does not reopen** parent DoD. Product UX/API unchanged.  
**Note:** parent plan file may not yet sit on the same git tip as Wave 3; treat PR #1 / its branch as canonical text for Waves 0–4 polish.

**Baseline (tip of Wave 3):**

| LOC | File |
|----:|------|
| 4373 | `src/features/models/ModelEditor.vue` |
| 4144 | `src/features/models/components/ModelDiagramCanvas.vue` |
| 2963 | `src/features/diagram-style/components/NodeStylePanel.vue` |
| 1489 | `src/features/models/components/ModelTreePalettePanel.vue` |
| 1480 | `src/features/models/components/ModelImportWizard.vue` |
| 1298 | `src/features/notations/NotationEditorPage.vue` |

Parent orientir after Wave 3 (`ModelEditor.vue` &lt; 3500) was **not** a hard gate; this plan continues toward that orientir and further canvas/panel cuts.

---

## Relationship to Wave 4

| Track | Scope | Blocks audit close? |
|-------|--------|---------------------|
| **Parent Wave 4 (polish)** | New shared `FormSection` (does not exist yet), reuse `EmptyState`, matrix filter shell, dropdown panel styles, merge `ModelMainPanelLayout` / `NotationMainPanelLayout` | No |
| **This plan (G1–G4)** | Orchestration/composable/HUD extracts from god-files | No |
| **Deferred deep splits (G5)** | Full `NodeStylePanel` handler split, boundary/group canvas rewrite, ImportWizard host rewrite | No — product request only |

**Rule:** do **not** mix polish PRs and god-file PRs. Wave 4 polish may run in parallel with G1–G2 if branch bases are clear; do not land both in one PR.

**Naming:** paths below match Wave 3 tip. Parent Task 4.4 “MainPanelLayout wrappers” = `ModelMainPanelLayout.vue` + `NotationMainPanelLayout.vue`.

---

## Fixed decisions (do not reopen)

1. **Two editor families remain.** Do not force notations/models into `ListDetailEditorLayout`.
2. **No UX/API change.** i18n keys stay; no papirus / arepos-server behavior change.
3. **Papirus host stays in canvas SFC (or one co-located engine module):**  
   `syncDiagram` / `createInstanceNode` / `bindInteractionEvents` / `initRenderer` are **not** split across PRs in G1–G4.
4. **Live-sync, batch-save, lock/conflict domain stay in ModelEditor shell** (or existing save/sync composables). Do not re-home into delete/properties extracts.
5. **Pure TS / composable first; Vue child only when there is real template** (HUD, wizard steps, style section panels).
6. **One vertical slice ≈ one PR** (or stacked PR with previous G-slice as base). No bang rewrite of a 4k file.
7. **Tests before/with extract:** unit for pure builders; models suite regression for editor/canvas slices.
8. **arepos-server / papirus packages out of scope.**

---

## Target architecture (after G1–G4)

```
ModelEditor.vue                    # thin page: layout + wiring (~≤3200 after G2; ≤2800 stretch)
├── composables/
│   ├── useModelEditorScriptRun.ts       # done (Wave 3)
│   ├── useModelBatchConflictUi.ts       # done earlier
│   ├── useModelBatchConflictResolution.ts
│   ├── useModelToolbarState.ts          # toggles only (exists)
│   ├── useModelEditorEntityDelete.ts    # G1
│   ├── useModelEditorDiagramSwitch.ts   # G1 (or merged with delete)
│   ├── useModelEditorProperties.ts      # G2
│   ├── useModelEditorElementStyle.ts    # G2
│   └── useModelEditorToolbarActions.ts  # G2 (after props/style)
├── components/modals/                   # Wave 3 + G1 OefImportReportModal
│   ├── LinkDeleteModal.vue              # done
│   ├── … Wave 3 modals …
│   └── OefImportReportModal.vue         # G1
└── layout/ModelMainPanelLayout.vue

ModelDiagramCanvas.vue             # papirus host (~≤3400 after G3; ≤3000 stretch after G4)
├── components/diagram/
│   ├── buildModelDiagramContextMenu.ts  # done (Wave 3)
│   ├── setEdgeTypeFromContextMenu.ts    # G3
│   └── ModelDiagramCanvasHud.vue        # G3 palette + empty + remote pointer
├── utils/diagramOnlyInstances.ts       # extend in G3 (single predicate source)
└── composables/ (or components/diagram/)
    ├── useDiagramSelectionBridge.ts     # G4
    ├── useDiagramHistoryPersist.ts      # G4
    └── useDiagramViewportControls.ts    # G4
```

`NodeStylePanel` / `ModelImportWizard` / `NotationEditorPage` / `ModelTreePalettePanel` — G5 / Wave 4; not required for G1–G4 exit.

---

## Dependency graph

```
Wave 3 (done)
   │
   ├─► G1  ModelEditor: delete/switch + OefImportReportModal
   │      │
   │      └─► G2  ModelEditor: properties + element style + toolbar actions
   │
   ├─► G3  Canvas: HUD + context-menu leftovers + note predicates   (∥ G1/G2)
   │      │
   │      └─► G4  Canvas: selection bridge + history/viewport
   │
   ├─► Wave 4 polish (∥ any G*; separate PRs)
   │
   └─► G5  Optional deep splits (product request)
```

G3 may start in parallel with G1 if engineers are separate; **do not** land G4 before G3 (selection/history touch the same interaction host as HUD wiring). G3 PRs must not edit `ModelEditor.vue`.

---

## Success metrics

### Exit G1–G2 (ModelEditor track)

- [ ] No inline OEF import **report** modal markup in `ModelEditor.vue`
- [ ] Delete / diagram-switch-discard orchestration lives in composable(s); page only wires modals
- [ ] Properties computeds/setters and element-style apply/restore live in composables
- [ ] Toolbar **actions** not a 200+ line switch inside the page (`useModelToolbarState` stays toggles-only)
- [ ] `ModelEditor.vue` **≤ 3200** LOC (stretch **≤ 2800** if toolbar extract included)
- [ ] `npx vitest run src/features/models` green; no i18n key loss

### Exit G3–G4 (Canvas track)

- [ ] Palette / empty-state / remote-pointer UI not in canvas SFC template (child HUD)
- [ ] Context-menu **actions** (edge type) live in pure TS; note/container predicates have **one** module (`diagramOnlyInstances.ts` or thin wrapper)
- [ ] Selection props↔papirus bridge and history/viewport expose helpers are composables
- [ ] `syncDiagram` / `bindInteractionEvents` / `initRenderer` **unchanged in responsibility** (injected helpers only)
- [ ] `ModelDiagramCanvas.vue` **≤ 3400** after G3; **≤ 3000** after G4 (stretch)
- [ ] Canvas/models regression tests green

### Explicitly out of G1–G4 metrics

- Full `NodeStylePanel` &lt; 1k
- Import wizard composable host
- Boundary/group drag extract
- `ModelTreePalettePanel` split
- Parent Wave 4 polish checklist

---

## G1 — ModelEditor delete / switch + OEF report

**Branch:** `cursor/structure-reuse-g1-editor-delete-ec41`  
**Base:** Wave 3 tip / master after Wave 3 merge  
**Risk:** medium

### Task G1.1 — Inventory refresh

- [ ] Re-list line ranges for: node/link/diagram delete confirms, Delete hotkey (`shouldSkipDeleteHotkey`), dirty diagram switch/close discard (`showDiagramSwitchModal`), OEF import report (`oefImportReport` + inline `BaseModal`)
- [ ] Confirm Wave 3 already owns: `LinkDeleteModal`, `UnsavedChangesModal` (switch UI), `useModelEditorScriptRun`, create/choice/note/migrate/trash/json modals — G1 must not re-extract those shells

### Task G1.2 — `OefImportReportModal.vue`

**Files:**

- Create: `src/features/models/components/modals/OefImportReportModal.vue`
- Modify: `ModelEditor.vue` (replace inline report `BaseModal` ~4094+)
- Data already from `useOefImport` (`oefImportReport`)
- Test: mount stub like `modelEditorModals.test.ts`

- [ ] Props = report DTO; no parse logic in modal
- [ ] Move report-only CSS with the modal
- [ ] Commit: `refactor(models): extract OefImportReportModal`

### Task G1.3 — `useModelEditorEntityDelete` (+ switch discard)

**Files:**

- Create: `src/features/models/composables/useModelEditorEntityDelete.ts`
- Optional: `useModelEditorDiagramSwitch.ts` if delete file &gt; ~400 LOC
- Modify: `ModelEditor.vue`
- Tests: composable unit for confirm/cancel with mocked mark-dirty / reconcile

**Include:**

- Pending ids + confirm messages (`showNodeDeleteModal`, diagram delete, etc.)
- `confirm*Delete` / `cancel*Delete` / open dialogs
- Remove-from-diagram vs remove-from-model (page logic that drives `LinkDeleteModal` emits)
- Delete hotkey guard (`shouldSkipDeleteHotkey` + handler)
- Diagram switch/close **without save** (discard path) + cancel — keep using `UnsavedChangesModal` as UI

**Exclude (stay in page / save composables):**

- `saveAndSwitch` / `saveWithValidation` / lock verify / batch conflict (`useModelBatchConflictUi` / `useModelBatchConflictResolution`)
- Live-sync / granular failure maps
- Papirus reconnect / diagram attrs writers

- [ ] Commit: `refactor(models): extract entity delete and diagram discard orchestration`

### Task G1.4 — G1 close

- [ ] LOC `ModelEditor.vue` recorded in PR (expect roughly −600 to −1000 vs Wave 3 tip; verify in G1.1 — modal shells already gone)
- [ ] `npx vitest run src/features/models`
- [ ] PR title: `refactor(g1): ModelEditor delete/switch orchestration`

---

## G2 — ModelEditor properties / style / toolbar

**Branch:** `cursor/structure-reuse-g2-editor-props-ec41`  
**Base:** G1  
**Risk:** medium (toolbar med–high — last inside G2)

### Task G2.1 — `useModelEditorProperties`

- [ ] Move binding/property computeds + history-aware setters used by `ModelPropertiesPanel`
- [ ] Export anything required by diagram-connection bind helpers / document modal (preserve init order)
- [ ] Commit: `refactor(models): extract useModelEditorProperties`

### Task G2.2 — `useModelEditorElementStyle`

- [ ] Move apply/read/restore diagram style for selected element + snapshots
- [ ] Depends on existing style utils / history batcher — inject, don’t copy
- [ ] Commit: `refactor(models): extract useModelEditorElementStyle`

### Task G2.3 — `useModelEditorToolbarActions`

- [ ] Move `handleToolbarAction` switch (save, undo/redo, zoom, export, OEF, package, validation, close-diagram, wiki, …)
- [ ] Keep existing `useModelToolbarState` for **toggle state only** (do not merge actions into it)
- [ ] Only after G2.1–G2.2 if those actions call into new composables
- [ ] Commit: `refactor(models): extract useModelEditorToolbarActions`

### Task G2.4 — Optional selection sync / right-panel tabs

- [ ] Only if LOC still &gt; 3200 after G2.3
- [ ] `useModelEditorSelectionSync` / right-tab gates
- [ ] Commit: `refactor(models): extract selection sync / right panel tabs`

### Task G2.5 — G2 close

- [ ] `ModelEditor.vue` ≤ 3200 (stretch ≤ 2800)
- [ ] models suite green
- [ ] PR: `refactor(g2): ModelEditor properties, style, toolbar orchestration`

---

## G3 — Canvas HUD + menu leftovers (low risk)

**Branch:** `cursor/structure-reuse-g3-canvas-hud-ec41`  
**Base:** Wave 3 tip (parallel OK) or G2 if single-track  
**Risk:** low  
**Constraint:** canvas-only PR — **no** `ModelEditor.vue` edits

### Task G3.1 — `ModelDiagramCanvasHud.vue` (or `DiagramNotationPalette.vue` + thin overlays)

- [ ] Move notation palette, empty placeholder, remote collaborator pointer (+ related scoped CSS)
- [ ] Parent keeps canvas element + DnD drop target; HUD emits drag-start events or uses slots
- [ ] Commit: `refactor(models): extract ModelDiagramCanvas HUD`

### Task G3.2 — Finish context-menu story

- [ ] `setEdgeTypeFromContextMenu.ts` (attrs + history command factory)
- [ ] Extend `src/features/models/utils/diagramOnlyInstances.ts` (or thin wrapper) — **one** source of truth; grep-delete duplicate note/container helpers in canvas
- [ ] Canvas keeps context-menu wiring only (`buildModelDiagramContextMenu` already extracted)
- [ ] Commit: `refactor(models): extract edge-type context action and note predicates`

### Task G3.3 — G3 close

- [ ] `ModelDiagramCanvas.vue` ≤ 3400
- [ ] Unit tests for pure TS modules; canvas smoke/regression as available
- [ ] PR: `refactor(g3): canvas HUD and context-menu leftovers`

---

## G4 — Canvas selection + history/viewport

**Branch:** `cursor/structure-reuse-g4-canvas-bridge-ec41`  
**Base:** G3  
**Risk:** medium

### Task G4.1 — `useDiagramSelectionBridge`

- [ ] Props selection ↔ papirus selection; edge-priority click helpers
- [ ] Preserve suppress-selection flags / z-order side effects
- [ ] Commit: `refactor(models): extract diagram selection bridge`

### Task G4.2 — `useDiagramHistoryPersist` + `useDiagramViewportControls`

- [ ] History undo/redo persist orchestration (not papirus HistoryManager internals)
- [ ] Viewport zoom/fit/persist/restore + overlay toggles exposed to parent toolbar
- [ ] Document watch races (`suppressHistoryCanvasPersist`, layout undo) in composable
- [ ] Commit: `refactor(models): extract diagram history persist and viewport controls`

### Task G4.3 — G4 close

- [ ] `ModelDiagramCanvas.vue` ≤ 3000 (stretch)
- [ ] `syncDiagram` / `bindInteractionEvents` / `initRenderer` still owned by canvas host
- [ ] PR: `refactor(g4): canvas selection and history/viewport bridges`

---

## G5 — Deferred deep splits (product request only)

Not scheduled. Checklist for future RFCs:

| Item | Why deferred | Suggested entry |
|------|--------------|-----------------|
| Boundary/group drag (~400+ LOC) | High coupling to `bindInteractionEvents` | After G4 + dedicated canvas bug budget |
| Label/port writeback pure TS (~280) | Touches sync periphery | Optional G4.x if G4 undershoots LOC |
| `NodeStylePanel` presets composable + edge/node shells | Live style apply contracts | Wave 4 lite **or** style RFC |
| Full `NodeStylePanel` handler split | High regression risk | Dedicated style wave |
| `ModelImportWizard` step components + issues list | Medium UX timing risk | Wave 4 lite |
| Full `useModelImportWizard` host | Larger rewrite | Import RFC |
| `NotationEditorPage` modals/validation/doc composables | Already workspace-shaped (list/canvas/aside) | Wave 4 lite / notations RFC |
| Force Notation into `ListDetailEditorLayout` | Contradicts family A | **Forbidden** |
| `ModelTreePalettePanel` (~1489) | Not analyzed in depth here | Separate inventory before extract |

---

## Wave 4 polish (pointer — do not duplicate work here)

Execute from parent plan Task 4.1–4.4:

- 4.1 Create shared `FormSection` (new) + adopt `EmptyState` where empty meaning matches
- 4.2 Matrix filter shell
- 4.3 Dropdown/Teleport panel styles
- 4.4 Merge `ModelMainPanelLayout` / `NotationMainPanelLayout` into one configurable wrapper

Allowed **lite** overlaps with G5 table (presets composable, import issues list, notation confirm modals) **only** as small PRs that do not start full god-file rewrites.

---

## Test strategy

| Slice | Minimum |
|-------|---------|
| G1 | `OefImportReportModal` mount; entity-delete composable unit; models suite |
| G2 | properties/style composable units; toolbar action smoke; models suite |
| G3 | context-menu/predicates unit; HUD mount smoke; models canvas tests if present |
| G4 | selection bridge unit with mocks; history/viewport unit; models suite |
| G5 / W4 | as in parent plan |

Anchors:

```bash
npm run lint
npx vitest run src/features/models src/features/diagram-style src/features/notations
npm run build
```

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Delete extract accidentally pulls save/lock | Explicit exclude list in G1.3; review checklist |
| Toolbar extract too early | G2.3 after properties/style; allow skipping if deps unstable |
| Parallel G3 vs G1 merge conflicts in ModelEditor | G3 canvas-only; forbid ModelEditor edits in G3 PR |
| Selection bridge breaks multi-select / edge hit-test | Golden tests for suppress flags; manual checklist in PR |
| Predicate duplication across modules | G3.2 single module + grep gate |
| Scope creep into papirus sync | PR non-goals list; reject `syncDiagram` moves |
| Conflict with parent Wave 4 polish | Separate branches; no shared “misc refactor” PR |
| Overstated G1 LOC delta | G1.1 measures remaining orchestration after Wave 3 modal extract |

---

## Out of scope (reaffirmed)

- arepos-server / papirus API and behavior
- Product UX changes
- Rewriting live-sync / batch-save domain logic
- i18n key rename for cosmetics
- Pinia/Vuex
- Merging editor families A and B
- Making parent audit DoD depend on G1–G5

---

## PR order checklist

- [x] Wave 0–3 (parent audit)
- [ ] G1 — ModelEditor delete/switch + OEF report
- [ ] G2 — ModelEditor properties/style/toolbar
- [ ] G3 — Canvas HUD + menu leftovers
- [ ] G4 — Canvas selection + history/viewport
- [ ] (opt) Wave 4 polish — parent plan
- [ ] (opt) G5 RFCs — per product request
- [ ] Closing comment: links + LOC table vs baseline

---

## Appendix A — Baseline inventory (Wave 3 tip)

Refresh line numbers at slice start.

### ModelEditor.vue (~4373)

| Cluster | Approx role | Target slice |
|---------|-------------|--------------|
| Script-run modal wiring | Validation scripts | **Done** `useModelEditorScriptRun` |
| Batch conflict UI | Save conflicts | **Done** `useModelBatchConflictUi` / resolution |
| Inline OEF import report modal | Template report via `useOefImport` | **G1.2** |
| Entity delete + Delete hotkey | Nodes/links/diagrams | **G1.3** |
| Dirty diagram switch discard | Unsaved switch/close (`UnsavedChangesModal`) | **G1.3** (save path stays) |
| Properties computeds/setters | `ModelPropertiesPanel` data | **G2.1** |
| Element style apply/restore | Style tab | **G2.2** |
| `handleToolbarAction` switch | Header/canvas toolbar | **G2.3** |
| Live-sync / scoped reload / batch save | Domain shell | **Keep** |
| Papirus attrs/reconnect wrappers | Canvas contract | **Keep** |

### ModelDiagramCanvas.vue (~4144)

| Cluster | Target slice |
|---------|--------------|
| `buildModelDiagramContextMenu` | **Done** Wave 3 |
| Palette / empty / remote pointer | **G3.1** |
| Edge-type context action + note predicates | **G3.2** |
| Selection bridge | **G4.1** |
| History persist + viewport controls | **G4.2** |
| `syncDiagram` / `createInstanceNode` / `bindInteractionEvents` / `initRenderer` | **Keep** |
| Boundary/group drag | **G5** |

---

## Appendix B — Consistency review log

### B.1 Checks performed

- [x] Aligns with parent “Wave 3 then optional Wave 4”; G1–G4 are **not** parent DoD
- [x] Does not force notations into list-detail (`ListDetailEditorLayout` stays family B)
- [x] Papirus pipeline non-goals match parent Wave 3.6 / out-of-scope
- [x] File paths verified on Wave 3 tip (`ModelEditor.vue`, `ModelDiagramCanvas.vue`, `NodeStylePanel.vue`, `ModelTreePalettePanel.vue`, `ModelImportWizard.vue`, `NotationEditorPage.vue`)
- [x] Existing symbols credited: `useModelEditorScriptRun`, `useModelBatchConflictUi`, `useModelToolbarState`, `useOefImport`, `LinkDeleteModal`, `UnsavedChangesModal`, `buildModelDiagramContextMenu`, `diagramOnlyInstances.ts`
- [x] LOC targets split by track; no contradicting “must &lt; 1500” claims
- [x] Wave 4.1 `FormSection` marked as **to-be-created** (not present in repo today)
- [x] Wave 4.4 layout merge names corrected to `ModelMainPanelLayout` / `NotationMainPanelLayout`
- [x] Parallelism + G3 canvas-only constraint stated
- [x] `ModelTreePalettePanel` unanalyzed → G5 only

### B.2 Contradictions found and resolutions

| Issue | Resolution |
|-------|------------|
| Parent orientir `ModelEditor` &lt; 3500 vs baseline 4373 after Wave 3 | Stretch continued in G1–G2; metrics ≤3200/≤2800 — not a failed parent DoD |
| Parent Wave 4.5 further NodeStyle/Import/Notation split vs G5 | Same bag; G5 = detailed deferral; Wave 4 may take **lite** only |
| Draft idea “extract conflict UI in G1” | **Rejected** — already have `useModelBatchConflictUi` + resolution |
| Relative link to parent plan broken on Wave 3 tip | Absolute link to audit-plan branch / PR #1 |
| G3 vs G1/G2 ModelEditor conflicts | G3 must be canvas-only |
| Draft “EmptyState vs EmptyState” wording | Removed; repo already has `EmptyState.vue` — Wave 4 adopts it, does not rename |
| Parent “MainPanelLayout” generic name | Mapped to actual `ModelMainPanelLayout` / `NotationMainPanelLayout` |
| Parent Task 4.1 `FormSection` as if existing | Clarified: **create** shared component in Wave 4 |
| G1 −800..−1000 vs Wave 3 already removing modal shells | Softened to −600..−1000; G1.1 must measure |

### B.3 Completeness gaps (accepted)

- No deep inventory of `ModelTreePalettePanel.vue`
- Exact line numbers drift — refresh at G1.1 / G3 start
- Save-and-switch stays in shell by design
- Label/port writeback optional under G5, not mandatory G4

### B.4 Verdict

Plan is **internally consistent** with parent audit and Wave 3 outcomes, **complete enough** to execute G1–G4, and **explicit** about deferrals (G5 / Wave 4 polish). Safe to start at G1 without reopening parent DoD.

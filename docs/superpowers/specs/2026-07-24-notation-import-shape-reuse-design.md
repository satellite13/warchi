# Notation import — reuse existing custom shapes by name — Design Spec

Date: 2026-07-24  
Status: approved  
Repos: warchi  
Related:

- `docs/superpowers/specs/2026-07-23-notation-export-shapes-design.md` (baseline: shapes always newly created)
- `src/features/notations/composables/useNotationExport.ts`
- `src/features/notations/utils/normalizeNotationImport.ts`
- `src/features/notations/utils/persistPendingShapes.ts`
- `src/features/notations/utils/notationShapePackage.ts`
- `src/composables/useNodeShapes.ts`
- `src/features/notations/NotationEditorPage.vue`

## Goal

When importing a notation that packages custom shapes, if the user already has access to a catalog shape with the **same name**, offer to **reuse that shape** or **create a new** catalog entry — with geometry previews — instead of always creating duplicates (`Name (2)`).

## Problem summary

After the 2026-07-23 shapes packaging work, import always creates new `node_shapes` on Save (with case-insensitive rename on clash). Re-importing or sharing a notation that uses shapes already in the user’s catalog produces unnecessary duplicates and breaks the mental model of a shared shape library.

## Decisions

| Topic | Choice |
|-------|--------|
| When to resolve | Immediately after file pick, **before** applying import to the editor |
| UI | Hybrid: bulk «all → existing / all → create» + per-row override |
| Match key | Case-insensitive `name` against shapes returned by `GET /node-shapes` (owned + shared) |
| Geometry differs | Still offer reuse/create; show warning «геометрия отличается» |
| Previews | SVG from outline for **imported** and **selected catalog** candidate |
| Multiple candidates same name | Dropdown of candidates + preview of selected |
| Default action | Outline matches → `reuse`; differs → `create` |
| Candidate order | OWNER → EDIT → VIEW, then `updatedAt` desc |
| Apply strategy | Resolve on import: `reuse` remaps `customShapeId` and skips `pendingShapes`; `create` stays in `pendingShapes` as today |
| `customOutline` on reuse | Replace with the selected catalog shape’s outline (and `contentArea` if present) so render matches the chosen catalog entity |
| Cancel | Abort import; editor state unchanged |
| Catalog fetch failure | Show error; do not apply import (no silent fallback to always-create) |
| Server `POST /notations/import` | **Out of scope** (UI does not use it) |
| Match by source UUID only | Out of scope |
| Auto-reuse without dialog | Out of scope |

This revises the 2026-07-23 decision «shapes always newly created» for the **client file-import path only**. Unmatched names and explicit `create` still use `persistPendingShapes` + `Name (2)` on Save.

## Import pipeline

```
1. User picks JSON
2. Parse → extract top-level shapes[] (+ synthesize from customOutline if needed, existing helpers)
3. fetchAllPages('/node-shapes')
4. If any imported shape has ≥1 name-match → show shape-resolve dialog
5. If local-only components/relations need keep/delete → existing merge dialog
6. applyNotationImport(raw, localOnlyMode, shapeResolutions)
7. Editor: pendingShapes only for create / unmatched
8. Save: persistPendingShapes for remaining pendingShapes only
```

Order of dialogs: **shape resolve first**, then local-only merge (if needed).

## UI

Modal title: import custom shapes (i18n).

Content:

1. Short explanation.
2. Bulk actions: «Все → существующие», «Все → новые» (set `action` on every conflict row; do not reset selected candidate).
3. One row per **name conflict** only (shapes with no catalog match are not listed).
4. Per row:
   - Shape name
   - Action select: reuse / create
   - Candidate select — only if `candidates.length > 1`
   - Side-by-side previews: «Из файла» / «В каталоге»
   - Status: geometry matches (success) or differs (warning)
5. Actions: Cancel / Continue import

Preview rendering: small SVG derived from `OutlineSegment[]` (shared helper; canvas editor is not required in the modal). Prefer reusing geometry utilities from the shapes feature if a fit exists; otherwise a focused `outlinePreview` helper under notations or shapes utils.

## Data model

```ts
type ShapeImportAction = 'reuse' | 'create'

type ShapeImportConflict = {
  imported: ExportedNodeShape
  candidates: NodeShapeResponse[]
  /** geometryMatches[i] compares imported.outline to candidates[i].outline */
  geometryMatches: boolean[]
}

type ShapeImportResolution = {
  importedId: string
  action: ShapeImportAction
  /** Required when action === 'reuse' */
  catalogShapeId?: string
}
```

Helpers (suggested locations):

- `analyzeImportShapeConflicts(importedShapes, catalogShapes) → ShapeImportConflict[]`
- `defaultShapeImportResolutions(conflicts) → ShapeImportResolution[]`
- `outlinesEquivalent(a, b) → boolean` — parse JSON outlines and compare normalized segment lists (stable equality; whitespace-insensitive)
- Apply path: extend `normalizeNotationImport` (or a thin wrapper) to accept `resolutions` and:
  - build `pendingShapes` excluding reused ids
  - remap `diagramStyle.customShapeId` for reuse
  - sync `customOutline` (and content-area fields if mirrored on components) from the chosen catalog shape

Wire through `useNotationExport` similarly to the existing import-merge dialog (`pendingImportRaw`, confirm/cancel).

## Edge cases

| Case | Behavior |
|------|----------|
| No shapes / no name matches | Skip shape dialog |
| Catalog fetch fails | Error toast/message; abort import |
| User cancels shape dialog | Abort import |
| Create with name already taken | Unchanged: `nextUniqueShapeName` on Save |
| Reuse shared VIEW shape | Allowed (reference only) |
| After reuse | Shape must not appear in `pendingShapes` or be POSTed |
| Empty / invalid outline on either side | Treat as non-matching geometry; still allow reuse/create |

## Testing

Unit tests (Vitest):

- Name match case-insensitive; no false positive on unrelated names
- Default action: matching outline → reuse; differing → create
- Apply resolutions: reuse remaps id and drops from pending; create keeps pending
- Multiple candidates: default picks first by OWNER/EDIT/VIEW + updatedAt order among matching outlines, else first by that order with create
- Bulk action helper sets all actions without clearing candidate ids

No e2e in this scope.

## i18n

Add `ru` / `en` keys under `notations.*` for dialog title, body, bulk buttons, row labels (from file / in catalog), geometry match/differ, action labels, cancel / continue.

## Out of scope

- arepos-server `NotationImportService` parity
- Changing export format
- Deduplicating by outline when names differ
- Editing catalog shapes from the import dialog

## Open follow-ups (non-blocking)

- Optional later: server import API could accept the same resolution map for CLI/API clients.

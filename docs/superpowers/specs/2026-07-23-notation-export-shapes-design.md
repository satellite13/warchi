# Notation export/import — include custom shapes — Design Spec

Date: 2026-07-23  
Status: approved  
Repos: warchi, arepos-server  
Related:

- `src/features/notations/composables/useNotationExport.ts`
- `src/features/diagram-style/components/NodeStylePanel.vue`
- `src/composables/useNodeShapes.ts`
- arepos-server: `NotationImportService`, `NotationImportDtos`, `NodeShapes`

## Goal

When transferring a notation between application instances via export/import, used custom shapes (`node_shapes`) must travel with the package and be recreated in the target user's shape catalog so they appear in the shape select and can be reused for new components.

## Problem summary

Custom shapes live in a separate catalog (`/node-shapes`). Components store `diagramStyle.customShapeId` plus an inline snapshot `customOutline`. Notation export includes components (and thus the outline snapshot) but not the catalog entities. After import:

- Rendering often still works via `customOutline`.
- The shape select is fed only from `/node-shapes`, so the imported shape is missing.
- Creating another component with the same shape is impossible without manually recreating the shape.

## Decisions

| Topic | Choice |
|-------|--------|
| Catalog on target | Create full `node_shapes` entities owned by the importer |
| Name conflict | Always create a new shape; on name clash use `Name`, `Name (2)`, … |
| Scope | Client JSON export/import **and** `POST /notations/import` |
| When to persist (client UI path) | On notation **Save**, not on file pick |
| Package contents | Only shapes referenced by components (`customShapeId`) |
| Old v1 packages | Fallback: synthesize shapes from `customOutline` when `shapes[]` is absent |
| Types vs shapes | Node/link types may still be reused by name on server import; shapes always newly created |
| Wiki / file links | Strip `documentFileId` from shape `attrs` (same idea as component import) |

## Architecture

```
Export (warchi)
  components → collect customShapeId
  fetch/load used node_shapes → shapes[]
  download warchi-notation-export JSON

Import UI (warchi)
  normalize → state + pendingShapes (no API yet)
  Save:
    create shapes via POST /node-shapes (rename on conflict)
    remap customShapeId in components
    save notation entities as today

Import API (arepos-server)
  POST /notations/import { …, shapes[] }
  transactional: create shapes → remap attrs → types/components/relations/rules
```

## Export format

Keep `format: "warchi-notation-export"`. Write `version: 2`. Readers accept `version: 1` and `version: 2`; `shapes` is optional (default `[]`).

```ts
type ExportedNodeShape = {
  id: string // source catalog UUID
  name: string
  outline: string // jsonb string, same as API
  contentArea?: string | null
  attrs?: string | null // without documentFileId
}

type NotationExportPayloadV2 = {
  format: "warchi-notation-export"
  version: 2
  exportedAt: string
  notation: { id: string; name: string; version: string }
  state: NotationEditorState // existing fields
  shapes: ExportedNodeShape[]
}
```

**Selection rule:** include a shape iff at least one non-deleted component has `parsedAttrs.diagramStyle.customShapeId === shape.id` (including composite style paths that store the same fields). Deduplicate by `id`. If a referenced id is missing from the local catalog but `customOutline` exists, still emit a synthetic entry with that id, name derived from id or `"Imported shape"`, and `outline` serialized from `customOutline`.

## Client import and Save

### Editor state

Extend `NotationEditorState` with:

```ts
pendingShapes?: ExportedNodeShape[] // or a dedicated PendingShape type
```

`normalizeImportedState`:

1. Parse top-level `shapes` (or `[]`).
2. Keep component `customShapeId` / `customOutline` as in the file (ids still refer to pending/source ids).
3. Strip `documentFileId` from shape attrs when present.
4. Do **not** call `/node-shapes` during import.

### Save order

1. Resolve `pendingShapes` (or synthesize from components if empty — see Fallback).
2. For each pending shape, ensure a unique name among the owner's catalog (and among names already chosen in this Save batch): if `Name` exists, try `Name (2)`, `Name (3)`, …
3. `POST /node-shapes` for each → build `oldShapeId → newShapeId`.
4. Rewrite `customShapeId` on all components (and any composite style fields that mirror it).
5. Proceed with existing notation save (types, components, relations, rules).
6. Clear `pendingShapes`.

### Failure handling

If any shape create fails, abort Save with a clear error. Best effort: delete shapes created earlier in the same Save attempt when a later create fails (client compensating cleanup). Prefer not leaving orphan shapes without remapped components.

## Server `POST /notations/import`

### Request

Add optional:

```kotlin
shapes: List<ImportedNodeShape> = emptyList()
// id, name, outline, contentArea?, attrs?
```

### Behavior

Inside the existing `@Transactional` import:

1. Create all imported shapes for `owner` (never reuse by name). Apply the same `Name` / `Name (2)` conflict rule against existing shapes for that owner.
2. Build `shapeIdMap: Map<String, UUID>`.
3. Existing nodeType / linkType reuse-by-name logic unchanged.
4. Before persisting each component, rewrite JSON `attrs` so `diagramStyle.customShapeId` (and composite equivalent if present) uses `shapeIdMap`.
5. Persist components, relations, relation rules as today.

### Response

Add `shapeIdMap: Map<String, UUID>` alongside existing id maps.

### Client API helper

Update `importNotationViaApi` / DTOs to send `shapes` and accept `shapeIdMap`. The editor file-picker path may remain state-then-Save; the API path remains the atomic package import.

## Fallback (v1 and incomplete packages)

If `shapes` is missing or empty, but components reference custom shapes:

- Group by `customShapeId` when present; otherwise by outline fingerprint.
- Require non-empty `customOutline` (or recoverable outline) to create a shape.
- Default name: `"Imported shape"` with conflict suffixes as above.
- Remap `customShapeId` to the newly created ids.

If there is neither catalog entry nor outline, leave the component as-is (render may fall back to non-custom shape behavior).

## Testing

**warchi**

- Export includes only used shapes; unused catalog shapes omitted.
- Import v2 keeps `pendingShapes`; Save creates shapes, remaps ids, select options include new shapes.
- Name conflict produces `Name (2)`.
- Import v1 without `shapes[]` still creates shapes from `customOutline` on Save.

**arepos-server**

- Import with `shapes` creates `node_shapes` and remaps component attrs.
- Name conflict suffixes.
- Fallback when `shapes` empty but attrs contain outline + stale id.
- Transaction rolls back on mid-import failure (no partial notation without shapes when shapes were requested).

## Out of scope

- Changing how built-in shapes (`rectangle`, `diamond`, …) work.
- Sharing/publishing shapes across users beyond normal ownership.
- Migrating historical diagrams' instance overrides beyond what component attrs already carry.
- Wiring the editor Import button to `POST /notations/import` (optional follow-up; API must still accept the full package).

## Success criteria

1. Export a notation that uses custom shapes → JSON contains those shapes.
2. Import on another instance (or clean catalog) → Save (or API import) creates catalog entries.
3. Shape select lists the imported shapes; a new component can pick the same shape.
4. Existing v1 export files still import with usable shapes when outline snapshots are present.

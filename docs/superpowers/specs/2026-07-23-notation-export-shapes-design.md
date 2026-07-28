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
| Ownership / shares | Target gets **new owned copies**; source owner and shares are not transferred |
| Name uniqueness | Soft UX rule only — DB has **no** unique `(owner, name)` on `node_shapes` |
| Name match | Case-insensitive against owner's existing shapes (+ names already taken in this batch) |

## Architecture

```
Export (warchi)
  components → collect customShapeId from diagramStyle
  for each id: GET /node-shapes/{id} (do not rely on paginated list)
  missing id + customOutline → synthetic shapes[] entry
  download warchi-notation-export JSON (shapes at payload top-level)

Import UI (warchi)
  normalize → editor state + pendingShapes (editor-only; no API yet)
  Save (useNotationEditor.saveChanges, before saveComponents):
    create shapes via POST /node-shapes (rename on conflict)
    remap diagramStyle.customShapeId
    save notation entities as today
    clear pendingShapes; refresh shapes catalog for style panels

Import API (arepos-server)
  POST /notations/import { …, shapes[] }
  transactional: create shapes → remap component attrs → types/components/relations/rules
```

## Export format

Keep `format: "warchi-notation-export"`. Write `version: 2`. Readers accept `version: 1` and `version: 2`; `shapes` is optional (default `[]`).

`shapes` is a **top-level** payload field (sibling of `state`), not inside `NotationEditorState`. Site download validation only checks `format` today — `version: 2` remains valid.

```ts
type ExportedNodeShape = {
  id: string // source catalog UUID (or synthetic id when only outline exists)
  name: string
  outline: string // JSON string of OutlineSegment[], same wire form as API
  contentArea?: string | null
  attrs?: string | null // without documentFileId
}

type NotationExportPayloadV2 = {
  format: "warchi-notation-export"
  version: 2
  exportedAt: string
  notation: { id: string; name: string; version: string }
  state: NotationEditorState // existing fields only — never persist pendingShapes here
  shapes: ExportedNodeShape[]
}
```

**Where `customShapeId` lives:** always on `parsedAttrs.diagramStyle` — for both `nodeShape === 'custom'` and `nodeShape === 'composite'` with `compositeShapeType === 'custom'`. Same two fields: `customShapeId` + `customOutline`. There is no separate composite-only id path.

**Selection rule:**

1. Collect distinct non-empty `diagramStyle.customShapeId` from non-deleted components.
2. For each id, resolve catalog entity via **`GET /node-shapes/{id}`** (paginated `GET /node-shapes?size=…` is insufficient and must not be the sole source).
3. If fetch succeeds → emit `{ id, name, outline, contentArea, attrs }` with `documentFileId` stripped from attrs.
4. If fetch fails (404 / no access) but any referencing component has non-empty `customOutline` → emit synthetic entry: same id, name `"Imported shape"` (or first non-empty component-derived label if we already have one), `outline = JSON.stringify(customOutline)`, `contentArea` omitted.
5. Deduplicate by id. Unused catalog shapes are omitted.

**Re-export before Save after import:** build `shapes` from `pendingShapes` if present; otherwise from catalog/outline as above. Never serialize editor-only `pendingShapes` inside `state`.

## Client import and Save

### Editor state

Keep `pendingShapes` **outside** the exported `NotationEditorState` shape used on the wire — e.g. parallel ref on the editor composable, or a field that `buildExportState` / API serializers always strip:

```ts
pendingShapes: ExportedNodeShape[] // empty when nothing to persist
```

`normalizeImportedState` (wrapper-aware):

1. If `raw` has `format` + `state`, read `shapes` from **`raw.shapes`** (not from `raw.state`).
2. Otherwise treat legacy bare state as today; `shapes = []`.
3. Keep component `customShapeId` / `customOutline` as in the file (ids still refer to pending/source ids).
4. Strip `documentFileId` from each pending shape’s attrs.
5. Do **not** call `/node-shapes` during import.
6. Existing behavior preserved: import replaces editor contents but keeps current `notationId` / `ownerId` (import into the open notation session).

### Save order

Hook: `saveChanges` in `useNotationEditor.ts`, **after** type resolution and **before** `saveComponents`.

1. If `pendingShapes` is empty, run Fallback synthesis from components (only when there are unresolved custom shape refs — see below); if still empty, skip shape steps.
2. Load owner’s existing shape names (paged fetch or dedicated lookup) for conflict checks. Match **case-insensitive**. Within the batch, also reserve names already assigned.
3. For each pending shape: pick `Name`, else `Name (2)`, `Name (3)`, … → `POST /node-shapes` → `oldShapeId → newShapeId`.
4. For every component: if `diagramStyle.customShapeId` is in the map, set it to the new id (outline snapshot stays).
5. Proceed with existing save (components, relations, rules).
6. Clear `pendingShapes`. Subsequent Saves must **not** recreate shapes.
7. Refresh node-shapes list used by style panels (or otherwise ensure new ids appear in the select without remounting the page).

**Unresolved ref:** `nodeShape === 'custom'` or `compositeShapeType === 'custom'` with a `customShapeId` that is not yet known to exist in the target catalog (pending or already remapped this session).

### Failure handling

If any shape create fails, abort Save with a clear i18n error. Best effort: `DELETE` shapes created earlier in the same Save attempt. Do not call `saveComponents` until all pending shapes succeed (or the shape step was a no-op).

## Server `POST /notations/import`

### Request

Add optional:

```kotlin
shapes: List<ImportedNodeShape> = emptyList()
// id: String, name: String, outline: String?, contentArea: String?, attrs: String?
```

Add repository helper as needed, e.g. `findByOwnerAndNameIgnoreCase` (or equivalent in-memory scan of owner shapes), since none exists today.

### Behavior

Inside the existing `@Transactional` import:

1. Resolve effective shape list: request `shapes` plus Fallback synthesis from component attrs for any referenced id still missing.
2. Create all shapes for `owner` (never reuse by name). Apply `Name` / `Name (2)` case-insensitive against existing owner shapes and names in this import batch. Strip `documentFileId` from attrs.
3. Build `shapeIdMap: Map<String, UUID>` (request/synthetic id → new UUID).
4. Existing nodeType / linkType reuse-by-name logic unchanged.
5. Before persisting each component: parse `attrs` JSON (string → object), if `diagramStyle.customShapeId` is in `shapeIdMap` replace it, write attrs back to string. Invalid/non-JSON attrs: leave unchanged (do not fail the whole import solely for that).
6. Persist components, relations, relation rules as today.

### Response

Add `shapeIdMap: Map<String, UUID>` alongside existing id maps.

### Client API helper

Update `importNotationViaApi` / DTOs to send `shapes` and accept `shapeIdMap`. The editor file-picker path remains state-then-Save; the API path remains the atomic package import.

## Fallback (v1 and incomplete packages)

Apply when `shapes` is missing/empty **or** some component `customShapeId` values are not present in `shapes`:

- Prefer group by `customShapeId`; if id absent, group by stable outline fingerprint (`JSON.stringify(customOutline)`).
- Require non-empty `customOutline` to create a shape.
- Default stored name: `"Imported shape"` (+ conflict suffixes). UI error strings use i18n; the catalog name may stay this English default unless product later localizes stored names.
- Remap `customShapeId` to the newly created ids.

If there is neither a `shapes[]` entry nor outline, leave the component as-is (render may degrade when custom shape cannot be drawn).

## Testing

**warchi**

- Export includes only used shapes; unused catalog shapes omitted.
- Export resolves shapes via per-id fetch (works even when shape is beyond first list page / shared viewable shape).
- Export synthesizes entry when catalog fetch fails but `customOutline` exists.
- Import v2 keeps pending shapes; Save creates shapes before components, remaps ids; select lists new shapes after Save.
- Second Save does not recreate shapes.
- Name conflict produces `Name (2)` (case-insensitive).
- Import v1 without `shapes[]` still creates shapes from `customOutline` on Save.
- Partial `shapes[]` + extra component refs → merge package + synthesis.

**arepos-server**

- Import with `shapes` creates `node_shapes` and remaps component attrs JSON.
- Name conflict suffixes (case-insensitive).
- Fallback when `shapes` empty but attrs contain outline + stale id.
- Transaction rolls back on mid-import failure.
- Shared-source semantics: importer owns new rows; no share rows copied.

## Out of scope

- Changing how built-in shapes (`rectangle`, `diamond`, …) work.
- Transferring ownership/shares of the source shape; publishing shapes across users.
- Migrating historical **model diagram** instance style overrides beyond what notation component attrs already carry.
- Wiring the editor Import button to `POST /notations/import` (optional follow-up; API must still accept the full package).
- DB unique constraint on `(owner, name)` for shapes.
- Changing site Downloads validation beyond accepting v2 (already format-only).

## Success criteria

1. Export a notation that uses custom shapes → JSON contains those shapes (including when the shape is not on the first catalog page).
2. Import on another instance (or clean catalog) → Save (or API import) creates catalog entries owned by the importer.
3. Shape select lists the imported shapes after Save; a new component can pick the same shape.
4. Existing v1 export files still import with usable shapes when outline snapshots are present.
5. Re-save after a successful import does not duplicate shapes.

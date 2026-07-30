# Model package import/export — Design Spec

Date: 2026-07-28  
Status: approved (pending implementation plan)  
Repos: warchi, arepos-server  
Related:

- arepos-server: `NotationImportService`, `NotationImportDtos`, `ModelBatchSaveService`, `Files` / MinIO, `DocumentRefs`
- warchi: `useNotationExport.ts`, `useNotationImportApi.ts`, `ModelsCatalog.vue`, `ModelEditor.vue` / header toolbar
- Existing OEF import remains a separate ArchiMate path; this feature is a native wArchi package

## Goal

Export a model as a self-contained ZIP package that includes used notations (with types, components, relations, rules, shapes) and referenced files, so that import on another environment or account recreates types, shapes, notations, model graph, diagrams, and document attachments as a **new** model owned by the importer.

## Problem summary

Today:

- Notations have JSON export/import (including shapes via `POST /notations/import`).
- Models have OEF (ArchiMate) import and diagram image export only.
- There is no native way to move a full model with its notation stack and files between instances or users.

## Decisions

| Topic | Choice |
|-------|--------|
| Scenarios | Universal package: env transfer, backup, share with colleagues |
| Import target | Always create a **new** model (no merge into existing) |
| Catalog conflicts | Delegate to `NotationImportService`: reuse node/link **types** by owner+name; always create new **shapes** (unique names); create notation; **409** if notation `name+version` exists |
| Model conflicts | **409** if model `name+version` already exists; full rollback |
| Processing | Server-side atomic endpoints (ZIP in / ZIP out) |
| Files / wiki | Included in v1: blobs, full `file_versions` history, `document_refs`, and `mdfile://` links inside markdown |
| Diagram preview SVG | **Not** in package (`diagrams/{id}/preview.svg` in MinIO). Regenerated on save / when creating a share link from the open editor |
| Package format | ZIP (`manifest.json`, `model.json`, `notations/*.json`, `document-refs.json`, `files/*`) |
| Notation scope | Only notations referenced by the model's **diagrams** |
| Orphan type refs | Export **400** if any non-deleted node/link references a nodeType/linkType not present in those notations' packages (no silent drop) |
| Model UI | Export from list card **and** editor toolbar; import **only** in editor |
| Notation UI addition | Export from list card (import stays editor-only, as today) |
| Soft-deleted | Not exported |
| Missing referenced blob | Fail export (do not silently omit) |
| Shared model export | Caller needs view on model **and** view (or equivalent read) on every included notation; else **403** |
| Ownership | Importer becomes owner of new model, notations (as created), types/shapes created or reused per notation-import rules, and new files |

## Package format

```
model-package.zip
├── manifest.json
├── model.json
├── document-refs.json
├── notations/
│   └── <sourceNotationId>.json
└── files/
    └── <sourceFileId>/
        ├── meta.json
        ├── blob                    # latest content (compat)
        └── versions/
            ├── 1
            ├── 2
            └── …
```

### `manifest.json`

```json
{
  "format": "warchi-model-package",
  "version": 1,
  "exportedAt": "ISO-8601",
  "source": {
    "modelId": "uuid",
    "modelName": "string",
    "modelVersion": "string"
  },
  "notationIds": ["uuid", "..."],
  "fileIds": ["uuid", "..."]
}
```

Unknown `format` or unsupported `version` → **400**.

### `notations/<id>.json`

Payload compatible with existing notation import (`NotationImportRequest` shape): notation meta, nodeTypes, linkTypes, components, relations, relationRules, shapes. One file per included notation.

### `model.json`

Model metadata (`name`, `version`, `attrs`) plus arrays of nodes, links, diagrams as exported from DB (source UUIDs preserved inside the package for remap). Diagram `notationId` and graph FKs / attrs references use source IDs; importer remaps.

### `document-refs.json`

Array of `document_refs` rows that attach wiki files to entities in this package (model / node / diagram / and, when present, notation-side entities that are part of included notations). Source entity ids and `fileId` preserved for remap.

Example item:

```json
{
  "fileId": "uuid",
  "modelId": "uuid|null",
  "nodeId": "uuid|null",
  "diagramId": "uuid|null",
  "notationId": "uuid|null",
  "componentId": "uuid|null",
  "relationId": "uuid|null",
  "nodeTypeId": "uuid|null",
  "linkTypeId": "uuid|null"
}
```

Only refs whose `fileId` is included in `files/` and whose entity side can be remapped into the imported graph/catalog.

### `files/<id>/`

- `meta.json`: `filename`, `contentType`, optional original attrs needed to recreate `Files` / versions
- `blob`: latest file content (kept for older importers / quick read)
- `versions/<n>`: full history oldest→newest by version number (export always writes these; import prefers them when present, otherwise falls back to single `blob`). Cap: `MAX_FILE_VERSIONS` (100). `mdfile://` rewrite runs per version.

Wiki cross-links use `mdfile://<fileUuid>` (same pattern as `MdFileLinkValidator`). Blobs in the package may still contain **source** UUIDs; importer rewrites them via `fileIdMap` before/when persisting content.

### File discovery (export)

Collect the closure of file ids:

1. `documentFileId` on model / node / diagram / included notation entity attrs
2. `document_refs` for the model and its nodes/diagrams (and included notation entities)
3. All `mdfile://` UUIDs found in those file blobs (and in attrs text), recursively until fixed point

Missing blob for any id in the closure → fail export.

## API (arepos-server)

### Export

`GET /api/v1/models/{id}/package`

- Auth: authenticated; **view** on model; **read** on each notation included via diagrams
- Response: `application/zip` with `Content-Disposition: attachment`
- Errors: 403/404 access; 503 storage; 500 if referenced file blob missing (fail closed)

### Import

`POST /api/v1/models/package`

- Body: `multipart/form-data`, field `file` = ZIP
- Auth: authenticated user (creates owned resources)
- Response **201**:

```json
{
  "modelId": "uuid",
  "modelName": "string",
  "modelVersion": "string",
  "notationIdMap": { "<sourceId>": "<newId>" },
  "nodeTypeIdMap": { "<sourceId>": "<newId>" },
  "linkTypeIdMap": { "<sourceId>": "<newId>" },
  "fileIdMap": { "<sourceId>": "<newId>" },
  "warnings": []
}
```

Id maps merge results from all imported notations (source package ids → newly created or reused ids).

- Errors: 400 invalid package; 409 notation or model `name+version` conflict (nothing persisted); 413 over size limit; 503 storage unavailable

### Notation card export (companion)

`GET /api/v1/notations/{id}/export`

- Returns the same JSON document the notation editor already downloads (`warchi-notation-export` v2 with shapes)
- Auth: **view/read** on the notation
- Purpose: catalog card download without opening the editor

## Pipeline

### Export

1. Load model; require view.
2. Load non-deleted nodes, links, diagrams.
3. Collect unique `notationId` from diagrams; require read on each; build notation package JSON per notation (same content as notation export / `NotationImportRequest`, including shapes).
4. Validate every non-deleted node/link `nodeTypeId` / `linkTypeId` is covered by the collected notation packages; otherwise **400** with the missing type ids.
5. Collect file id closure (`documentFileId`, `document_refs`, recursive `mdfile://` in blobs/attrs); download blobs; missing blob → fail export.
6. Serialize `document-refs.json` for refs in scope.
7. Build ZIP and stream response.

### Import (single transaction for DB; storage uploads coordinated so failure rolls back DB and cleans orphan blobs where practical)

1. Validate manifest (`format`, `version`) and ZIP structure.
2. Enforce size / count limits.
3. Import each notation via `NotationImportService` (existing conflict and reuse semantics). Abort all on first 409/validation error.
4. Create files in storage + DB from `files/*` (recreate version history via `createOwnedBlob` + `appendOwnedBlobVersion` when `versions/*` present); build `fileIdMap`; rewrite `mdfile://` UUIDs inside each markdown version (and any attrs that embed them) before final persist.
5. Create model; **409** if `name+version` exists.
6. Create nodes, links, diagrams with **new** UUIDs; remap using merged maps from notation imports + `fileIdMap`:
   - `parentId`, link `source`/`target`
   - diagram `notationId`
   - node `nodeTypeId`, link `linkTypeId`
   - component / relation / instance ids inside diagram attrs
   - `documentFileId` via `fileIdMap`
7. Recreate `document_refs` from `document-refs.json` with remapped `fileId` and entity ids (skip entries that cannot be remapped; optionally list in `warnings`).
8. Return 201 payload with id maps.

Reuse / extend `MdFileLinkValidator` patterns (`mdfile://UUID`) for extract + rewrite helpers so import/export stay consistent with existing wiki link validation.

Order: notations → files → model → graph.

## Limits (v1)

- Max ZIP size: configurable, default aligned with OEF normalize (~100 MB)
- Reasonable max counts for notations, files, nodes, links, diagrams (400 on exceed)
- Soft-deleted entities excluded from export

## UI (warchi)

### Models

| Place | Export package | Import package |
|-------|----------------|----------------|
| Models catalog (create-style card) | — | Yes (creates a **new** model) |
| Catalog card menu | Yes | No |
| Editor toolbar | Yes | No |

Import flow: file picker on models catalog → `POST /models/package` → navigate to new model editor. Show clear message on 409 (model or notation already exists). Single-request progress (“Importing…”).

### Notations

| Place | Export | Import |
|-------|--------|--------|
| Catalog card menu | Yes (new) | No |
| Editor toolbar | Yes (existing) | Yes (existing) |

### Docs / i18n

- Short sections in in-app `/docs/models` and `/docs/notations` (ru + en messages)
- Toolbar/card labels for export/import package

## Testing

### arepos-server

- Round-trip: model + one notation (with shape) + wiki file ref + diagram → export → import as another user (or same) → graph and wiki usable
- Wiki: `document_refs` recreated; `mdfile://` between two pages remapped and still resolve
- 409 when target already has notation `name+version`
- 409 when target already has model `name+version`
- Remap coverage: parent hierarchy, link endpoints, notationId on diagram, documentFileId, mdfile links
- Export 403 when model viewable but notation not readable
- Invalid ZIP / wrong format → 400
- Export 400 when model type refs fall outside included notation packages

### warchi

- API client helpers + composable smoke with mocks
- Catalog card actions wire to download endpoints
- Editor import navigates to created `modelId`

## Out of scope (v1)

- Merge / import into an existing model
- Partial or resumable multi-phase import
- Changing OEF ArchiMate import behavior
- Transferring resource shares / original ownership
- Client-side assembly of model packages as the primary path
- Diagram preview SVG (`PUT /diagrams/{id}/svg` / MinIO `preview.svg`) and public share-link tokens — previews are re-uploaded from the editor when needed

## Components (implementation sketch)

| Unit | Responsibility |
|------|----------------|
| `ModelPackageExportService` | Assemble ZIP from model id |
| `ModelPackageImportService` | Parse ZIP, orchestrate notation import, files, model graph, remap |
| `ModelPackageController` | GET/POST endpoints |
| Notation export endpoint | Card download for notations |
| warchi `useModelPackage` | download / upload helpers |
| Catalog + editor UI | entry points above |

## Open follow-ups (not blocking v1)

- Orphan blob cleanup job if import fails after MinIO put but before commit
- Streaming ZIP for very large models beyond default limit (raise limit separately)

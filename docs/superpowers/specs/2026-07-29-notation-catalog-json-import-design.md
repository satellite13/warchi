# Notation catalog JSON import — Design Spec

Date: 2026-07-29  
Status: approved (pending implementation plan)  
Repos: warchi, arepos-server  
Related:

- arepos-server: `NotationExportController` (`GET /notations/{id}/export`), `NotationPackageAssembler.toClientExportDocument`, `NotationImportService`, `NotationImportDtos`
- warchi: `NotationsCatalog.vue`, `ModelsCatalog.vue` (UX reference), `useNotationExport.ts` (editor export v2), editor merge-import (out of scope)
- Related specs: `2026-07-28-model-package-import-export-design.md`, `2026-07-23-notation-export-shapes-design.md`

## Goal

On the notations catalog board, add an import CreateCard like models have for packages, but accept the **same JSON** that notation export produces (`warchi-notation-export` v2). Import always creates a **new** notation for the current user; name+version conflict → **409**.

## Problem summary

Today:

- Catalog and editor **export** notation as JSON `format=warchi-notation-export`, `version=2`.
- Catalog has export on cards but **no** import CreateCard.
- Server `POST /notations/import` expects a flatter `NotationImportRequest` (used by model package and some clients), not the v2 export document.
- Editor import merges a JSON file into the **open** notation (local UX); that path stays unchanged.

Result: a file downloaded from catalog export cannot be round-tripped via a catalog import button without format conversion.

## Decisions

| Topic | Choice |
|-------|--------|
| File format | **Identical** to export: `warchi-notation-export` v2 JSON (not ZIP) |
| Import target | Always create a **new** notation (no merge into existing) |
| Name+version conflict | **409** (same as current `NotationImportService`) |
| Types reuse | Keep existing import rules: reuse node/link types by owner+name when present; create otherwise |
| Shapes | Keep existing import rules: create new shapes with unique names |
| Auth | Authenticated caller becomes owner; no edit permission on a target notation (create-only) |
| Catalog UX | CreateCard next to «Create», file picker `.json` / `application/json`, status/error messages, navigate to new notation editor on success |
| Editor merge-import | **Out of scope** (unchanged) |
| Model package ZIP | **Out of scope** (still embeds flat `NotationImportRequest` JSON inside ZIP) |

## Export / import document (v2)

Canonical shape (catalog export and editor export already align):

```json
{
  "format": "warchi-notation-export",
  "version": 2,
  "exportedAt": "<iso8601>",
  "notation": { "id": "...", "name": "...", "version": "..." },
  "state": {
    "notationId": "...",
    "ownerId": "...",
    "nodeTypes": [ /* id, name, parsedAttrs, ... */ ],
    "linkTypes": [ /* ... */ ],
    "components": [ /* id, name, nodeTypeId, version, parsedAttrs, ... */ ],
    "relations": [ /* id, name, linkTypeId, version, parsedAttrs, ... */ ],
    "relationRules": [ /* fromComponentId, toComponentId, allowedRelationIds */ ],
    "diagramLayer": { "version": 1, "nodes": [], "edges": [] }
  },
  "shapes": [ /* id, name, outline, contentArea, attrs */ ]
}
```

Import accepts this document and maps it onto the existing create path (equivalent to today's `NotationImportRequest` + notation attrs carrying `diagramLayer` when present).

## API

### Preferred: extend create-import to accept v2

`POST /api/v1/notations/import`

- Content-Type: `application/json`
- Body: either
  - **v2 export document** (`format=warchi-notation-export`, `version=2`), or
  - legacy flat `NotationImportRequest` (backward compatible for model package / existing clients)
- Success: **201** + `NotationImportResponse` (`notationId`, id maps)
- Conflict: **409** when notation `name`+`version` already exists
- Bad request: **400** for unknown format, unsupported version, or invalid structure

Server responsibility:

1. Detect payload kind (`format` field vs flat `notation`+`nodeTypes` without wrapper).
2. For v2: map `state.*` + top-level `shapes` + `notation` meta into `NotationImportRequest`; serialize `parsedAttrs` objects back to attrs JSON strings; put `state.diagramLayer` into notation attrs as needed.
3. Call existing `NotationImportService.import(...)`.

Alternatively (acceptable if cleaner): dedicated `POST /api/v1/notations/import-export` that only accepts v2 and delegates to the same mapper + service. Prefer a single endpoint with dual accept if validation stays clear.

## Frontend (warchi)

`NotationsCatalog.vue` (mirror `ModelsCatalog.vue`):

- `can-import-package` CreateCard (label/description for notation JSON import)
- Hidden `<input type="file" accept=".json,application/json">`
- On select: read text → `JSON.parse` → `POST /notations/import` with the raw document (or typed client helper)
- Errors: 409 → conflict message; 400 → bad file; other → generic with server message
- Success → `router.push` to notation editor for returned `notationId`
- i18n: `ru` / `en` keys under `notations.*` (description, importing, conflict, bad request, error)

No change required to catalog **export** card flow (`downloadNotationExport`).

## Non-goals

- ZIP notation packages
- Import into / overwrite an existing notation from the catalog
- Auto-bump version on conflict
- Changing editor-local merge import UX
- Changing model package ZIP internals

## Test plan

- arepos: unit/controller — v2 document round-trip (export assembler → import) creates notation; 409 on duplicate name+version; reject bad `format`/`version`; legacy flat body still works
- warchi: catalog import helper / catalog wiring — success navigates; 409 surfaces conflict string; invalid JSON surfaces bad-request string

## Success criteria

1. File from catalog or editor notation export can be imported from the notations board CreateCard.
2. Import creates a new notation owned by the importer.
3. Duplicate name+version returns 409 and does not partially create data.
4. Existing flat `POST /notations/import` clients and model package import remain unbroken.

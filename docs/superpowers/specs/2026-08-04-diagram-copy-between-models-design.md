# Copy diagram between models — Design Spec

Date: 2026-08-04  
Status: approved (pending implementation plan)  
Repos: warchi, arepos-server  
Related:

- arepos-server: `ModelCopyService`, `DiagramAttrsRemapper`, `ModelBatchSaveService`, diagram/notation access checks
- warchi: diagram notation migration (`migrateDiagramNotation`, `useDiagramNotationMigration`), model package import/export, `modelAttrs` / diagram instances
- Out of scope sibling flows: full model copy, model package (new model), OEF import, diagram move

## Goal

Copy a single diagram version from a source model into an **existing** target model, with interactive matching of model nodes/links, user-selected target notation, and an atomic server-side commit. The source model and diagram remain unchanged.

## Problem summary

Today:

- A diagram belongs to one model (`model` FK) and one notation (`notation` FK).
- Canvas content in `diagrams.attrs` references model entities via `modelNodeId` / `modelLinkId`.
- Existing transfers either copy an **entire** model (`POST …/models/{id}/copy`), import a **new** model (model package), or import into a model via OEF — none copy one diagram into another existing model with element reconciliation.

## Decisions

| Topic | Choice |
|-------|--------|
| Operation | **Copy** only (not move) |
| Target | Existing model with edit permission only (no “create model” in wizard) |
| Element strategy | Match existing in target; unresolved handled in wizard |
| Auto-match order | `stableId`, else exact `name` + same `nodeTypeId` / `linkTypeId` |
| Ambiguous match (>1 candidate) | No auto-match; list candidates for manual choice |
| Unmatched actions | `match` / `create` / `skip` |
| Edges integrity | Finish/commit blocked until every copied edge has both ends `match` or `create` |
| Notation | User selects `targetNotationId`; component/relation bindings remapped by **name** |
| Unbound notation bindings after remap | Warning in preview; do not hard-fail commit |
| API shape | Separate `preview` + `commit` endpoints (not a single `dryRun` flag) |
| Processing | Server owns match, validation, attrs remap, transactional commit |
| Diagram versions | Copy the **selected** diagram version only (typically latest); not the full baseline chain |
| Parent folders on `create` | v1: place created nodes in target root or user-chosen folder — do not recreate source parent tree |
| Documents / `documentFileId` / `mdfile://` | v1: do not copy files; strip `documentFileId` from copied attrs and warn in preview |
| Source locks | Not required (read-only copy) |
| Ownership | Created nodes/links/diagram owned per normal target-model create rules |

## Architecture

```
warchi wizard                    arepos-server
─────────────                    ─────────────
Pick target model/notation  →
                         POST …/diagram-copies/preview
Resolve unmatched / review  ←  matches, unresolved, blockers, warnings
                         POST …/diagram-copies/commit
Open new diagram in target  ←  created diagram (+ created entities)
```

- **arepos-server**: matching, authz, notation remap, transactional create, diagram attrs remap (reuse patterns from `ModelCopyService` / `DiagramAttrsRemapper`).
- **warchi**: multi-step wizard, resolution map, i18n, navigation after success.
- Papirus is unchanged (render-only).

## API

Base path (names indicative):

```
POST /api/v1/models/{targetModelId}/diagram-copies/preview
POST /api/v1/models/{targetModelId}/diagram-copies/commit
```

### Authz

| Check | Required |
|-------|----------|
| Source diagram / model | view |
| Target model | edit |
| `targetNotationId` | same rules as creating a diagram on the target (`requireCanReferenceNotationForModelDiagram` or equivalent) |
| Types used in `create` | must be creatable/referenceable as in normal node/link create; else preview error / commit 400 |

### Preview request (core)

- `sourceDiagramId`
- `targetNotationId`
- Optional partial `resolutions[]` so the UI can re-preview after user edits

### Preview response (core)

- Auto-matched nodes/links (reason: `stableId` | `nameAndType`)
- Unresolved items with candidate lists (for ambiguous or manual pick)
- Notation remap report (mapped / unbound components & relations)
- **Blockers**: edges whose endpoints are not yet `match`/`create`
- Warnings: diagram name/version collision hint, skipped documents, create-type problems, etc.

### Commit request (core)

- Same identity fields as preview
- Full `resolutions[]` for every source node/link that appears on the diagram:
  - `{ sourceId, action: "match", targetId }`
  - `{ sourceId, action: "create" }`
  - `{ sourceId, action: "skip" }`
- New diagram `name`, `version` (default policy: source name + suggest free version)
- Optional target folder `nodeId` for the new diagram row

### Commit behavior

Single DB transaction:

1. Validate authz + resolutions + edge endpoint rules  
2. Create nodes/links marked `create` (reuse source `stableId` if free in target; otherwise assign a new `stableId`)  
3. Remap diagram `attrs` (`modelNodeId` / `modelLinkId`, instance ids as needed, notation bindings toward `targetNotationId`)  
4. Create diagram row on target model  
5. Rollback entirely on any failure  

Source model/diagram are never mutated.

### Error mapping

| Situation | HTTP |
|-----------|------|
| Source missing / no view | 404 / 403 |
| Target no edit | 403 |
| Notation not referenceable | 400 / 403 |
| Incomplete resolutions / edge with `skip` end | 400 + blocker details |
| Diagram `(name, version)` unique conflict | 409 |
| Partial failure mid-commit | rollback; 5xx or mapped 400 |

## Matching and resolution rules

### Auto-match

For each distinct `modelNodeId` / `modelLinkId` referenced by the source diagram instances:

1. Exact `stableId` among non-deleted entities in the target model  
2. Else exact `name` + same type id  
3. If multiple candidates → unresolved with candidates (no silent pick)  
4. If zero → unresolved  

### Resolution actions

| Action | Meaning |
|--------|---------|
| `match` | Bind diagram instances to existing target entity id |
| `create` | Insert a copy into the target model; wire new id into attrs |
| `skip` | Do not create entity; do not keep bound instance for that model id |

### Integrity

- Every edge being copied must have both endpoints resolved with `match` or `create`.  
- `skip` is allowed only for nodes/links that are **not** endpoints of any copied edge.  
- On `create` link, both endpoint nodes must already resolve within the same commit (match or create).  
- Diagram-only instances (`__diagram-note__:`, containers, edge anchors, etc.) copy with new instance ids and no model-entity resolution.  
- Notation component/relation ids on instances remap by **name** from source notation to `targetNotationId`. Unmapped bindings → preview warning; instance still copied.

### Create payload (v1)

- Copy scalar fields and attrs needed for editor fidelity (name, type, attrs with notation key remap).  
- Parent placement: target root or wizard-selected folder — **no** automatic source ancestor recreation.  
- Do not copy document blobs in v1.

## Wizard UX (warchi)

Entry: action on a diagram in the model tree/editor — “Copy diagram to another model”. Requires view on source; target list = models the user can edit.

Steps:

1. **Target** — model, notation, diagram name/version, optional folder  
2. **Elements** — review auto-matches; resolve yellow (ambiguous) and red (missing); edge blocker summary  
3. **Notation report** — mapped vs unbound bindings  
4. **Confirm** — counts (match / create / skip) → commit  

Behavior:

- Changing target model or notation resets resolutions and triggers a fresh preview.  
- Finish disabled while edge blockers remain.  
- On success: toast + navigate to the new diagram in the target model.  
- On commit error: keep wizard open and show server message.

## Testing

### Backend

- Preview match by `stableId`; fallback name+type; ambiguity → unresolved  
- Preview edge blockers when an endpoint is unresolved/`skip`  
- Commit match-only path remaps attrs correctly; source untouched  
- Commit creates nodes+links+diagram atomically  
- Commit 400 when an edge end is `skip`  
- Notation remap by name; unbound is warning-only  
- Authz matrix: no edit target / no view source / bad notation  

### Frontend

- Finish disabled while blockers present  
- Target change refreshes preview  
- Matched / unresolved / notation warnings rendered  
- Successful commit navigates to target diagram  
- i18n `ru` + `en` for wizard copy  

## Out of scope (v1 backlog)

- Move diagram (delete/detach from source)  
- Create new target model from the wizard  
- Copy document files / `documentFileId` / full `mdfile://` fidelity  
- Recreate source parent folder hierarchy on `create`  
- Copy entire diagram baseline version chain  
- Client-only commit via `batch-save` without server preview/commit  
- Mini model-package export of a single diagram slice  

## Success criteria

- User can copy a diagram into another existing model they can edit.  
- Matched entities reuse target nodes/links; missing ones can be created or matched manually.  
- Commit never leaves a half-applied graph (transactional).  
- Source model remains unchanged.  
- Notation choice is explicit; bindings remapped by name with visible warnings for gaps.

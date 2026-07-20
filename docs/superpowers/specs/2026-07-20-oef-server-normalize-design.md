# OEF server normalize + chunked apply — Design Spec

Date: 2026-07-20  
Status: approved  
Repos: warchi, arepos-server

## Goal

Enable importing large Open Exchange (OEF XML) models into an existing wArchi model without nginx **413 Request Entity Too Large** on batch-save, while keeping the client mapping wizard unchanged.

Observed failure: after client parse + mapping, a single `POST /models/{id}/batch-save` JSON body exceeds nginx `client_max_body_size` (~25 MB).

## Decisions

| Topic | Choice |
|-------|--------|
| Mapping UX | Stay on client (wizard steps analyze → mapping → preview → import) |
| XML parsing for large files | Server-side normalize endpoint |
| Apply path | Client builds create-only batch payloads, sends **chunked** batch-save |
| Intermediate format | Compact JSON matching current `OefParsedModel` shape |
| Full async import job | Out of scope (v1) |
| Client DOMParser | Prefer always-normalize via API in v1; optional tiny-file local fallback later |
| Partial failure | Stop on first failed chunk; report how far import got; no auto-rollback of prior chunks |

## Problem summary

Current pipeline is fully client-side:

```
OEF XML → file.text() + DOMParser → OefParsedModel → ImportDraft
       → mapping UI → one BatchSaveRequest → POST batch-save
```

Hard limits that block large models:

| Limit | Source | Impact |
|-------|--------|--------|
| ~25 MB HTTP body | nginx `client_max_body_size` | 413 on large batch-save |
| ≤1000 creates per entity collection | `BatchSaveDtos` `@Size(max = 1000)` | 400 if more nodes/links/diagrams |
| attrs ≤ 100 000 chars per entity | same DTOs | especially diagram `attrs.instances` |
| Browser memory | XML string + DOM + draft + payload | secondary for very large XML |

OEF fields already discarded by the client parser (styles, organizations, properties, bendpoints, documentation) must stay discarded on the server.

## Architecture

```
Browser                          arepos-server
───────                          ─────────────
Select OEF XML
  │
  ├─ POST multipart ───────────► POST /api/v1/models/{modelId}/oef/normalize
  │                                 parse XML → OefNormalizedModel
  │◄──────── JSON ───────────────  (+ validation issues)
  │
  Wizard: draft + mapping + preview (existing logic on normalized JSON)
  │
  buildOefBatchSaveRequest
  │
  chunk planner ──► batch-save #1 (nodes)
                 ─► batch-save #2… (nodes)
                 ─► batch-save #N (links, after tempId remap)
                 ─► batch-save per diagram (or attrs-safe splits)
  │
  reload model + import report
```

### Components

**arepos-server**

- `OefNormalizeController` — multipart upload, authz `EDIT` on model
- `OefParseService` — Kotlin port of warchi `oefParser.ts` / `oefImportValidation.ts` (subset)
- DTOs: `OefNormalizedModel` (aligned with frontend `OefParsedModel` + `ImportIssue[]`)

**warchi**

- Wizard step 1: upload file to normalize API instead of `parseOefXml(file.text())`
- Keep `buildImportDraft`, mapping, preview
- New `chunkOefBatchSave` / apply loop in `useOefImport`
- Temp-id → real-id map accumulated across node/link chunks

## API

### `POST /api/v1/models/{modelId}/oef/normalize`

| Item | Detail |
|------|--------|
| Auth | Cookie/Bearer session; user must `EDIT` the model |
| Content-Type | `multipart/form-data` |
| Field | `file` — OEF XML (`.xml`, `text/xml`, `application/xml`) |
| Success | `200` + `OefNormalizeResponse` |
| Errors | `400` invalid/missing model root; `403` no edit; `404` model; `413` over size; `503` authz unavailable |

**Response shape (conceptual):**

```json
{
  "model": { "id": "…", "name": "…" },
  "elements": [{ "id": "…", "type": "BusinessActor", "name": "…" }],
  "relationships": [{
    "id": "…",
    "type": "Association",
    "sourceElementId": "…",
    "targetElementId": "…"
  }],
  "views": [{
    "id": "…",
    "type": "…",
    "name": "…",
    "nodes": [{ "id", "elementId", "type", "x", "y", "width?", "height?", "labelText?" }],
    "connections": [{ "id", "relationshipId", "sourceNodeId", "targetNodeId", "type" }]
  }],
  "issues": [{ "code", "level", "message", "entityId?", "viewId?" }]
}
```

Semantics must match current client validation (`relationshipEndpointIsRelationship` → warning diagram-only, missing refs → errors, etc.). If `issues` contain `level: error`, wizard blocks progression as today.

### Size limits (normalize upload)

| Layer | Target for normalize |
|-------|----------------------|
| nginx | Dedicated `location` matching `/api/v1/models/*/oef/normalize` with `client_max_body_size 100m` |
| Spring multipart | Raise `max-file-size` / `max-request-size` enough for that path, or use a request-scoped override if available; document chosen approach |
| General `/api/` batch-save | Keep ~25 MB; chunking keeps each request under limit |

Do **not** silently rely on raising the global 25 MB for all API traffic.

## Normalized content (subset)

Include only what wArchi import uses today:

- Model id/name
- Elements: id, xsi:type, name
- Relationships: id, xsi:type, source, target
- Views: id, type, name; nodes (incl. Label/Note/Container + label text); connections (incl. Line / edge-to-edge)

Explicitly omit: organizations, properties, documentation, style colors, bendpoints, profiles, unused metadata.

## Chunked apply

### Chunk planner rules (v1)

Constants (tunable):

- `NODE_CHUNK = 800`
- `LINK_CHUNK = 800`
- `DIAGRAMS_PER_REQUEST = 1`
- Soft guard: if a single diagram `attrs` JSON length approaches 90 000, split diagram instances across follow-up updates (v1.1 if needed; measure on real 413 file first)

Order:

1. Create node chunks (create-only). After each successful chunk, map `tempId` → server `id`.
2. Rewrite link source/target temp ids; create link chunks.
3. Rewrite diagram instance refs; create diagrams one-by-one.

Each chunk uses existing `POST /api/v1/models/{id}/batch-save` (no new apply API in v1).

### Failure behavior

- On chunk failure: stop; surface message including chunk kind and counts already created.
- No transactional spanning of all chunks (batch-save is per-request transactional).
- User may delete partial data manually or import into a fresh model version; auto-cleanup is out of scope for v1.

### Progress UX

Reuse/extend import busy state: show progress text (`nodes 2/5`, `links…`, `diagram X`) in wizard footer / save progress area.

## Frontend wizard changes

1. **Analyze**: `FormData` + normalize API → set parsed model / issues / draft from response.
2. **Mapping / preview**: unchanged contracts on `ImportDraft`.
3. **Import**: chunked apply instead of single `batchSave`.
4. **Report**: aggregate created counts + warnings across chunks.

Keep existing grouping of validation warnings in the wizard UI.

## Security

- Normalize requires model edit permission (same as batch-save).
- CSRF on multipart POST (existing cookie session rules).
- Do not store uploaded XML long-term in v1 (parse in memory / temp and discard). Streaming parse preferred if memory becomes an issue; acceptable to load into memory for v1 with clear size cap.
- Validate content is XML; reject non-XML early.

## Testing

**arepos-server**

- Parser unit/integration tests from existing OEF fixtures (container/assoc, notes, rel→rel).
- Controller test: edit allowed / denied; invalid XML → 400.
- Size: reject over configured max with 413 or Spring multipart error mapped cleanly.

**warchi**

- Chunk planner unit tests: N nodes → expected chunk count; tempId remapping across chunks.
- Wizard/integration: mock normalize + sequenced batch-save.

**Manual**

- Reproduce former 413 model end-to-end on local k8s after deploy.

## Rollout

1. arepos-server: normalize API + nginx/Spring size for that location (warchi proxy config).
2. warchi: wire wizard to normalize + chunked apply.
3. Docs: update in-app models help (import section).
4. Feature branch name suggestion: `feat/oef-server-normalize` in warchi + arepos-server.

## Out of scope (v1)

- Server-side mapping or full import job with resume
- Importing OEF styles / organizations / properties
- Raising global batch-save body limit as the primary fix
- Automatic rollback of successful early chunks
- Storing normalized artifacts in MinIO

## Open points (resolve during implementation if needed)

1. Exact Spring mechanism for per-endpoint multipart limit vs global raise to 100 MB.
2. Whether diagram attrs soft-split is required for the user’s file after node/link chunking alone (measure first).
3. Gzip of batch-save JSON: optional later; chunking is the primary fix.

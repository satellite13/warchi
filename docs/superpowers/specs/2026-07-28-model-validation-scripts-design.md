# Model validation scripts — Design Spec

Date: 2026-07-28  
Status: approved (implemented on feat/model-validation-scripts)  
Repos: warchi, arepos-server  
Related:

- arepos-server: `ResourceShares` / `ShareResourceType`, Cerbos policies, catalog CRUD patterns (models/notations/types)
- warchi: `ModelEditor.vue`, model snapshot loaders, `ShareAccessModal.vue`, diagram canvas selection
- Future (out of scope v1): mutate scripts, server-side runner / CI

## Goal

Give users shareable JavaScript validation scripts that run in the browser against a model (and optionally the currently open diagram), using a sandboxed iframe (opaque origin) with a dedicated CSP that allows `unsafe-eval` only there, a read-only API library, and produce a structured issues report (errors / warnings / info) without modifying the model.

## Problem summary

Today:

- Model quality checks are manual or buried in import wizards (e.g. OEF relation-rule checks).
- There is no way to encode reusable policies such as “deployment diagram must contain components of types X/Y with link type R” or “no duplicate links between node types A and B”.
- Sharing such checks across users/models is not supported.

## Decisions

| Topic | Choice |
|-------|--------|
| v1 purpose | Validation only (report); no create/update/delete of model entities |
| Language | JavaScript |
| Runtime | Sandboxed iframe (`/script-sandbox.html` + IIFE) with page-local CSP allowing `unsafe-eval`; main SPA CSP stays without `unsafe-eval` (Workers inherit the page CSP and cannot eval user scripts) |
| Storage | Separate catalog entity on server (`ValidationScript`) |
| Sharing | Existing `resource_shares` + Cerbos; `VIEW` / `EDIT` |
| Who may run | `view(script) ∧ view(model)` — client-side gate; no server execute endpoint in v1 |
| Sandbox data | Full read package: model graph + diagram contents + notations used by diagrams (components, relations, relation rules) + node/link types |
| Run context | Always pass full model; `ctx.diagram` = currently open diagram or `null`; script decides scope (no hard `scope` metadata) |
| Versioning | No semver on scripts in v1 (single `source` per entity) |
| UI entry | Catalog `/validation-scripts` + Run from Model Editor |
| Script editor UX | Syntax highlighting + code completion for sandbox API (not bare textarea) |
| Editor engine | CodeMirror 6 + `@codemirror/lang-javascript` + custom completion source for `ctx` / `report` / helpers |
| Apply / mutate | Out of scope v1 |

## Example scenarios (drive the API)

### 1. Deployment diagram checklist

User opens a deployment diagram and runs a script that verifies required notation component types are present on the diagram and that required link types exist between them.

Needs: open diagram contents, model nodes/links on that diagram, notation components ↔ node types, relations / rules (or hardcoded type ids in script).

### 2. Duplicate links between types

Script scans the whole model for duplicate links (same endpoints, optionally same link type) between nodes of given types.

Needs: all nodes + `nodeTypeId`, all links + endpoints / `linkTypeId`, type names for messages. Diagrams optional.

## Server: entity and API

### Entity `ValidationScript`

| Field | Type | Notes |
|-------|------|--------|
| `id` | UUID | PK |
| `name` | string | Unique per owner (same catalog convention as types without version) |
| `description` | string? | Optional |
| `source` | text | JS source |
| `owner` | FK → users | |
| `createdAt` / `updatedAt` | instant | |
| `attrs` | jsonb? | Reserved; unused in v1 |

Hard delete in v1 (no soft-delete flag).

### Sharing

- Add `ShareResourceType.VALIDATION_SCRIPT`
- Map to a Cerbos resource kind; actions `view` / `edit` aligned with other top-level resources
- Reuse `AccessSharesController` / `ShareAccessModal` with the new resource type

### REST

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/api/v1/validation-scripts` | List visible to caller (owner + shares) |
| `POST` | `/api/v1/validation-scripts` | Authenticated create (caller = owner) |
| `GET` | `/api/v1/validation-scripts/{id}` | VIEW or EDIT |
| `PUT` | `/api/v1/validation-scripts/{id}` | EDIT (or owner) |
| `DELETE` | `/api/v1/validation-scripts/{id}` | EDIT (or owner) |

No `POST .../run` in v1. Execution is entirely client-side after the client has loaded script `source` (VIEW) and model data (VIEW).

### Request/response (sketch)

```json
{
  "id": "uuid",
  "name": "Deployment checklist",
  "description": "Required apps and links on open diagram",
  "source": "// js...",
  "ownerId": "uuid",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "permission": "EDIT"
}
```

Create/Update body: `name`, `description?`, `source`. Reject empty `name` or empty `source` with **400**.

## Client: snapshot and Worker

### Snapshot builder

Host (Model Editor) builds an immutable plain JSON snapshot before run:

- **Model:** id, name, version, nodes, links, folders, diagrams (including parsed diagram element membership: which model node/link ids appear on each diagram)
- **Notations:** for every notation id referenced by the model’s diagrams — components, relations, relation rules
- **Types:** node types and link types referenced by the model (and/or by those notations), including names and property schema fields needed for messages
- **Context:** `diagramId` of the currently open diagram, or `null`

Snapshot must be structured-clone-safe (no Vue proxies, no functions). Prefer a dedicated builder module that maps editor/API entities → sandbox DTOs.

### Sandbox lifecycle

1. User picks a visible script and clicks Run.
2. Host loads script `source` if not cached; builds snapshot.
3. Host opens a hidden iframe to `/script-sandbox.html` with `sandbox="allow-scripts"` (opaque origin; no parent DOM access).
4. Sandbox page runs an **inlined** classic IIFE under a page CSP with `unsafe-inline` + `unsafe-eval` only (opaque sandbox cannot load host scripts via CSP `'self'`).
5. Host posts `{ type: 'run', requestId, source, snapshot, openDiagramId }` after `ready`.
6. Sandbox installs API bindings, evaluates `source` via `new Function`, collects issues.
7. Sandbox posts `{ type: 'done', requestId, issues, error? }`; host removes the iframe on Cancel, timeout, or completion.

### Isolation rules (v1)

- Main SPA CSP keeps `script-src 'self'` (no `unsafe-eval`)
- Sandbox iframe is opaque (`sandbox` without `allow-same-origin`) so user script cannot touch parent DOM
- Sandbox document CSP: no `connect-src` / network, `frame-ancestors 'self'`
- No `fetch` / `XMLHttpRequest` / `WebSocket` from the script API surface
- Snapshot objects treated as read-only (freeze or copy-on-expose)
- Execution timeout (default **5s**, configurable constant)
- Cap on issues count (e.g. **500**); further `report.*` calls no-op or single truncation info

### Sandbox API

Injected top-level bindings (stable names; do not nest under a second namespace in v1):

**Context**

- `ctx.model` — snapshot model
- `ctx.diagram` — diagram object for open diagram, or `null`
- `ctx.notations` — map/list of notation packages in the snapshot
- `ctx.types` — `{ nodeTypes, linkTypes }`

**Reporting**

```ts
type IssueLevel = 'error' | 'warn' | 'info'
type IssueTarget =
  | { kind: 'node' | 'link' | 'diagram' | 'folder'; id: string }
  | undefined

report.error(message: string, target?: IssueTarget): void
report.warn(message: string, target?: IssueTarget): void
report.info(message: string, target?: IssueTarget): void
```

**Helpers (minimum for scenarios 1–2)**

- `diagramNodes(diagram)` / `diagramLinks(diagram)`
- `nodesOfType(typeIdOrName)` / `linksOfType(typeIdOrName)`
- `linksBetween(a, b, options?: { linkType?: string })`
- `findDuplicateLinks(options?: { by: 'endpoints' | 'endpoints+type' })`
- `componentForNode(node)` / `relationRules(notationId)`

Script form: top-level synchronous JS statements (v1). Optional later: exported `async function main()`.

### Example sketches

**Diagram-scoped (scenario 1):**

```js
if (!ctx.diagram) {
  report.error('Open a diagram before running this script')
} else {
  const onDiagram = new Set(diagramNodes(ctx.diagram).map((n) => n.id))
  const apps = nodesOfType('Application').filter((n) => onDiagram.has(n.id))
  if (apps.length === 0) {
    report.error('No Application components on diagram', {
      kind: 'diagram',
      id: ctx.diagram.id,
    })
  }
  // … check required link types between selected nodes …
}
```

**Model-scoped (scenario 2):**

```js
for (const dup of findDuplicateLinks({ by: 'endpoints+type' })) {
  report.warn('Duplicate link', { kind: 'link', id: dup.linkIds[0] })
}
```

## UI (warchi)

### Catalog

- Route: `/validation-scripts` (list) and `/validation-scripts/:id` (editor: name, description, source, share)
- Card actions: open, share, delete (permission-aware)
- i18n: ru + en for all labels

### Script source editor (v1)

- **Syntax highlighting** for JavaScript (CodeMirror 6 language pack).
- **Code completion** focused on the sandbox surface:
  - top-level: `ctx`, `report`, helper function names
  - members: `ctx.model` / `ctx.diagram` / `ctx.notations` / `ctx.types`, `report.error|warn|info`
  - helpers with short signatures/docs in the completion detail (e.g. `findDuplicateLinks({ by })`)
- Completions come from a **versioned static API catalog** shared with the Worker runtime docs (single source of truth in warchi, e.g. `validationScriptApiCatalog.ts`) — not a full TypeScript language service.
- Read-only viewers: editor in read-only mode (highlighting on, completion optional/off).
- Out of v1 for the editor: full JS/TS language server, project-wide types, Go-to-definition into app code, linting of arbitrary JS beyond syntax.

### Model Editor

- Entry: toolbar / menu «Validation scripts» (or equivalent)
- Dialog: list scripts visible to user → Run
- While running: progress + Cancel (terminate Worker)
- Results: Issues panel — level, message, optional target
- Click issue with target:
  - `node` / `link` / `folder` → select in model tree (and on canvas if present on open diagram)
  - `diagram` → switch/open that diagram when possible

### Errors

| Situation | UX |
|-----------|-----|
| Syntax / runtime exception | Runner-level error message; keep issues emitted before throw |
| Timeout | Runner-level error; keep partial issues if any |
| Empty source | Block Run; form validation in catalog editor |
| 403 on script | Omit from list / show access error |
| Worker unsupported | Clear unsupported-browser message |

## Permissions matrix

| Action | Required |
|--------|----------|
| List/open script in catalog | VIEW or EDIT on script (or owner) |
| Edit script source | EDIT on script (or owner) |
| Share script | Same pattern as other catalog resources (owner / edit share management) |
| Run against model | VIEW on script **and** VIEW on model |
| See model data inside sandbox | Implied by model VIEW (snapshot built from editor data already loaded) |

Viewers of a model who also have VIEW on a script can run validation. Edit on the model is not required for v1 validation.

## Testing

### arepos-server

- CRUD for `ValidationScript`
- ACL: owner, VIEW share, EDIT share, deny stranger
- Share create/list/revoke for `VALIDATION_SCRIPT`
- 400 on empty name/source

### warchi

- Snapshot builder: diagram membership, notation set from diagram `notationId`s, type closure
- Helpers unit tests: `findDuplicateLinks`, `diagramNodes` / `linksBetween`, `nodesOfType` by name
- Runner tests with mock Worker (or in-process test double of the same API): success, throw, timeout, issue cap
- Golden scripts for scenario 1 (fixture diagram) and scenario 2 (duplicate links fixture)
- UI smoke: Run wiring, Cancel terminates, issue click selects target (component tests with mocks)
- API catalog: completion items cover every public sandbox binding; helper list stays in sync with Worker exports

## Out of scope (v1)

- Mutating the model from scripts (create/update/delete)
- Server-side execution, scheduled runs, CI hooks
- Script semver / copy-as-new-version
- Allowlist of scripts per model
- Separate `RUN` permission (beyond VIEW)
- iframe sandbox runtime
- Marketplace / built-in product script pack (may ship 1–2 examples in docs only)
- Autostart on save
- Full JS/TS language server / Monaco (unless CodeMirror proves insufficient — then swap engine without changing the API catalog)

## Components (implementation sketch)

| Unit | Responsibility |
|------|----------------|
| arepos `ValidationScript` entity + Liquibase | Persistence |
| `ValidationScriptsController` + repository | CRUD + list ACL |
| Cerbos + `ShareResourceType.VALIDATION_SCRIPT` | Authz |
| warchi `features/validation-scripts/` | Catalog UI + API client |
| `ValidationScriptCodeEditor.vue` | CodeMirror 6 host (highlight + completion) |
| `validationScriptApiCatalog.ts` | Completion/docs metadata for sandbox API |
| `buildValidationSnapshot.ts` | Editor state → sandbox DTO |
| `validationScriptWorker.ts` + host runner | Isolate, timeout, Cancel |
| `validationScriptApi.ts` | Helpers + `report` in worker |
| Model Editor panel/dialog | Pick script, Run, Issues |

## Open follow-ups (not blocking v1)

- Server runner for CI with the same API surface
- Mutate phase with dry-run / apply on top of batch-save
- Script versioning and packaging inside model-package export
- Parameter form UI (typed args) if scripts need more than open-diagram context
- Side panel with full sandbox API reference (beyond completion tooltips)
- Richer completion: model-specific names (node type names from a selected model) when editing from Model Editor context

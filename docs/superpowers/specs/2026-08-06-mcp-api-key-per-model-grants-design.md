# MCP API keys: per-model grants

Date: 2026-08-06  
Status: approved for planning  
Projects: `arepos-server` (source of truth), `warchi` (UI), `warchi-mcp` (docs only; agent still uses one key)

## Problem

A single MCP API key has global scopes (`models:read` / `models:write`) and an optional model allowlist. All listed models share the same rights. Giving one model read-only and another read+write requires multiple keys, which is awkward for an agent (one connection / one secret) and easy to misconfigure.

## Goals

- One API key per agent connection.
- Either unrestricted access to all models the owner can use, **or** an explicit list where each model has its own scopes.
- Write always implies read (per key in `mode=all`, per grant in `mode=grants`).
- Key never elevates beyond the owner’s Cerbos / ownership rights.
- Feature is not in production yet → clean schema rewrite is acceptable (no legacy `scopes` + `modelIds` compatibility).

## Non-goals (v1)

- Editing grants after key creation (revoke + recreate).
- Per-diagram or per-notation scopes.
- Multiple secrets behind one MCP connection.
- Changing how `warchi-mcp` authenticates (still one key → exchange → JWT).

## Data model

Replace flat `scopes` + `modelIds` with a mode discriminator.

### Create / store

```json
{
  "name": "Cursor MCP",
  "mode": "all",
  "scopes": ["models:read"],
  "grants": null,
  "expiresAt": null
}
```

or:

```json
{
  "name": "Cursor MCP",
  "mode": "grants",
  "scopes": null,
  "grants": [
    { "modelId": "<uuid>", "scopes": ["models:read"] },
    { "modelId": "<uuid>", "scopes": ["models:read", "models:write"] }
  ],
  "expiresAt": null
}
```

### Validation

| Rule | Detail |
|------|--------|
| `mode=all` | Non-empty `scopes` required; `grants` must be null/absent. |
| `mode=grants` | Non-empty `grants` required; global `scopes` unused/null. |
| Scopes | Only `models:read`, `models:write`. Unknown → 400. |
| Write ⇒ read | If write present, add read (per key or per grant). |
| Grant modelIds | Distinct UUIDs; empty grant scopes forbidden. |
| At least one scope | Key or grant must retain read and/or write after normalize. |

### Persistence (`api_keys`)

- `mode` — text/enum: `all` \| `grants`
- `scopes` — jsonb, nullable (used when `mode=all`)
- `grants` — jsonb, nullable (used when `mode=grants`): `[{ "modelId": string, "scopes": string[] }]`
- Drop / stop using `model_ids`
- Existing local/dev rows: recreate keys after deploy (no migration of grant semantics required if table can be cleared or column replaced in the same changelog)

### Exchange JWT claims

- `type=mcp_access` (unchanged)
- `mode`
- `scopes` when `mode=all`
- `grants` when `mode=grants` (same shape as storage)
- TTL unchanged (~20 minutes)

`ExchangeApiKeyResponse` mirrors these fields (no separate flat `modelIds`).

## Enforcement (arepos-server)

### Coarse (`McpScopeFilter`)

For MCP tokens only:

- Safe methods (GET/HEAD/OPTIONS) → token must have **read somewhere** (`mode=all` scopes or any grant with read).
- Mutating methods → token must have **write somewhere**.
- `/api/v1/api-keys` still forbidden for MCP tokens.

This rejects huge classes of calls early; it does **not** authorize a specific model.

### Precise (`ResourceAccessService`)

When a request is tied to a `modelId`:

1. Required MCP scope follows the existing access path: view/list → `models:read`; create/update/delete → `models:write` (aligned with today’s GET vs mutate split in `McpScopeFilter`).
2. `mode=all` → required scope ∈ key `scopes`; then existing Cerbos/ownership checks.
3. `mode=grants` → find grant for `modelId`; if missing → `403 model_not_allowed`; if required scope missing on that grant → `403 missing_scope`; then Cerbos/ownership.

List/search endpoints that return model-scoped entities:

- `mode=grants` → filter to modelIds that have `models:read` in their grant.
- `mode=all` → no model allowlist filter (same as today’s unrestricted key).

Resources without a model (e.g. notation catalog not bound to a model): unchanged from current MCP behavior under unrestricted keys. For `mode=grants`, do not grant new catalog-wide access; only allow when the code path already ties the resource to an allowed model (same spirit as today’s allowlist).

## UI (warchi)

**Profile → API keys → Create**

1. Name  
2. Area radio:
   - **All accessible models** → global Read / Write checkboxes (`mode=all`)
   - **Selected models** → pick models; each row has Read / Write (`mode=grants`)
3. Write checkbox forces Read on (disabled until write off).
4. Submit disabled if grants mode has zero models or a model with no scopes.
5. After create: show plaintext once; list shows summary e.g. `All models · read` or `3 models · mixed scopes`.
6. Post-create actions in v1: rename, revoke only.

## API surface

Management (user session + CSRF), shapes aligned with the data model:

- `POST /api/v1/api-keys` — body with `mode`, `scopes` \| `grants`
- `GET /api/v1/api-keys` — response includes `mode`, `scopes`, `grants`
- `PATCH /api/v1/api-keys/{id}` — name and/or `expiresAt` only in v1 (no `mode` / `scopes` / `grants` updates)
- `DELETE` — revoke (unchanged)
- `POST /api/v1/auth/api-keys/exchange` — returns JWT + `mode` / `scopes` / `grants`

## Docs

Update `warchi-mcp` auth docs (ru/en) and any in-app profile help strings to describe `mode` and per-model grants. Agent setup remains: one `warchi_ak_…` secret.

## Testing

- Normalize: write-only grant → stored as read+write.
- `mode=all` write key can mutate any owner-accessible model; read-only cannot.
- `mode=grants`: read-only model rejects mutate; write grant allows mutate; other model → `model_not_allowed`.
- List models under grants returns only granted (readable) models.
- Exchange JWT contains grants; filter rejects MCP token on `/api-keys`.
- UI unit/smoke: cannot uncheck read while write on; cannot submit empty grants.

## Rollout

Feature not in prod: replace schema/API in one change across arepos + warchi; recreate any local keys. No dual-read of old `model_ids`.

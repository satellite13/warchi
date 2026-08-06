# MCP API keys: per-model grants

Date: 2026-08-06  
Status: approved for planning  
Projects: `arepos-server` (source of truth), `warchi` (UI), `warchi-mcp` (docs; agent still uses one key)

## Problem

A single MCP API key has global scopes (`models:read` / `models:write`) and an optional model allowlist. All listed models share the same rights. Giving one model read-only and another read+write requires multiple keys, which is awkward for an agent (one connection / one secret) and easy to misconfigure.

## Goals

- One API key per agent connection.
- Either unrestricted access to all models the owner can use, **or** an explicit list where each model has its own scopes.
- Write always implies read (per key in `mode=all`, per grant in `mode=grants`).
- Key never elevates beyond the owner’s Cerbos / ownership rights.
- Feature is not in production yet → clean schema rewrite is acceptable (no legacy `scopes` + `modelIds` compatibility).

## Non-goals (v1)

- Editing grants after key creation by the owner (revoke + recreate).
- Admin creating or editing another user’s grants (admin may only list + revoke).
- Per-diagram or per-notation scopes.
- Multiple secrets behind one MCP connection.
- Changing how `warchi-mcp` authenticates (still one key → exchange → JWT).
- `expiresAt` in the create UI (API may keep the field; profile form omits it in v1).
- Restricting notations / node-types / link-types / shapes by model grants (they stay owner/Cerbos-scoped so agents can still resolve notation elements for granted models).

## Admin + deactivation (security)

### Current behavior (today)

| Event | API keys |
|-------|----------|
| User deactivated (`isActive=false`) | Keys are **not** revoked (`revokedAt` stays null). |
| Exchange while inactive | `401` — `User is inactive` (`ApiKeyService.exchange`). |
| MCP/user JWT while inactive | `JwtAuthenticationFilter` refuses auth if `!user.isActive`. |
| User reactivated | Previously issued keys work again (exchange succeeds). |

So deactivation is a soft block, not a revoke. That is weak for long-lived MCP secrets (leak + temporary disable → key still valid after re-enable).

### Required in this feature

1. **Auto-revoke on deactivate**  
   When an admin sets `isActive` from `true` → `false`, revoke **all** non-revoked API keys of that user (`revokedAt = now`).  
   Reactivation does **not** restore keys — user must create new ones.  
   Idempotent if already inactive / keys already revoked.

2. **Admin API** (Cerbos `admin_panel` / same gate as user admin):
   - `GET /api/v1/admin/users/{userId}/api-keys` — list keys for that user (metadata only: id, name, prefix, mode, scopes/grants summary, dates, revokedAt). Never plaintext.
   - `DELETE /api/v1/admin/users/{userId}/api-keys/{keyId}` — revoke that key (same effect as owner revoke).

3. **Admin UI** (`AdminUsersView` or user detail drawer):
   - Section «API-ключи»: list + «Отозвать» with confirm.
   - Deactivate toggle copy notes that keys will be revoked.

Owner self-service (`/api/v1/api-keys`) unchanged.

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
| Grant model existence | Each `modelId` must exist; owner of the key must be able to **view** that model (Cerbos/ownership). Otherwise → 400. |
| Max grants | At most **50** grants per key (keeps JWT small). → 400 if exceeded. |
| At least one scope | Key or grant must retain read and/or write after normalize. |

### Persistence (`api_keys`)

- `mode` — text/enum: `all` \| `grants` (NOT NULL)
- `scopes` — jsonb, nullable (used when `mode=all`)
- `grants` — jsonb, nullable (used when `mode=grants`): `[{ "modelId": string, "scopes": string[] }]`
- Drop column `model_ids`
- Liquibase: clear `api_keys` (or drop/recreate table) in the same changelog, then apply new columns — no dual-read of old rows

### Exchange JWT claims

- `type=mcp_access` (unchanged)
- `mode`
- `scopes` when `mode=all`
- `grants` when `mode=grants` (same shape as storage)
- TTL unchanged (~20 minutes)

`ExchangeApiKeyResponse` mirrors these fields (no separate flat `modelIds`).  
`warchi-mcp` only needs `accessToken` / `expiresIn` (already `@JsonIgnoreProperties(ignoreUnknown = true)`).

## Enforcement (arepos-server)

### Coarse (`McpScopeFilter`)

For MCP tokens only:

- Safe methods (GET/HEAD/OPTIONS) → token must have **read somewhere** (`mode=all` scopes or any grant with read).
- Mutating methods → token must have **write somewhere**.
- `/api/v1/api-keys` still forbidden for MCP tokens.

This rejects huge classes of calls early; it does **not** authorize a specific model.

### Precise (`ResourceAccessService`)

Today `requireMcpModelAllowed` only checks membership in an allowlist. Replace with scope-aware helpers, e.g.:

- `requireMcpModelScope(modelId, models:read)` from `requireCanViewModel` / view paths for nodes, links, diagrams, wiki tied to a model
- `requireMcpModelScope(modelId, models:write)` from `requireCanEditModel` / edit paths (including batch-save)

Behavior:

1. `mode=all` → required scope ∈ key `scopes`; then Cerbos/ownership as today.
2. `mode=grants` → find grant for `modelId`:
   - missing → `403 model_not_allowed`
   - scope missing on that grant → `403 missing_scope`
   - then Cerbos/ownership

`mcpModelIdsAllowlist()` becomes “set of modelIds with at least `models:read`” for `mode=grants`, or `null` for `mode=all`.

### List / search filtering

| Endpoint / path | `mode=grants` | `mode=all` |
|-----------------|---------------|------------|
| `GET /models`, model hits in `search_catalog` | Only models with read in a grant | Unrestricted (Cerbos only) |
| `search_model`, get/list nodes/links/diagrams | Precise scope check on `modelId` | Precise scope check on key scopes |
| Notation hits in `search_catalog`, `list_notations`, `search_notation`, types/shapes | **Not** filtered by grants — owner/Cerbos only | Same |

**Bugfix as part of this work:** `searchCatalog` currently filters Cerbos but not MCP allowlist for model hits; under grants (and formerly allowlist) model hits must be filtered.

### Root creates without a granted model

`POST /models` (and any similar “create top-level model” path) does **not** today call MCP allowlist checks.

| Mode | Policy |
|------|--------|
| `mode=all` + `models:write` | Allowed (subject to Cerbos / ownership rules for create). |
| `mode=all` without write | Forbidden by coarse filter / missing write scope. |
| `mode=grants` | **Forbidden** for MCP tokens (`403 missing_scope` or dedicated message): new model would be outside grants. Agents work inside already-granted models only. |

Copy/diagram-copy into a target model: target must have write grant (precise check on target `modelId`).

### Non-model catalogs

Notations, components, relations, node/link types, shapes: **not** scoped by grants. Rationale: agents need notation discovery to build diagrams inside granted models; shrinking that surface is a separate feature. Grants only constrain model-bound data and mutations.

Wiki / document refs that resolve to a model: use precise model scope (read for list/get, write for create/update).

## UI (warchi)

**Profile → API keys → Create**

1. Name  
2. Area radio:
   - **All accessible models** → global Read / Write checkboxes (`mode=all`)
   - **Selected models** → pick models; each row has Read / Write (`mode=grants`)
3. Write checkbox forces Read on (disabled until write off), including per-row in grants mode.
4. Submit disabled if grants mode has zero models, a model with no scopes, or more than 50 models.
5. After create: show plaintext once; list shows summary e.g. `All models · read` or `3 models · mixed scopes`.
6. Post-create actions in v1: rename, revoke only (no grant editor; no expiresAt field).

Types: replace `modelIds` with `mode` + `grants` in `src/types/apiKeys.ts` and `ApiKeysSection.vue`.  
i18n: new strings for area radio, per-model rights, mixed-scopes summary (ru/en).

## API surface

Management (user session + CSRF):

- `POST /api/v1/api-keys` — body with `mode`, `scopes` \| `grants`, optional `expiresAt`
- `GET /api/v1/api-keys` — response includes `mode`, `scopes`, `grants`
- `PATCH /api/v1/api-keys/{id}` — **name and/or `expiresAt` / `clearExpiresAt` only**; remove `scopes`, `modelIds`, `clearModelIds` from `UpdateApiKeyRequest`
- `DELETE` — revoke (unchanged)
- `POST /api/v1/auth/api-keys/exchange` — returns JWT + `mode` / `scopes` / `grants`
- Admin (see above): `GET/DELETE /api/v1/admin/users/{userId}/api-keys[/{keyId}]`
- User update path that sets `isActive=false` must call key revoke-all for that owner

## Docs

Update `warchi-mcp` auth docs (ru/en), README security bullets, and profile help copy to describe `mode` and per-model grants. Note: one `warchi_ak_…` secret; tool errors remain `missing_scope` / `model_not_allowed`.

## Testing

- Normalize: write-only grant → stored as read+write.
- Create rejects unknown modelId, model owner cannot view, duplicate modelId, >50 grants.
- `mode=all` write key can mutate any owner-accessible model; read-only cannot.
- `mode=grants`: read-only model rejects mutate; write grant allows mutate; other model → `model_not_allowed`.
- `mode=grants` + write: `POST /models` → 403.
- `search_catalog` / `list_models` under grants omit models without read grant.
- Notation catalog still visible under grants (owner-accessible).
- Exchange JWT contains `mode` + `grants`; filter rejects MCP token on `/api-keys`.
- PATCH cannot change scopes/grants.
- Deactivate user → all their keys get `revokedAt`; exchange → 401; reactivate → old key still 401.
- Admin list keys for user; admin revoke one key; non-admin → 403.
- UI: cannot uncheck read while write on (global and per-row); cannot submit empty grants.

## Rollout

- Feature branch with the same name in `arepos-server` and `warchi` (docs touch `warchi-mcp` as needed).
- Not in prod: Liquibase clears `api_keys`, drops `model_ids`, adds `mode` + `grants`; recreate local keys after deploy.
- No dual-read of old `model_ids`.

# MCP API Key Per-Model Grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Один MCP API-ключ с `mode=all|grants`, правами на каждую модель, админским отзывом ключей и корректным enforcement в arepos; UI в профиле и админке wArchi.

**Architecture:** arepos хранит `mode` + `scopes` или `grants`, кладёт их в JWT `mcp_access`. `McpScopeFilter` — грубая проверка «есть read/write где-то»; `ResourceAccessService.requireMcpModelScope` — точная проверка по modelId. warchi-mcp не меняет auth (только docs). Admin: list/revoke чужих ключей; деактивация пользователя по-прежнему soft-block через `isActive`.

**Tech Stack:** Kotlin/Spring Boot, Liquibase, JUnit + MockMvc; Vue 3 + TypeScript + Vitest; feature branch `feat/mcp-api-key-per-model-grants` в arepos-server и warchi.

**Spec:** `docs/superpowers/specs/2026-08-06-mcp-api-key-per-model-grants-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `arepos-server/.../db/changelog/051-api-keys-mode-grants.sql` | Clear keys, drop `model_ids`, add `mode`/`grants`, nullable `scopes` |
| `arepos-server/.../db/changelog/db.changelog-master.yaml` | Register 051 |
| `arepos-server/.../dto/apikey/ApiKeyDtos.kt` | mode/grants DTOs; slim PATCH |
| `arepos-server/.../model/ApiKeys.kt` | Entity fields |
| `arepos-server/.../service/ApiKeyService.kt` | Create/normalize/exchange/admin list+revoke |
| `arepos-server/.../security/JwtTokenProvider.kt` | JWT claims `mode`/`grants` |
| `arepos-server/.../security/McpAccessDetails.kt` | mode + scopes/grants |
| `arepos-server/.../security/JwtAuthenticationFilter.kt` | Parse new claims |
| `arepos-server/.../security/McpScopeFilter.kt` | Coarse “has read/write somewhere” |
| `arepos-server/.../security/ResourceAccessService.kt` | `requireMcpModelScope`; allowlist helpers |
| `arepos-server/.../service/SearchService.kt` | Filter catalog model hits by MCP read grants |
| `arepos-server/.../controller/ModelsController.kt` | Block `POST /models` for MCP `mode=grants` |
| `arepos-server/.../controller/AdminApiKeysController.kt` | Admin GET/DELETE |
| `arepos-server/.../controller/ApiKeysControllerTest.kt` | Rewrite/extend tests |
| `warchi/src/types/apiKeys.ts` | Frontend types |
| `warchi/src/components/profile/ApiKeysSection.vue` | Create form mode + per-model grants |
| `warchi/src/i18n/locales/auth.ts` (+ admin locale if used) | ru/en strings |
| `warchi/src/views/AdminUsersView.vue` | Admin keys section |
| `warchi-mcp/docs/auth.md`, `auth.ru.md`, README* | Docs |

---

### Task 1: Feature branches

**Files:** none (git only)

- [ ] **Step 1: Create matching branches from master**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server && git checkout master && git pull && git checkout -b feat/mcp-api-key-per-model-grants
cd /Users/nikolaygroznyh/Work/warchi && git checkout master && git pull && git checkout -b feat/mcp-api-key-per-model-grants
# cherry-pick or keep already-committed design/plan commits on warchi master if they exist; move them onto the feature branch:
# git cherry-pick 2ae3f99^..HEAD   # adjust to the docs commits if still only on master
```

Expected: both repos on `feat/mcp-api-key-per-model-grants`. Spec/plan live on warchi branch.

- [ ] **Step 2: Commit branch baseline if needed**

If design/plan commits were on master only, ensure they are on the feature branch before implementation commits.

---

### Task 2: Liquibase 051 — schema rewrite

**Files:**
- Create: `arepos-server/src/main/resources/db/changelog/051-api-keys-mode-grants.sql`
- Modify: `arepos-server/src/main/resources/db/changelog/db.changelog-master.yaml`

- [ ] **Step 1: Add SQL migration**

```sql
-- 051-api-keys-mode-grants.sql
DELETE FROM public.api_keys;

ALTER TABLE public.api_keys DROP COLUMN IF EXISTS model_ids;

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS mode VARCHAR(16);
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS grants JSONB;

UPDATE public.api_keys SET mode = 'all' WHERE mode IS NULL;
ALTER TABLE public.api_keys ALTER COLUMN mode SET NOT NULL;
ALTER TABLE public.api_keys ALTER COLUMN mode SET DEFAULT 'all';

ALTER TABLE public.api_keys ALTER COLUMN scopes DROP NOT NULL;

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_mode_check;
ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_mode_check CHECK (mode IN ('all', 'grants'));
```

- [ ] **Step 2: Register in master changelog** (after `050-api-keys`):

```yaml
  - changeSet:
      id: 051-api-keys-mode-grants
      author: Nikolay Groznykh
      changes:
        - sqlFile:
            path: classpath:db/changelog/051-api-keys-mode-grants.sql
            encoding: UTF-8
            splitStatements: false
            endDelimiter: ;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
git add src/main/resources/db/changelog/051-api-keys-mode-grants.sql src/main/resources/db/changelog/db.changelog-master.yaml
git commit -m "db: api_keys mode and grants schema"
```

---

### Task 3: DTOs + entity

**Files:**
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/dto/apikey/ApiKeyDtos.kt`
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/model/ApiKeys.kt`

- [ ] **Step 1: Replace DTOs**

```kotlin
object ApiKeyScopes {
    const val MODELS_READ = "models:read"
    const val MODELS_WRITE = "models:write"
    val ALL = setOf(MODELS_READ, MODELS_WRITE)
}

object ApiKeyModes {
    const val ALL = "all"
    const val GRANTS = "grants"
    val ALL_VALUES = setOf(ALL, GRANTS)
}

data class ApiKeyGrantDto(
    val modelId: UUID,
    @field:NotEmpty val scopes: List<String>
)

data class CreateApiKeyRequest(
    @field:NotBlank @field:Size(max = 200) val name: String,
    @field:NotBlank val mode: String,
    val scopes: List<String>? = null,
    val grants: List<ApiKeyGrantDto>? = null,
    val expiresAt: Instant? = null
)

data class UpdateApiKeyRequest(
    @field:Size(max = 200) val name: String? = null,
    val expiresAt: Instant? = null,
    val clearExpiresAt: Boolean = false
)

data class ApiKeyResponse(
    val id: UUID,
    val name: String,
    val tokenPrefix: String,
    val mode: String,
    val scopes: List<String>?,
    val grants: List<ApiKeyGrantDto>?,
    val expiresAt: Instant?,
    val revokedAt: Instant?,
    val lastUsedAt: Instant?,
    val createdAt: Instant?,
    val updatedAt: Instant?
)

data class CreateApiKeyResponse(val key: String, val apiKey: ApiKeyResponse)

data class ExchangeApiKeyRequest(
    @field:NotBlank @field:Size(max = 256) val apiKey: String
)

data class ExchangeApiKeyResponse(
    val accessToken: String,
    val expiresIn: Long,
    val tokenType: String = "Bearer",
    val mode: String,
    val scopes: List<String>?,
    val grants: List<ApiKeyGrantDto>?
)
```

- [ ] **Step 2: Update entity `ApiKeys`**

Replace `modelIds` with:

```kotlin
@Column(name = "mode", nullable = false, length = 16)
var mode: String = ApiKeyModes.ALL,

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "scopes", columnDefinition = "jsonb")
var scopes: MutableList<String>? = null,

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "grants", columnDefinition = "jsonb")
var grants: MutableList<Map<String, Any>>? = null,
```

Prefer typed storage: store grants as JSON list of `{modelId, scopes}` via a small embeddable / `MutableList<ApiKeyGrantDto>` if Jackson/Hibernate JSON binding allows (same pattern as other jsonb lists of maps in the project — follow existing jsonb style in `ApiKeys` historically used for string lists).

Practical approach matching current code: keep `grants` as `MutableList<MutableMap<String, Any>>?` or serialize via helper in service to/from `List<ApiKeyGrantDto>`.

- [ ] **Step 3: Commit**

```bash
git add src/main/kotlin/ru/kavader/arepos/dto/apikey/ApiKeyDtos.kt src/main/kotlin/ru/kavader/arepos/model/ApiKeys.kt
git commit -m "feat: api key mode/grants DTOs and entity"
```

---

### Task 4: ApiKeyService normalize + create + exchange

**Files:**
- Modify: `arepos-server/src/main/kotlin/ru/kavader/arepos/service/ApiKeyService.kt`
- Inject: `ModelsRepository`, `ResourceAccessService` (for view check on grant models — careful of cycles; if cycle, validate models in service with repository + ownership check via accessService only on create under user session)

- [ ] **Step 1: Constants + normalize**

```kotlin
companion object {
    const val KEY_PREFIX = "warchi_ak_"
    const val MAX_GRANTS = 50
    private const val RANDOM_BYTES = 32
    private val secureRandom = SecureRandom()
}

private fun normalizeScopes(scopes: List<String>): List<String> {
    val normalized = scopes.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    if (normalized.isEmpty()) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one scope is required")
    }
    val unknown = normalized - ApiKeyScopes.ALL
    if (unknown.isNotEmpty()) {
        throw ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Unknown scopes: ${unknown.sorted().joinToString(", ")}"
        )
    }
    val effective = normalized.toMutableSet()
    if (ApiKeyScopes.MODELS_WRITE in effective) {
        effective += ApiKeyScopes.MODELS_READ
    }
    return effective.sorted()
}

private fun normalizeCreate(request: CreateApiKeyRequest): Triple<String, List<String>?, List<ApiKeyGrantDto>?> {
    val mode = request.mode.trim().lowercase()
    if (mode !in ApiKeyModes.ALL_VALUES) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown mode: ${request.mode}")
    }
    return when (mode) {
        ApiKeyModes.ALL -> {
            if (request.grants != null) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "grants must be null when mode=all")
            }
            val scopes = normalizeScopes(request.scopes ?: emptyList())
            Triple(mode, scopes, null)
        }
        ApiKeyModes.GRANTS -> {
            if (request.scopes != null) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "scopes must be null when mode=grants")
            }
            val grants = request.grants ?: emptyList()
            if (grants.isEmpty()) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one grant is required")
            }
            if (grants.size > MAX_GRANTS) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At most $MAX_GRANTS grants allowed")
            }
            val ids = grants.map { it.modelId }
            if (ids.size != ids.toSet().size) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate modelId in grants")
            }
            val normalizedGrants = grants.map { g ->
                ApiKeyGrantDto(modelId = g.modelId, scopes = normalizeScopes(g.scopes))
            }
            // validate each model exists + current user can view (see Step 2)
            Triple(mode, null, normalizedGrants)
        }
        else -> error("unreachable")
    }
}
```

- [ ] **Step 2: Validate grant models** — for each grant modelId: load model; if missing → 400; `accessService.requireCanViewModel(model)` **without** MCP details (user session). Note: `requireCanViewModel` today also calls MCP allowlist — when creating keys there is no MCP token, so MCP check is no-op. OK.

- [ ] **Step 3: Persist + `toResponse` + exchange**

```kotlin
// create: save mode, scopes, grants (serialize grants to jsonb)
// update: only name / expiresAt / clearExpiresAt — remove scopes/modelIds handling
// exchange:
val mode = entity.mode
val scopes = entity.scopes?.toSet()
val grants = entity.readGrants() // List<ApiKeyGrantDto>?
val accessToken = jwtTokenProvider.generateMcpAccessToken(
    userId = owner.id!!,
    role = owner.role.name,
    mode = mode,
    scopes = scopes,
    grants = grants
)
return ExchangeApiKeyResponse(
    accessToken = accessToken,
    expiresIn = jwtTokenProvider.mcpAccessExpirationSeconds(),
    mode = mode,
    scopes = scopes?.sorted(),
    grants = grants
)
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: api key create/exchange with mode and grants"
```

---

### Task 5: JWT + McpAccessDetails + filters

**Files:**
- Modify: `JwtTokenProvider.kt`
- Modify: `McpAccessDetails.kt`
- Modify: `JwtAuthenticationFilter.kt`
- Modify: `McpScopeFilter.kt`
- Test: `JwtTokenProviderTest.kt`

- [ ] **Step 1: McpAccessDetails**

```kotlin
data class McpAccessDetails(
    val mode: String,
    /** mode=all */
    val scopes: Set<String>?,
    /** mode=grants */
    val grants: Map<UUID, Set<String>>?
) {
    fun hasScopeSomewhere(scope: String): Boolean =
        when (mode) {
            ApiKeyModes.ALL -> scopes?.contains(scope) == true
            ApiKeyModes.GRANTS -> grants?.values?.any { scope in it } == true
            else -> false
        }

    fun scopesForModel(modelId: UUID): Set<String>? =
        when (mode) {
            ApiKeyModes.ALL -> scopes
            ApiKeyModes.GRANTS -> grants?.get(modelId)
            else -> null
        }
}
```

- [ ] **Step 2: `generateMcpAccessToken(userId, role, mode, scopes, grants)`**

Claims:
- always `mode`
- if all: `scopes` list
- if grants: `grants` as list of `{modelId, scopes}`

Add `getMcpMode`, `getMcpGrants` parsers; remove/stop using `getModelIds` for new tokens.

- [ ] **Step 3: Filter wiring**

`JwtAuthenticationFilter`: build `McpAccessDetails` from mode/scopes/grants.

`McpScopeFilter`:

```kotlin
val required = when (method) {
    "GET", "HEAD", "OPTIONS" -> ApiKeyScopes.MODELS_READ
    else -> ApiKeyScopes.MODELS_WRITE
}
if (!details.hasScopeSomewhere(required)) {
    writeForbidden(response, "missing_scope", "Missing required scope: $required")
    return
}
```

- [ ] **Step 4: Unit test JWT round-trip for grants claim**

```kotlin
@Test
fun `mcp token carries mode and grants`() {
    val modelId = UUID.randomUUID()
    val token = provider.generateMcpAccessToken(
        userId = UUID.randomUUID(),
        role = "USER",
        mode = "grants",
        scopes = null,
        grants = listOf(ApiKeyGrantDto(modelId, listOf("models:read", "models:write")))
    )
    assertEquals("grants", provider.getMcpMode(token))
    assertEquals(setOf("models:read", "models:write"), provider.getMcpGrants(token)[modelId])
}
```

Run: `./gradlew test --tests "*JwtTokenProviderTest"`

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: MCP JWT mode and grants claims"
```

---

### Task 6: Precise enforcement + search + create model

**Files:**
- Modify: `ResourceAccessService.kt`
- Modify: `SearchService.kt` (`searchCatalog` model hits)
- Modify: `ModelsController.kt` (`createModel`)
- Modify: `DocumentRefsService.kt` / `AdminListSupport.kt` if they use `mcpModelIdsAllowlist()` — keep helper returning read-capable model ids

- [ ] **Step 1: Replace allowlist check**

```kotlin
fun mcpReadableModelIds(): Set<UUID>? {
    val details = CurrentUser.mcpAccessDetails() ?: return null
    return when (details.mode) {
        ApiKeyModes.ALL -> null
        ApiKeyModes.GRANTS -> details.grants
            ?.filterValues { ApiKeyScopes.MODELS_READ in it }
            ?.keys
        else -> emptySet()
    }
}

fun requireMcpModelScope(modelId: UUID?, required: String) {
    val details = CurrentUser.mcpAccessDetails() ?: return
    if (modelId == null) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "model_not_allowed")
    }
    val scopes = details.scopesForModel(modelId)
        ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "model_not_allowed")
    if (required !in scopes) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "missing_scope")
    }
}
```

Wire:
- `requireCanViewModel` / node/link/diagram view → `requireMcpModelScope(id, MODELS_READ)`
- `requireCanEditModel` / edit paths → `requireMcpModelScope(id, MODELS_WRITE)`

Replace `mcpModelIdsAllowlist()` callers with `mcpReadableModelIds()` (same null = unrestricted semantics).

- [ ] **Step 2: `searchCatalog` model filter**

After Cerbos filter for models:

```kotlin
val readable = accessService.mcpReadableModelIds()
hits += page.content
    .filter { model -> access[model.id] == true }
    .filter { model -> readable == null || model.id in readable }
    .map { ... }
```

- [ ] **Step 3: Block create model for grants mode**

In `ModelsController.createModel` at start:

```kotlin
val mcp = CurrentUser.mcpAccessDetails()
if (mcp != null && mcp.mode == ApiKeyModes.GRANTS) {
    throw ResponseStatusException(HttpStatus.FORBIDDEN, "missing_scope")
}
```

(`mode=all` still needs write somewhere — coarse filter.)

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: per-model MCP scope enforcement"
```

---

### Task 7: Admin API keys endpoints

**Files:**
- Create: `arepos-server/src/main/kotlin/ru/kavader/arepos/controller/AdminApiKeysController.kt`
- Modify: `ApiKeysRepository.kt` — `findByOwnerOrderByCreatedAtDesc` already exists; add `findByIdAndOwnerId` if needed
- Modify: `ApiKeyService.kt` — `listForUser(userId)`, `revokeForUser(userId, keyId)`

- [ ] **Step 1: Service methods**

```kotlin
fun listForUser(userId: UUID): List<ApiKeyResponse> {
    if (!accessService.canViewAdminPanel()) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied")
    }
    val owner = usersRepository.findById(userId).orElseThrow {
        ResponseStatusException(HttpStatus.NOT_FOUND, "User $userId not found")
    }
    return apiKeysRepository.findByOwnerOrderByCreatedAtDesc(owner).map { it.toResponse() }
}

@Transactional
fun revokeForUser(userId: UUID, keyId: UUID) {
    if (!accessService.canViewAdminPanel()) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied")
    }
    val owner = usersRepository.findById(userId).orElseThrow {
        ResponseStatusException(HttpStatus.NOT_FOUND, "User $userId not found")
    }
    val entity = apiKeysRepository.findByIdAndOwner(keyId, owner)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "API key $keyId not found")
    if (entity.revokedAt == null) {
        val now = Instant.now()
        entity.revokedAt = now
        entity.updatedAt = now
        apiKeysRepository.save(entity)
    }
}
```

- [ ] **Step 2: Controller**

```kotlin
@RestController
@RequestMapping("/api/v1/admin/users/{userId}/api-keys")
class AdminApiKeysController(private val apiKeyService: ApiKeyService) {
    @GetMapping
    fun list(@PathVariable userId: UUID) = apiKeyService.listForUser(userId).toListResponse()

    @DeleteMapping("/{keyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(@PathVariable userId: UUID, @PathVariable keyId: UUID) {
        apiKeyService.revokeForUser(userId, keyId)
    }
}
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: admin list and revoke user API keys"
```

---

### Task 8: arepos integration tests

**Files:**
- Modify: `arepos-server/src/test/kotlin/ru/kavader/arepos/controller/ApiKeysControllerTest.kt`
- Add cases (same file or `AdminApiKeysControllerTest.kt`)

- [ ] **Step 1: Rewrite helpers**

```kotlin
private fun createKey(
    userId: UUID,
    mode: String = "all",
    scopes: List<String>? = listOf("models:read"),
    grants: List<Map<String, Any>>? = null
): CreateApiKeyResponse {
    // POST /api/v1/api-keys with new body shape
}
```

- [ ] **Step 2: Cover spec cases**

1. create `mode=grants` write-only scopes on grant → response grant has read+write  
2. grants duplicate modelId → 400  
3. grants > 50 → 400  
4. `mode=grants` read on A, write on B: GET A OK; POST mutate A → 403; mutate B OK; GET other → 403  
5. `mode=grants` + write: `POST /api/v1/models` → 403  
6. `search_catalog` does not return non-granted model  
7. deactivate user: exchange 401; keys `revokedAt` still null; reactivate: exchange OK  
8. admin GET/DELETE keys; non-admin 403  
9. PATCH with old `scopes` field ignored/removed — PATCH name works; cannot change mode via PATCH  

Run:

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "*ApiKeysControllerTest*" --tests "*AdminApiKeys*"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit -am "test: API key mode grants and admin revoke"
```

---

### Task 9: warchi types + ApiKeysSection UI

**Files:**
- Modify: `warchi/src/types/apiKeys.ts`
- Modify: `warchi/src/components/profile/ApiKeysSection.vue`
- Modify: `warchi/src/i18n/locales/auth.ts`

- [ ] **Step 1: Types**

```ts
export type ApiKeyScope = "models:read" | "models:write"
export type ApiKeyMode = "all" | "grants"

export type ApiKeyGrant = {
  modelId: string
  scopes: ApiKeyScope[]
}

export type ApiKey = {
  id: string
  name: string
  tokenPrefix: string
  mode: ApiKeyMode
  scopes: ApiKeyScope[] | null
  grants: ApiKeyGrant[] | null
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type CreateApiKeyRequest = {
  name: string
  mode: ApiKeyMode
  scopes?: ApiKeyScope[] | null
  grants?: ApiKeyGrant[] | null
  expiresAt?: string | null
}

export type UpdateApiKeyRequest = {
  name?: string
  expiresAt?: string | null
  clearExpiresAt?: boolean
}
```

- [ ] **Step 2: Form state**

- `mode`: `'all' | 'grants'` (radio)
- `scopeRead` / `scopeWrite` for mode=all (write ⇒ read, existing watch)
- For mode=grants: `selectedModelIds` + `Map<modelId, {read, write}>` or array of grants; adding a model defaults to read=true, write=false; per-row write ⇒ read
- Submit body:

```ts
if (mode.value === "all") {
  body = {
    name,
    mode: "all",
    scopes: scopeWrite.value ? ["models:read", "models:write"] : ["models:read"],
    grants: null,
  }
} else {
  body = {
    name,
    mode: "grants",
    scopes: null,
    grants: grantRows.value.map((r) => ({
      modelId: r.modelId,
      scopes: r.write ? ["models:read", "models:write"] : ["models:read"],
    })),
  }
}
```

Disable submit if grants empty or length > 50.

- [ ] **Step 3: List summary**

```ts
const formatKeySummary = (key: ApiKey): string => {
  if (key.mode === "all") {
    const write = key.scopes?.includes("models:write")
    return write
      ? t("profile.apiKeysSummaryAllWrite")
      : t("profile.apiKeysSummaryAllRead")
  }
  const n = key.grants?.length ?? 0
  const allWrite = key.grants?.every((g) => g.scopes.includes("models:write"))
  const allRead = key.grants?.every((g) => !g.scopes.includes("models:write"))
  if (allWrite) return t("profile.apiKeysSummaryGrantsWrite", { count: n })
  if (allRead) return t("profile.apiKeysSummaryGrantsRead", { count: n })
  return t("profile.apiKeysSummaryGrantsMixed", { count: n })
}
```

- [ ] **Step 4: i18n** (ru/en): area radio labels, per-model rights, summaries, write-implies-read (already partially present).

- [ ] **Step 5: Manual smoke** — `npm run dev`, create all-read key, grants mixed key; confirm API payload in network tab.

- [ ] **Step 6: Commit**

```bash
cd /Users/nikolaygroznyh/Work/warchi
git add src/types/apiKeys.ts src/components/profile/ApiKeysSection.vue src/i18n/locales/auth.ts
git commit -m "feat: API key create form with per-model grants"
```

---

### Task 10: Admin UI — user API keys

**Files:**
- Modify: `warchi/src/views/AdminUsersView.vue` (or extract `AdminUserApiKeys.vue` under `src/components/admin/`)
- Modify: admin i18n locale file used by `AdminUsersView` (search `adminUsers` keys)

- [ ] **Step 1: Load keys when expanding a user row / opening drawer**

```ts
const loadUserKeys = async (userId: string) => {
  const result = await apiGet<PaginatedResponse<ApiKey> | { items: ApiKey[] }>(
    `/admin/users/${userId}/api-keys`
  )
  // adapt to ListResponse shape from arepos (items)
}
```

- [ ] **Step 2: Revoke**

```ts
const revokeUserKey = async (userId: string, keyId: string) => {
  if (!window.confirm(t("adminUsers.apiKeysRevokeConfirm"))) return
  await apiDelete(`/admin/users/${userId}/api-keys/${keyId}`)
  await loadUserKeys(userId)
}
```

Show name, prefix, mode summary, revoked badge, revoke button if `!revokedAt`.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: admin UI to list and revoke user API keys"
```

---

### Task 11: Docs (warchi-mcp + any profile help)

**Files:**
- Modify: `warchi-mcp/docs/auth.md`, `docs/auth.ru.md`
- Modify: `warchi-mcp/README.md`, `README.ru.md`, `SECURITY.md`, `SECURITY.ru.md` (bullets about scopes/allowlist → mode/grants)
- Optional: in-app docs if profile MCP section exists under `warchi/src/features/docs`

- [ ] **Step 1: Rewrite auth docs examples**

Document:

```json
{ "mode": "grants", "grants": [{ "modelId": "...", "scopes": ["models:read"] }] }
```

and enforcement table: coarse filter + per-model scope; admin revoke endpoints; deactivate = soft block.

- [ ] **Step 2: Commit in warchi-mcp** (branch `feat/mcp-api-key-per-model-grants` if repo is git; else commit with warchi docs only)

```bash
cd /Users/nikolaygroznyh/Work/warchi-mcp
git checkout -b feat/mcp-api-key-per-model-grants 2>/dev/null || git checkout feat/mcp-api-key-per-model-grants
git add docs README.md README.ru.md SECURITY.md SECURITY.ru.md
git commit -m "docs: API key mode and per-model grants"
```

---

### Task 12: Full verification

- [ ] **Step 1: arepos tests**

```bash
cd /Users/nikolaygroznyh/Work/arepos-server
./gradlew test --tests "*ApiKeys*" --tests "*JwtTokenProviderTest"
```

Expected: PASS

- [ ] **Step 2: warchi unit/lint if touched helpers have tests**

```bash
cd /Users/nikolaygroznyh/Work/warchi
npm run lint
npx vitest run src/components/profile 2>/dev/null || true
```

- [ ] **Step 3: Manual checklist**

1. Profile: create `all` read key → MCP list_models works, create_node fails  
2. Profile: create grants A=read, B=read+write → agent one key; write only on B  
3. Admin: see keys, revoke → exchange 401  
4. Deactivate user → exchange 401; reactivate → key works if not revoked  

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| mode all/grants data model | 2–4 |
| write ⇒ read, max 50, validate model view | 4 |
| JWT claims | 5 |
| Coarse + precise enforcement | 5–6 |
| search_catalog filter | 6 |
| POST /models forbidden for grants | 6 |
| Notations unfiltered by grants | 6 (no change / intentional) |
| PATCH name/expires only | 3–4 |
| Profile UI | 9 |
| Admin list/revoke | 7, 10 |
| No auto-revoke on deactivate | 8 (assert), non-goal |
| Docs | 11 |

## Self-review notes

- No dual-read of `model_ids`.
- `warchi-mcp` auth client ignores unknown exchange fields — no code change required beyond docs.
- Avoid circular DI: if `ApiKeyService` → `ResourceAccessService` → something → `ApiKeyService`, validate grant models via repository + `canViewModel` only, or a narrow `ModelAccessChecker`.

# OIDC Login Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Брендинг SSO-кнопки на логине через backend env (`OIDC_BUTTON_*`) и скрытие вкладок «Регистрация»/«Админ» при `AREPOS_AUTH_REGISTRATION_ENABLED=false`.

**Architecture:** Расширяем `GET /api/v1/auth/sso/config` полями `buttonBg`, `buttonTextColor`, `buttonIconUrl`, `registrationEnabled`. Фронт (`useOidcAuth` + `LoginView`) читает один public config: красит SSO-кнопку CSS-переменными и фильтрует вкладки. `/register-admin` тоже гейтится `ensureRegistrationEnabled()`.

**Tech Stack:** Spring Boot / Kotlin (`OidcProperties`, `OidcController`, `AuthController`), Vue 3 + Vitest, Helm values.

**Spec:** `docs/superpowers/specs/2026-07-30-oidc-login-branding-design.md`

**Repos:** два отдельных git-репозитория — `lmru-arepos_server` и `lmru-warchi`. Коммиты делать в каждом отдельно.

---

## File map

| File | Responsibility |
|------|----------------|
| `lmru-arepos_server/.../OidcProperties.kt` | Новые поля branding |
| `lmru-arepos_server/.../application.yaml` | Env mapping `OIDC_BUTTON_*` |
| `lmru-arepos_server/.../OidcController.kt` | Расширенный `OidcConfigResponse` + inject `AreposAuthProperties` |
| `lmru-arepos_server/.../AuthController.kt` | Gate `/register-admin` |
| `lmru-arepos_server/.../OidcPropertiesTest.kt` | Defaults branding |
| `lmru-arepos_server/.../AuthRegistrationDisabledTest.kt` | 403 на register-admin |
| `lmru-arepos_server/.../OidcConfigControllerTest.kt` (create) | MockMvc `/auth/sso/config` |
| `lmru-arepos_server/charts/arepos-server/values.yaml` | Env stubs |
| `lmru-arepos_server/README.md` + `README.ru.md` + `AGENTS.md` | Документация env |
| `lmru-warchi/src/composables/useOidcAuth.ts` | Тип + маппинг config |
| `lmru-warchi/src/composables/useOidcAuth.test.ts` | Тесты маппинга |
| `lmru-warchi/src/views/LoginView.vue` | Tabs filter + SSO styles |
| `lmru-warchi/src/views/LoginView.test.ts` (create) | Tabs + button styles |
| `lmru-warchi/public/icons/lemanapro.svg` (create) | Иконка кнопки |
| `lmru-warchi/infra/vps/values/arepos-server.yaml` | Пример Lemanapro branding (опционально, если OIDC уже есть в values) |

---

### Task 1: Feature branches

**Files:** none (git only)

- [ ] **Step 1: Branch in arepos_server**

```bash
cd /Users/nikolaygroznyh/Work/lmru-warchi/lmru-arepos_server
git checkout master
git pull --ff-only
git checkout -b feat/oidc-login-branding
```

Expected: on `feat/oidc-login-branding`.

- [ ] **Step 2: Branch in warchi**

```bash
cd /Users/nikolaygroznyh/Work/lmru-warchi/lmru-warchi
git checkout master
git pull --ff-only
git checkout -b feat/oidc-login-branding
```

Expected: on `feat/oidc-login-branding`.

---

### Task 2: Backend — OidcProperties branding fields (TDD)

**Files:**
- Modify: `lmru-arepos_server/src/main/kotlin/ru/kavader/arepos/security/OidcProperties.kt`
- Modify: `lmru-arepos_server/src/test/kotlin/ru/kavader/arepos/security/OidcPropertiesTest.kt`
- Modify: `lmru-arepos_server/src/main/resources/application.yaml`

- [ ] **Step 1: Write failing property tests**

Append to `OidcPropertiesTest.kt`:

```kotlin
@Test
fun `branding fields default to empty`() {
    val props = OidcProperties()
    assertEquals("", props.buttonBg)
    assertEquals("", props.buttonTextColor)
    assertEquals("", props.buttonIconUrl)
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikolaygroznyh/Work/lmru-warchi/lmru-arepos_server
./gradlew test --tests "ru.kavader.arepos.security.OidcPropertiesTest"
```

Expected: FAIL (unresolved `buttonBg` / etc.).

- [ ] **Step 3: Add fields to OidcProperties**

In `OidcProperties.kt`, after `displayName`:

```kotlin
/** Optional CSS color for SSO login button background (e.g. "#F5C518"). */
val buttonBg: String = "",
/** Optional CSS color for SSO login button text (e.g. "#1A1A1A"). */
val buttonTextColor: String = "",
/** Optional icon URL for SSO login button (absolute or site-relative). */
val buttonIconUrl: String = "",
```

Keep trailing comma style consistent with the data class.

- [ ] **Step 4: Map env in application.yaml**

Under `arepos.oidc` after `display-name`:

```yaml
    display-name: ${OIDC_DISPLAY_NAME:Lemanapro}
    button-bg: ${OIDC_BUTTON_BG:}
    button-text-color: ${OIDC_BUTTON_TEXT_COLOR:}
    button-icon-url: ${OIDC_BUTTON_ICON_URL:}
```

- [ ] **Step 5: Run tests — pass**

```bash
./gradlew test --tests "ru.kavader.arepos.security.OidcPropertiesTest"
```

Expected: PASS.

- [ ] **Step 6: Commit (arepos_server)**

```bash
git add src/main/kotlin/ru/kavader/arepos/security/OidcProperties.kt \
  src/test/kotlin/ru/kavader/arepos/security/OidcPropertiesTest.kt \
  src/main/resources/application.yaml
git commit -m "$(cat <<'EOF'
feat(oidc): add button branding properties from env

EOF
)"
```

---

### Task 3: Backend — extend `/auth/sso/config` + registrationEnabled

**Files:**
- Modify: `lmru-arepos_server/src/main/kotlin/ru/kavader/arepos/controller/OidcController.kt`
- Create: `lmru-arepos_server/src/test/kotlin/ru/kavader/arepos/controller/OidcConfigControllerTest.kt`

- [ ] **Step 1: Write failing MockMvc test**

Create `OidcConfigControllerTest.kt` following `AuthRegistrationDisabledTest` base (`ControllerIntegrationTest`):

```kotlin
package ru.kavader.arepos.controller

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
    properties = [
        "arepos.auth.registration-enabled=false",
        "arepos.oidc.enabled=false",
        "arepos.oidc.display-name=Lemanapro",
        "arepos.oidc.button-bg=#F5C518",
        "arepos.oidc.button-text-color=#1A1A1A",
        "arepos.oidc.button-icon-url=/icons/lemanapro.svg"
    ]
)
class OidcConfigControllerTest : ControllerIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `returns branding and registrationEnabled in sso config`() {
        mockMvc.perform(get("/api/v1/auth/sso/config"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.enabled").value(false))
            .andExpect(jsonPath("$.displayName").value("Lemanapro"))
            .andExpect(jsonPath("$.buttonBg").value("#F5C518"))
            .andExpect(jsonPath("$.buttonTextColor").value("#1A1A1A"))
            .andExpect(jsonPath("$.buttonIconUrl").value("/icons/lemanapro.svg"))
            .andExpect(jsonPath("$.registrationEnabled").value(false))
    }
}
```

- [ ] **Step 2: Run test — expect fail**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.OidcConfigControllerTest"
```

Expected: FAIL (missing JSON fields / compile if response type unchanged).

- [ ] **Step 3: Implement response + controller**

Update `OidcConfigResponse` and `OidcController`:

```kotlin
import ru.kavader.arepos.config.AreposAuthProperties

data class OidcConfigResponse(
    val enabled: Boolean,
    val displayName: String,
    val buttonBg: String? = null,
    val buttonTextColor: String? = null,
    val buttonIconUrl: String? = null,
    val registrationEnabled: Boolean
)

@RestController
@RequestMapping("/api/v1/auth/sso")
class OidcController(
    private val oidcService: OidcAuthService,
    private val oidcProperties: OidcProperties,
    private val oidcStateToken: OidcStateToken,
    private val userRepository: UsersRepository,
    private val authTokenService: AuthTokenService,
    private val authCookieService: AuthCookieService,
    private val authProperties: AreposAuthProperties
) {
    @GetMapping("/config")
    fun config(): OidcConfigResponse =
        OidcConfigResponse(
            enabled = oidcProperties.isEffectivelyEnabled(),
            displayName = oidcProperties.displayName.ifBlank { "SSO" },
            buttonBg = oidcProperties.buttonBg.trim().ifBlank { null },
            buttonTextColor = oidcProperties.buttonTextColor.trim().ifBlank { null },
            buttonIconUrl = oidcProperties.buttonIconUrl.trim().ifBlank { null },
            registrationEnabled = authProperties.registrationEnabled
        )
    // ... rest unchanged
}
```

- [ ] **Step 4: Run test — pass**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.OidcConfigControllerTest"
```

Expected: PASS.

- [ ] **Step 5: Commit (arepos_server)**

```bash
git add src/main/kotlin/ru/kavader/arepos/controller/OidcController.kt \
  src/test/kotlin/ru/kavader/arepos/controller/OidcConfigControllerTest.kt
git commit -m "$(cat <<'EOF'
feat(oidc): expose button branding and registrationEnabled in sso config

EOF
)"
```

---

### Task 4: Backend — gate `/register-admin` with registrationEnabled

**Files:**
- Modify: `lmru-arepos_server/src/main/kotlin/ru/kavader/arepos/controller/AuthController.kt`
- Modify: `lmru-arepos_server/src/test/kotlin/ru/kavader/arepos/controller/AuthRegistrationDisabledTest.kt`

- [ ] **Step 1: Write failing test for register-admin**

Append to `AuthRegistrationDisabledTest.kt` (class already has `registration-enabled=false`). Set `arepos.admin-secret` via `@TestPropertySource` — update class annotation:

```kotlin
@TestPropertySource(
    properties = [
        "arepos.auth.registration-enabled=false",
        "arepos.admin-secret=test-admin-secret"
    ]
)
```

Add test:

```kotlin
@Test
fun `returns 403 for register-admin when registration is disabled`() {
    val payload = mapOf(
        "email" to "admin-blocked@test.com",
        "password" to "Password1",
        "adminSecret" to "test-admin-secret",
        "firstName" to "Test",
        "lastName" to "Admin"
    )

    mockMvc.perform(
        post("/api/v1/auth/register-admin")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(payload))
    ).andExpect(status().isForbidden)
}
```

If `AdminRegisterRequest` is preferred over `mapOf`, use that DTO (same fields).

- [ ] **Step 2: Run test — expect fail (200/created or other non-403)**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.AuthRegistrationDisabledTest"
```

Expected: new test FAIL (not 403).

- [ ] **Step 3: Gate registerAdmin**

At the start of `registerAdmin(...)`, before admin-secret checks:

```kotlin
fun registerAdmin(...): AuthResponse {
    ensureRegistrationEnabled()
    if (adminSecret.isBlank()) {
        // ...
```

- [ ] **Step 4: Run tests — pass**

```bash
./gradlew test --tests "ru.kavader.arepos.controller.AuthRegistrationDisabledTest"
```

Expected: PASS.

- [ ] **Step 5: Commit (arepos_server)**

```bash
git add src/main/kotlin/ru/kavader/arepos/controller/AuthController.kt \
  src/test/kotlin/ru/kavader/arepos/controller/AuthRegistrationDisabledTest.kt
git commit -m "$(cat <<'EOF'
fix(auth): disable register-admin when registration is off

EOF
)"
```

---

### Task 5: Backend — Helm + docs

**Files:**
- Modify: `lmru-arepos_server/charts/arepos-server/values.yaml`
- Modify: `lmru-arepos_server/README.md`
- Modify: `lmru-arepos_server/README.ru.md`
- Modify: `lmru-arepos_server/AGENTS.md`

- [ ] **Step 1: Add env to chart values**

In `charts/arepos-server/values.yaml` under `env:` after `OIDC_DISPLAY_NAME`:

```yaml
  OIDC_DISPLAY_NAME: "Lemanapro"
  OIDC_BUTTON_BG: "${OIDC_BUTTON_BG}"
  OIDC_BUTTON_TEXT_COLOR: "${OIDC_BUTTON_TEXT_COLOR}"
  OIDC_BUTTON_ICON_URL: "${OIDC_BUTTON_ICON_URL}"
```

(If chart uses empty defaults for optional branding, empty string is fine.)

- [ ] **Step 2: Document env vars**

In README.md OIDC bullet list, after `OIDC_DISPLAY_NAME`:

```markdown
  - `OIDC_BUTTON_BG`, `OIDC_BUTTON_TEXT_COLOR`, `OIDC_BUTTON_ICON_URL` (optional SSO button branding on login)
```

Mirror in `README.ru.md`. In `AGENTS.md` Environment Variables section add the three vars + note that `AREPOS_AUTH_REGISTRATION_ENABLED=false` hides Register/Admin tabs on the frontend (via `/auth/sso/config`) and blocks `/register` + `/register-admin`.

- [ ] **Step 3: Commit (arepos_server)**

```bash
git add charts/arepos-server/values.yaml README.md README.ru.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs(oidc): document SSO button branding env vars

EOF
)"
```

---

### Task 6: Frontend — useOidcAuth config mapping (TDD)

**Files:**
- Modify: `lmru-warchi/src/composables/useOidcAuth.ts`
- Modify: `lmru-warchi/src/composables/useOidcAuth.test.ts`

- [ ] **Step 1: Update failing tests**

Replace `fetchSsoConfig` describe expectations and `beforeEach` default:

```ts
ssoConfig.value = {
  enabled: false,
  displayName: 'SSO',
  registrationEnabled: true,
}
```

Update success test:

```ts
it('stores enabled config, branding and registrationEnabled', async () => {
  mockApiGet.mockResolvedValue({
    success: true,
    data: {
      enabled: true,
      displayName: 'Lemanapro',
      buttonBg: '#F5C518',
      buttonTextColor: '#1A1A1A',
      buttonIconUrl: '/icons/lemanapro.svg',
      registrationEnabled: false,
    },
  })

  const { fetchSsoConfig, ssoConfig } = useOidcAuth()
  const result = await fetchSsoConfig()

  expect(mockApiGet).toHaveBeenCalledWith('/auth/sso/config')
  expect(result).toEqual({
    enabled: true,
    displayName: 'Lemanapro',
    buttonBg: '#F5C518',
    buttonTextColor: '#1A1A1A',
    buttonIconUrl: '/icons/lemanapro.svg',
    registrationEnabled: false,
  })
  expect(ssoConfig.value).toEqual(result)
})

it('falls back to disabled when request fails', async () => {
  mockApiGet.mockResolvedValue({ success: false, error: { message: 'down' } })

  const { fetchSsoConfig, ssoConfig } = useOidcAuth()
  const result = await fetchSsoConfig()

  expect(result).toEqual({
    enabled: false,
    displayName: 'SSO',
    registrationEnabled: true,
  })
  expect(ssoConfig.value.enabled).toBe(false)
  expect(ssoConfig.value.registrationEnabled).toBe(true)
})

it('treats blank branding as absent and defaults registrationEnabled to true', async () => {
  mockApiGet.mockResolvedValue({
    success: true,
    data: {
      enabled: true,
      displayName: '  ',
      buttonBg: '  ',
      buttonTextColor: null,
      buttonIconUrl: '',
      // registrationEnabled omitted
    },
  })

  const { fetchSsoConfig } = useOidcAuth()
  const result = await fetchSsoConfig()

  expect(result).toEqual({
    enabled: true,
    displayName: 'SSO',
    buttonBg: undefined,
    buttonTextColor: undefined,
    buttonIconUrl: undefined,
    registrationEnabled: true,
  })
})
```

- [ ] **Step 2: Run tests — expect fail**

```bash
cd /Users/nikolaygroznyh/Work/lmru-warchi/lmru-warchi
npm test -- src/composables/useOidcAuth.test.ts
```

Expected: FAIL on new fields.

- [ ] **Step 3: Implement mapping**

In `useOidcAuth.ts`:

```ts
export type OidcPublicConfig = {
  enabled: boolean
  displayName: string
  buttonBg?: string
  buttonTextColor?: string
  buttonIconUrl?: string
  registrationEnabled: boolean
}

const DEFAULT_SSO_CONFIG: OidcPublicConfig = {
  enabled: false,
  displayName: 'SSO',
  registrationEnabled: true,
}

const oidcLinkStatus = ref<OidcStatus>({ linked: false })
const ssoConfig = ref<OidcPublicConfig>({ ...DEFAULT_SSO_CONFIG })

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function fetchSsoConfig(): Promise<OidcPublicConfig> {
  const result = await apiGet<OidcPublicConfig>('/auth/sso/config')
  if (result.success && result.data) {
    ssoConfig.value = {
      enabled: Boolean(result.data.enabled),
      displayName: result.data.displayName?.trim() || 'SSO',
      buttonBg: trimOrUndefined(result.data.buttonBg),
      buttonTextColor: trimOrUndefined(result.data.buttonTextColor),
      buttonIconUrl: trimOrUndefined(result.data.buttonIconUrl),
      registrationEnabled: result.data.registrationEnabled !== false,
    }
  } else {
    ssoConfig.value = { ...DEFAULT_SSO_CONFIG }
  }
  return ssoConfig.value
}
```

- [ ] **Step 4: Run tests — pass**

```bash
npm test -- src/composables/useOidcAuth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (warchi)**

```bash
git add src/composables/useOidcAuth.ts src/composables/useOidcAuth.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): map SSO branding and registrationEnabled from config

EOF
)"
```

---

### Task 7: Frontend — LoginView tabs + SSO button styles

**Files:**
- Modify: `lmru-warchi/src/views/LoginView.vue`
- Create: `lmru-warchi/src/views/LoginView.test.ts`
- Create: `lmru-warchi/public/icons/lemanapro.svg`

- [ ] **Step 1: Add lemanapro icon asset**

Create `public/icons/lemanapro.svg` (yellow wedge matching brand button):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M4 3h10L8 21H4V3z" fill="#F5C518"/>
  <path d="M12 3h8L14 21h-4L12 3z" fill="#E6A800"/>
</svg>
```

(Visual can be refined; shape should read as a yellow angular mark on the yellow button.)

- [ ] **Step 2: Write failing LoginView tests**

Create `LoginView.test.ts`:

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import LoginView from './LoginView.vue'

const ssoConfig = ref({
  enabled: true,
  displayName: 'Lemanapro',
  buttonBg: '#F5C518',
  buttonTextColor: '#1A1A1A',
  buttonIconUrl: '/icons/lemanapro.svg',
  registrationEnabled: false,
})

vi.mock('../composables/useOidcAuth', () => ({
  useOidcAuth: () => ({
    ssoLogin: vi.fn(),
    fetchSsoConfig: vi.fn(async () => ssoConfig.value),
    ssoConfig,
  }),
}))

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    registerAdmin: vi.fn(),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { name?: string }) =>
      params?.name ? `${key}:${params.name}` : key,
  }),
}))

vi.mock('../components/layout/LanguageSwitcher.vue', () => ({
  default: { name: 'LanguageSwitcher', template: '<div />' },
}))

vi.mock('@/components/ui/UiIcon.vue', () => ({
  default: { name: 'UiIcon', template: '<span />' },
}))

describe('LoginView', () => {
  beforeEach(() => {
    ssoConfig.value = {
      enabled: true,
      displayName: 'Lemanapro',
      buttonBg: '#F5C518',
      buttonTextColor: '#1A1A1A',
      buttonIconUrl: '/icons/lemanapro.svg',
      registrationEnabled: false,
    }
  })

  it('hides register and admin tabs when registration is disabled', async () => {
    const wrapper = mount(LoginView)
    await flushPromises()
    const labels = wrapper.findAll('.tab').map((t) => t.text())
    expect(labels.some((t) => t.includes('auth.tabLogin'))).toBe(true)
    expect(labels.some((t) => t.includes('auth.tabRegister'))).toBe(false)
    expect(labels.some((t) => t.includes('auth.tabAdmin'))).toBe(false)
  })

  it('applies SSO button branding from config', async () => {
    const wrapper = mount(LoginView)
    await flushPromises()
    const btn = wrapper.get('.sso-btn')
    expect(btn.attributes('style')).toContain('--sso-btn-bg: #F5C518')
    expect(btn.attributes('style')).toContain('--sso-btn-color: #1A1A1A')
    expect(wrapper.get('.sso-btn__icon').attributes('src')).toBe('/icons/lemanapro.svg')
  })

  it('shows register tabs when registrationEnabled is true', async () => {
    ssoConfig.value = { ...ssoConfig.value, registrationEnabled: true }
    const wrapper = mount(LoginView)
    await flushPromises()
    const labels = wrapper.findAll('.tab').map((t) => t.text())
    expect(labels.some((t) => t.includes('auth.tabRegister'))).toBe(true)
    expect(labels.some((t) => t.includes('auth.tabAdmin'))).toBe(true)
  })
})
```

Adjust selectors if `LanguageSwitcher` / tabs markup needs stubs for mount to succeed.

- [ ] **Step 3: Run tests — expect fail**

```bash
npm test -- src/views/LoginView.test.ts
```

Expected: FAIL (tabs still show register/admin; no CSS vars).

- [ ] **Step 4: Implement LoginView changes**

In `<script setup>`:

1. Keep `ssoReady` as now.
2. Replace `tabs` computed:

```ts
const registrationEnabled = computed(
  () => !ssoReady.value || ssoConfig.value.registrationEnabled
)

const tabs = computed(() => {
  const loginTab = { key: 'login' as const, label: t('auth.tabLogin') }
  if (!ssoReady.value || !ssoConfig.value.registrationEnabled) {
    return [loginTab]
  }
  return [
    loginTab,
    { key: 'register' as const, label: t('auth.tabRegister') },
    { key: 'register-admin' as const, label: t('auth.tabAdmin') },
  ]
})
```

Spec decision: **until `ssoReady`, show only login tab** (no flash of Register/Admin).

3. Watch / reset mode when registration disabled:

```ts
import { computed, onMounted, ref, watch } from 'vue'
// ...
watch(registrationEnabled, (enabled) => {
  if (!enabled && mode.value !== 'login') {
    mode.value = 'login'
  }
})
```

Note: with the tabs computed above, `registrationEnabled` helper can simply be `ssoConfig.value.registrationEnabled` after ready; for watch use:

```ts
watch(
  () => ssoReady.value && !ssoConfig.value.registrationEnabled,
  (hideRegister) => {
    if (hideRegister && mode.value !== 'login') mode.value = 'login'
  }
)
```

4. SSO button template — style + icon:

```vue
<button
  type="button"
  class="sso-btn"
  :style="ssoButtonStyle"
  :disabled="isSsoLoading"
  @click="handleSsoLogin"
>
  <img
    v-if="!isSsoLoading"
    class="sso-btn__icon"
    :src="ssoIconSrc"
    alt=""
    width="16"
    height="16"
  />
  ...
</button>
```

```ts
const ssoButtonStyle = computed(() => {
  const style: Record<string, string> = {}
  if (ssoConfig.value.buttonBg) style['--sso-btn-bg'] = ssoConfig.value.buttonBg
  if (ssoConfig.value.buttonTextColor) style['--sso-btn-color'] = ssoConfig.value.buttonTextColor
  return style
})

const ssoIconSrc = computed(
  () => ssoConfig.value.buttonIconUrl || '/icons/openid.png'
)
```

5. CSS for `.sso-btn` — use variables with fallbacks:

```css
.sso-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  background: var(--sso-btn-bg, var(--primary, #2563eb));
  color: var(--sso-btn-color, #fff);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
}

.sso-btn:hover:not(:disabled) {
  filter: brightness(1.05);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--sso-btn-bg, var(--primary, #2563eb)) 25%, transparent);
  transform: translateY(-1px);
}

.sso-btn__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--sso-btn-color, #fff) 35%, transparent);
  border-top-color: var(--sso-btn-color, #fff);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

- [ ] **Step 5: Run tests — pass**

```bash
npm test -- src/views/LoginView.test.ts src/composables/useOidcAuth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit (warchi)**

```bash
git add src/views/LoginView.vue src/views/LoginView.test.ts public/icons/lemanapro.svg
git commit -m "$(cat <<'EOF'
feat(auth): brand SSO button from config and hide register tabs

EOF
)"
```

---

### Task 8: Deploy values example + final verification

**Files:**
- Modify (if OIDC env already present): `lmru-warchi/infra/vps/values/arepos-server.yaml`
- Spec status update: `docs/superpowers/specs/2026-07-30-oidc-login-branding-design.md`

- [ ] **Step 1: Add Lemanapro branding env to VPS values when OIDC block exists**

If the file already has OIDC vars, append:

```yaml
  - name: OIDC_BUTTON_BG
    value: "#F5C518"
  - name: OIDC_BUTTON_TEXT_COLOR
    value: "#1A1A1A"
  - name: OIDC_BUTTON_ICON_URL
    value: "/icons/lemanapro.svg"
```

Do **not** flip `AREPOS_AUTH_REGISTRATION_ENABLED` to `false` in shared values unless product owner asks — leave current `"true"`; document that production OIDC deploys should set it `false` to match the reference UI.

If OIDC secrets/env live only in a sealed secret elsewhere, skip values change and only document in plan completion notes.

- [ ] **Step 2: Mark spec implemented**

In spec header: `Status: implemented (feat/oidc-login-branding)`.

- [ ] **Step 3: Full test suites**

```bash
cd /Users/nikolaygroznyh/Work/lmru-warchi/lmru-arepos_server
./gradlew test --tests "ru.kavader.arepos.security.OidcPropertiesTest" \
  --tests "ru.kavader.arepos.controller.OidcConfigControllerTest" \
  --tests "ru.kavader.arepos.controller.AuthRegistrationDisabledTest"

cd /Users/nikolaygroznyh/Work/lmru-warchi/lmru-warchi
npm test -- src/composables/useOidcAuth.test.ts src/views/LoginView.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Manual check (optional)**

With local backend env:

```bash
OIDC_ENABLED=true # + real issuer/client/secret/redirect
OIDC_DISPLAY_NAME=Lemanapro
OIDC_BUTTON_BG=#F5C518
OIDC_BUTTON_TEXT_COLOR=#1A1A1A
OIDC_BUTTON_ICON_URL=/icons/lemanapro.svg
AREPOS_AUTH_REGISTRATION_ENABLED=false
```

Open `/login` → yellow SSO button, only «Вход» tab.

- [ ] **Step 5: Commit remaining (each repo as needed)**

```bash
# warchi
git add docs/superpowers/specs/2026-07-30-oidc-login-branding-design.md \
  docs/superpowers/plans/2026-07-30-oidc-login-branding.md \
  infra/vps/values/arepos-server.yaml
git commit -m "$(cat <<'EOF'
docs(auth): mark OIDC login branding plan and spec done

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `OIDC_BUTTON_BG/TEXT/ICON` env | Task 2, 5 |
| `/auth/sso/config` branding fields | Task 3 |
| `registrationEnabled` in config | Task 3 |
| Hide Register+Admin tabs when registration off | Task 7 |
| Until config ready — only login tab | Task 7 |
| Fallback purple + openid icon | Task 7 CSS/defaults |
| `/register-admin` gated | Task 4 |
| Helm + README | Task 5 |
| Lemanapro icon asset | Task 7 |
| Frontend + backend tests | Tasks 2–4, 6–7 |

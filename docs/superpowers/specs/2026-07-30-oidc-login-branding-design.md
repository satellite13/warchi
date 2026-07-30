# OIDC login branding + registration tabs visibility

Date: 2026-07-30  
Status: implemented (feat/oidc-login-branding)

## Goal

Когда OIDC включён, кнопка «Войти через {displayName}» на экране логина должна выглядеть по бренду провайдера (для Lemanapro — жёлтая кнопка, тёмный текст, своя иконка). Цвета и иконка задаются через env на бэкенде и отдаются фронту. Вкладки «Регистрация» и «Админ» скрываются, когда саморегистрация выключена (`AREPOS_AUTH_REGISTRATION_ENABLED=false`).

## Scope

**In:**
- `lmru-arepos_server`: `OidcProperties`, `application.yaml`, Helm values, `OidcConfigResponse` / `GET /api/v1/auth/sso/config`
- `lmru-arepos_server`: `registrationEnabled` в том же public config; `ensureRegistrationEnabled()` также на `/register-admin`
- `lmru-warchi`: `useOidcAuth` / `OidcPublicConfig`, `LoginView.vue` (стили SSO-кнопки, фильтрация вкладок)
- Unit/integration tests для config и UI-условий
- Документация env в README / AGENTS при необходимости

**Out:**
- Изменение OIDC authorize/callback flow
- Фронтовые `VITE_*` для брендинга (источник правды — backend env)
- Отдельный theme-preset (`OIDC_BUTTON_THEME`)
- Скрытие вкладок только по факту `oidc.enabled` (ориентир — `registrationEnabled`)
- Загрузка/хостинг иконки на CDN (достаточно URL-строки; ассет кладётся в `public/` при необходимости)

## Requirements (confirmed)

| Решение | Выбор |
|--------|--------|
| Брендинг кнопки | Env: `OIDC_BUTTON_BG`, `OIDC_BUTTON_TEXT_COLOR`, `OIDC_BUTTON_ICON_URL` |
| Доставка на фронт | Расширить `GET /api/v1/auth/sso/config` |
| Fallback стилей | Пустые/отсутствующие поля → текущая фиолетовая кнопка + `/icons/openid.png` |
| Вкладки Register/Admin | Скрывать обе при `registrationEnabled=false` |
| Источник флага | Существующий `AREPOS_AUTH_REGISTRATION_ENABLED` → прокинуть в public config |
| `/register-admin` | Тоже блокировать через `ensureRegistrationEnabled()` при `false` |
| OIDC enabled alone | Не скрывает вкладки сам по себе |

Эталонный вид (OIDC on + registration off + Lemanapro env): жёлтая SSO-кнопка, divider «или», форма email/password, одна вкладка «Вход».

## Design

### Backend: OidcProperties + env

Новые optional поля в `arepos.oidc` (`OidcProperties`):

| Property | Env | Default |
|----------|-----|---------|
| `buttonBg` | `OIDC_BUTTON_BG` | `""` |
| `buttonTextColor` | `OIDC_BUTTON_TEXT_COLOR` | `""` |
| `buttonIconUrl` | `OIDC_BUTTON_ICON_URL` | `""` |

В `application.yaml` / charts values — проброс тех же переменных. Для Lemanapro в деплое задать значения под эталон (жёлтый bg, тёмный текст, URL иконки).

### Backend: public config response

Расширить `OidcConfigResponse`:

```kotlin
data class OidcConfigResponse(
    val enabled: Boolean,
    val displayName: String,
    val buttonBg: String? = null,
    val buttonTextColor: String? = null,
    val buttonIconUrl: String? = null,
    val registrationEnabled: Boolean
)
```

`GET /api/v1/auth/sso/config`:
- `enabled` / `displayName` — как сейчас
- branding-поля — trim; blank → `null` (или omit / empty string — фронт трактует одинаково как «нет override»)
- `registrationEnabled` — из `AreposAuthProperties.registrationEnabled`

Один запрос на логине: и SSO-брендинг, и видимость вкладок.

### Backend: register-admin gate

В `AuthController.registerAdmin` вызывать `ensureRegistrationEnabled()` до проверки admin secret (или сразу после — порядок не критичен для UX, но до создания пользователя обязательно). При `registrationEnabled=false` → 403 `"User registration is disabled"` (тот же текст, что у `/register`).

Поведение `/register` без изменений.

### Frontend: useOidcAuth

Расширить `OidcPublicConfig`:

```ts
export type OidcPublicConfig = {
  enabled: boolean
  displayName: string
  buttonBg?: string | null
  buttonTextColor?: string | null
  buttonIconUrl?: string | null
  registrationEnabled: boolean
}
```

`fetchSsoConfig` маппит новые поля; при ошибке/отсутствии данных: `enabled: false`, `registrationEnabled: true` (безопасный UI-default: вкладки видны, как сейчас; API всё равно может вернуть 403).

### Frontend: LoginView

**Tabs:**
```
tabs = [
  login,
  ...(registrationEnabled ? [register, register-admin] : [])
]
```
Если `mode` был register/admin, а флаг стал false — сбросить в `login`.

Пока `ssoReady === false`, можно показывать все вкладки или только login; предпочтительно не мигать: до ответа config показывать только login, либо показывать полный набор и сразу сузить после fetch (допустимо краткое мигание; лучше стартовать с login-only если не уверены — **решение: до `ssoReady` показывать только вкладку login**, после ответа — полный набор если `registrationEnabled`).

**SSO button:**
- Видимость по-прежнему: `mode === 'login' && ssoReady && ssoConfig.enabled`
- Inline style / CSS variables из config:
  - `--sso-btn-bg` ← `buttonBg` или fallback `var(--primary)`
  - `--sso-btn-color` ← `buttonTextColor` или fallback `#fff`
- Icon: `buttonIconUrl` если непустой, иначе `/icons/openid.png`
- Spinner: `border-top-color` = цвет текста кнопки

### Deploy example (Lemanapro)

```yaml
OIDC_DISPLAY_NAME: "Lemanapro"
OIDC_BUTTON_BG: "#F5C518"
OIDC_BUTTON_TEXT_COLOR: "#1A1A1A"
OIDC_BUTTON_ICON_URL: "/icons/lemanapro.svg"
AREPOS_AUTH_REGISTRATION_ENABLED: "false"
```

Иконку положить в `lmru-warchi/public/icons/lemanapro.svg` (жёлтый wedge из эталона). Hex кнопки можно скорректировать в values без кода.

### Tests

- Backend: config возвращает branding + `registrationEnabled`; blank env → null/empty
- Backend: `/register-admin` → 403 при `registration-enabled=false`
- Frontend: `fetchSsoConfig` маппинг полей
- Frontend: при `registrationEnabled=false` в tabs только login; SSO-кнопка получает стили из config

## Risks / notes

- Public config раскрывает только несекретные branding-строки и boolean регистрации — ок.
- `buttonIconUrl` может быть абсолютным или относительным; XSS через `img src` не критичен, но не подставлять URL в HTML без атрибута src.
- Вкладки «Админ» скрываются вместе с регистрацией по продуктовому решению; bootstrap первого админа при выключенной регистрации — через уже существующих админов / другие каналы, не через login UI.

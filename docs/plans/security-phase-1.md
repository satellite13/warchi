# Фаза 1: Безопасность — план реализации

**Ветка:** `feat/security-phase-1` (warchi + arepos-server)  
**Задача:** PKTECHARCH-27  
**ТЗ:** mdwiki `warchi-security-phase-1` (v2)  
**Оценка:** 2.5–3 недели

## Архитектура

```
Браузер → Ingress → warchi (nginx) → /api/, /ws → arepos-server
```

Same-origin: REST CORS не нужен. Cookie auth + CSRF на API.

## Чеклист по шагам

| Шаг | ID | Repo | Статус |
|-----|-----|------|--------|
| 0 | 1.0 Prod hardening | arepos-server, infra | ✅ |
| 1 | 1.2 Cookies + CSRF (backend) | arepos-server | ✅ |
| 2 | 1.7 Logout | arepos-server | ✅ |
| 3 | 1.2 Cookies + CSRF (frontend) | warchi | ✅ |
| 4 | 1.2.1 WebSocket auth | warchi + arepos-server | ✅ |
| 5 | 1.3 Password + lockout | arepos-server + warchi | ✅ |
| 6 | 1.6 CORS / WS origins doc | arepos-server | ✅ |
| 7 | 1.1 Security headers | warchi | ✅ |
| 8 | 1.4 Rate limiting | warchi | ✅ |
| 9 | 1.5 Container security | warchi + arepos-server | ✅ |

## Деплой

1. arepos-server (Bearer fallback сохранён)
2. warchi frontend
3. Следующий релиз: убрать Bearer fallback

## Ключевые файлы

### arepos-server

- `security/AuthCookieService.kt`, `security/CsrfFilter.kt`, `security/AuthCookies.kt`
- `security/JwtAuthenticationFilter.kt`, `security/SecurityConfig.kt`
- `controller/AuthController.kt`
- `config/AreposAuthProperties.kt`, `application-prod.yaml`
- `db/changelog/039-add-login-lockout.sql`

### warchi

- `src/composables/authStorage.ts`, `src/api/apiClient.ts`, `src/composables/useAuth.ts`
- `src/api/modelSyncWs.ts`, `src/features/models/composables/useModelLiveSync.ts`
- `config/default.conf`, `Dockerfile`, `charts/warchi/values.yaml`

## Приёмка

- [ ] Login / logout / refresh (cookies)
- [ ] Live sync без token в URL
- [ ] Register 403 в prod
- [ ] Swagger закрыт в prod
- [ ] securityheaders.com ≥ A
- [ ] Lockout после 10 fails
- [ ] Rate limit 429 на flood login

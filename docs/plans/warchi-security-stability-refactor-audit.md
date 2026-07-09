# wArchi Security And Stability Refactor Audit

Дата: 2026-07-07

## Резюме

Этот документ фиксирует первый audit-first проход по frontend-проекту `warchi`. Код приложения,
зависимости, lock-файлы и конфиги в рамках прохода не менялись. Цель аудита — выделить
security/stability риски, которые стоит закрывать до широкого структурного рефакторинга.

Главный вывод: базовая модель cookie + CSRF уже выстроена правильно, но есть несколько
high-impact зон, где frontend может ухудшить безопасность или стабильность пользовательской
сессии:

- P0: stored XSS через пользовательский markdown в wiki/document preview.
- P0: open redirect после логина через недостаточную проверку `redirect`.
- P1: рассинхрон локального `warchi_user` и cookie-сессии, плюс агрессивный logout при
  сетевых ошибках refresh.
- P1: route/access guards требуют более явного контракта и тестов.
- P2: крупные editor/canvas/realtime модули стоит дробить по поведению, а не форматировать
  механически.

## Scope

Проверены зоны:

- Auth/API/session: `src/api/apiClient.ts`, `src/composables/useAuth.ts`,
  `src/composables/authStorage.ts`, `src/utils/csrfCookie.ts`, `src/views/LoginView.vue`.
- Routing/access/admin: `src/router/index.ts`, `src/router/types.ts`,
  `src/composables/usePermissions.ts`, `src/composables/useAvailabilityGuard.ts`,
  `src/components/menu/NavigationMenu.vue`.
- Markdown/XSS: `src/features/docs/components/DocsContent.vue`, `src/views/WikiView.vue`,
  `src/components/modals/DocumentEditorModal.vue`,
  `src/features/types/components/TypeDocumentPanel.vue`, `src/config/mdEditor.ts`.
- Structure/stability: `src/features/models/ModelEditor.vue`,
  `src/features/models/components/ModelDiagramCanvas.vue`,
  `src/features/models/composables/modelEditorSaveCoordinator.ts`,
  `src/features/models/composables/useModelBatchSave.ts`,
  `src/features/models/composables/modelEditorSavePipeline.ts`,
  `src/features/models/composables/useModelLiveSync.ts`,
  `src/features/models/composables/useDiagramEditLock.ts`,
  `src/features/models/composables/useDiagramRealtimeCollab.ts`,
  `src/features/notations/composables/useNotationDiagram.ts`,
  `src/features/notations/utils/notationElementBuilders.ts`.

## Findings

### P0: Stored XSS In Markdown Preview

Риск: пользовательский markdown из wiki и документов сущностей может просматриваться
пользователями с `VIEW` доступом. Сейчас `MdPreview` и `MdEditor` используются без явного
sanitizer-контракта, а локальная настройка `src/config/mdEditor.ts` содержит только i18n.
Статические docs дополнительно используют `marked` + `v-html` и самописный blocklist
sanitizer, который сложнее поддерживать и тестировать.

Файлы:

- `src/views/WikiView.vue`
- `src/components/modals/DocumentEditorModal.vue`
- `src/features/types/components/TypeDocumentPanel.vue`
- `src/features/docs/components/DocsContent.vue`
- `src/config/mdEditor.ts`

Рекомендация:

- Ввести единый модуль `src/utils/sanitizeMarkdownHtml.ts` на базе поддерживаемого sanitizer
  пакета, например DOMPurify.
- Применять sanitizer ко всем `MdPreview`/`MdEditor` preview-пайплайнам через явный prop или
  общий wrapper-компонент.
- Перевести `DocsContent` с локального blocklist на тот же sanitizer или общий
  `renderMarkdown()` pipeline.
- Запретить `script`, inline event handlers, `javascript:`, `vbscript:`, опасные `data:`
  протоколы; для внешних ссылок добавлять `rel="noopener noreferrer"`.
- Не полагаться на CSP как единственную защиту: текущий nginx CSP полезен, но sanitizer
  должен быть обязательным уровнем защиты для stored content.

Тесты:

- Unit: payload-набор для sanitizer:
  `<script>`, `<img onerror>`, `<svg onload>`, `[x](javascript:alert(1))`,
  entity/encoding variants, внешние ссылки с `target="_blank"`.
- Component: mount markdown preview wrapper и проверить отсутствие `script`, `on*`,
  `javascript:` в DOM.
- E2E: создать markdown-документ с XSS payload, открыть `/wiki` и document modal в
  read-only режиме, проверить, что `alert`/handler не исполняется.

Rollout:

- Сначала добавить sanitizer и тесты на одном wrapper-компоненте.
- Затем перевести wiki, modal и type panel.
- После этого заменить sanitizer в static docs.

### P0: Open Redirect After Login

Риск: `src/views/LoginView.vue` принимает `route.query.redirect`, если строка начинается с
`/`. Такая проверка пропускает protocol-relative URL вида `//evil.example/path`.

Файл:

- `src/views/LoginView.vue`

Рекомендация:

- Вынести helper `isSafeInternalRedirectPath(value: string): boolean`.
- Разрешать только внутренний path: начинается с одного `/`, не начинается с `//`, не содержит
  backslash-обходы, после decode не превращается в внешний URL.
- Рассмотреть whitelist по именам route, если продукту не нужны произвольные path redirects.

Тесты:

- Unit для helper:
  `/home`, `/models/123` проходят;
  `//evil.example`, `/\\evil`, `%2F%2Fevil.example`, `javascript:alert(1)`,
  `https://evil.example` отклоняются.
- Component/router тест для login success с небезопасным `redirect`.

Rollout:

- Изменение локальное и обратно совместимое для нормальных внутренних redirect.

### P1: Session State Can Drift From Cookie Session

Риск: `useAuth().isAuthenticated` вычисляется из наличия `warchi_user` в localStorage. Если
cookie-сессия истекла, удалена или стала недействительной, SPA может считать пользователя
залогиненным до следующего API-сценария. `loadCurrentUser()` при ошибке `/auth/me` сейчас
просто возвращается без очистки или различения 401/403 и transient network.

Файлы:

- `src/composables/useAuth.ts`
- `src/composables/authStorage.ts`
- `src/api/apiClient.ts`
- `src/router/index.ts`

Рекомендация:

- Ввести явное состояние auth bootstrap: `unknown`, `authenticated`, `anonymous`,
  `temporarilyUnavailable`.
- При 401/403 после refresh очищать локальную auth-сессию и эмитить `AUTH_CLEARED_EVENT`.
- При network/5xx не делать мгновенный logout; показывать availability/session warning и
  оставить возможность retry.
- Свести профиль в localStorage к минимально необходимым данным или документировать, что это
  не security boundary.

Тесты:

- Unit: `/auth/me` 401/403 очищает session; network error не очищает мгновенно.
- Unit: refresh network error не вызывает `clearSession`, refresh 401/403 вызывает.
- E2E: оставить `warchi_user`, удалить cookies, открыть protected route и проверить переход
  в корректное состояние login/session expired.

Rollout:

- Потребуется аккуратная UX-формулировка для transient outage, чтобы не превратить сетевые
  сбои в массовый logout.

### P1: Logout Treats Local Cleanup As Successful Server Logout

Риск: `useAuth.logout()` вызывает `POST /auth/logout`, но не проверяет результат. Локальное
состояние очищается даже если server-side logout не состоялся. Для httpOnly cookies это может
оставить активные cookies при визуально завершённом logout.

Файл:

- `src/composables/useAuth.ts`

Рекомендация:

- Возвращать `AuthResult` из `logout`.
- При ошибке показывать пользователю retry/force-local-logout выбор.
- Локальную очистку делать после успешного server logout либо после явного force-local пути.

Тесты:

- Unit: успешный logout чистит storage и эмитит событие.
- Unit: failed logout не считается завершённым без force-local.
- E2E: login -> logout -> reload не восстанавливает сессию.

Rollout:

- Поведение меняет UX logout; стоит добавить понятный текст ошибки и fallback.

### P1: CSRF Header Is Optional On Mutating Requests

Риск: `apiFetch()` добавляет `X-CSRF-Token`, только если cookie `warchi_csrf` доступна. Если
cookie отсутствует, mutating request уходит без заголовка. Backend должен отклонять такой
запрос, но frontend теряет ранний сигнал о сломанной сессии/CSRF bootstrap.

Файлы:

- `src/api/apiClient.ts`
- `src/utils/csrfCookie.ts`

Рекомендация:

- Для mutating non-public запросов ввести fail-fast режим, если CSRF cookie отсутствует.
- Исключения оставить только для явно public auth endpoints.
- В ошибке различать missing CSRF и backend/network failure.

Тесты:

- Unit: POST/PUT/PATCH/DELETE без CSRF cookie возвращает клиентскую ошибку до fetch.
- Unit: public auth endpoints не требуют CSRF.
- E2E/manual: mutating request без CSRF отклоняется предсказуемо.

Rollout:

- Включать после проверки, что backend всегда выставляет readable CSRF cookie при login/refresh.

### P1: Route Guard Contract Is Too Implicit

Риск: защищённость routes построена как opt-out: всё требует auth, кроме `requiresAuth: false`.
Admin guard завязан на `to.path.startsWith("/admin")`, а `RouteMeta.requiresRole` объявлен,
но не используется. Проверка admin-доступа дублируется в router и `NavigationMenu`.

Файлы:

- `src/router/index.ts`
- `src/router/types.ts`
- `src/components/menu/NavigationMenu.vue`
- `src/composables/usePermissions.ts`

Рекомендация:

- Заменить path-prefix admin guard на явный `meta.requiresAdminPanel`.
- Удалить `requiresRole` или реализовать его централизованно; предпочтительнее удалить, так как
  системный admin уже проверяется через permission API.
- Вынести `canViewAdminPanel(userId)` в общий helper/composable и использовать в router и menu.
- Добавить явный 404/catch-all route.
- Для отказа admin-доступа показывать понятную страницу/сообщение вместо тихого перехода на
  `home`.

Тесты:

- Unit/router: unauthenticated -> login; user без `ADMIN_PANEL` -> deny; user с разрешением ->
  pass; permission API error -> deny.
- Component: `NavigationMenu` показывает admin link только при положительном permission check.
- E2E: обычный пользователь не попадает в `/admin`, admin попадает.

Rollout:

- Backend остаётся security boundary; frontend guard нужен для UX и предотвращения случайных
  UI-состояний.

### P1: Availability Recovery Can Hide Authz Outage

Риск: `useAvailabilityGuard` снимает outage после успешного `GET /system/version`. Это
подходит для generic backend outage, но может некорректно скрывать `authz_unavailable`, если
backend жив, а authorization service всё ещё недоступен.

Файлы:

- `src/composables/useAvailabilityGuard.ts`
- `src/api/apiClient.ts`

Рекомендация:

- Для `authz_unavailable` использовать отдельный probe, например повторный безопасный
  permission check, или не auto-clear по generic `/system/version`.
- `clearOutage()` на успешный API делать с учётом kind: generic backend success не должен
  автоматически закрывать authz outage.

Тесты:

- Unit: `authz_unavailable` не заменяется и не очищается generic ping.
- Unit: успешный permission check очищает authz outage.
- Проверить существующий `npm run verify:availability` после изменений.

Rollout:

- Изменение улучшает честность overlay, но может дольше показывать authz outage; нужен ясный
  текст для пользователя.

### P2: Model Editor And Canvas Are High-Risk Refactor Targets

Риск: `ModelEditor.vue` содержит orchestration для tree CRUD, batch conflict UI, validation,
diagram selection, OEF import, live sync, locks и collaboration. `ModelDiagramCanvas.vue`
содержит собственные builders/style/label paths, частично параллельные
`features/notations/utils/notationElementBuilders.ts`.

Файлы:

- `src/features/models/ModelEditor.vue`
- `src/features/models/components/ModelDiagramCanvas.vue`
- `src/features/notations/composables/useNotationDiagram.ts`
- `src/features/notations/utils/notationElementBuilders.ts`

Рекомендация:

- Начинать не с глобального split, а с малых extraction шагов:
  1. вынести batch conflict modal/UI из `ModelEditor.vue`;
  2. вынести required custom properties validation в composable/helper;
  3. завести `features/models/utils/diagramCanvasBuilders.ts` и переиспользовать shared
     notation builders там, где совпадают label/icon/marker semantics;
  4. покрыть builder parity тестами.

Тесты:

- Unit/component для extracted batch conflict modal.
- Unit для required custom properties validation.
- Unit для `diagramCanvasBuilders`: label template с type/component/diagram-scoped props,
  icon/marker/style options parity.
- Existing notation builder tests должны остаться зелёными.

Rollout:

- Каждый extraction должен сохранять поведение и иметь маленький diff. Не смешивать split UI,
  canvas semantics и live sync в одном PR.

### P2: Live Sync, Locks And Collaboration Need A Facade

Риск: `ModelEditor.vue` одновременно подключает `useModelLiveSync`,
`useDiagramEditLock` и `useDiagramRealtimeCollab`. Эти composable имеют разные таймеры,
polling/heartbeat циклы и state guards. Это повышает риск race conditions между save, pull,
lock heartbeat, spectator live updates и visibility changes.

Файлы:

- `src/features/models/composables/useModelLiveSync.ts`
- `src/features/models/composables/useDiagramEditLock.ts`
- `src/features/models/composables/useDiagramRealtimeCollab.ts`
- `src/features/models/ModelEditor.vue`

Рекомендация:

- Ввести фасад `useModelEditorSync.ts`, который описывает единое состояние:
  `idle`, `saving`, `pulling`, `lockedBySelf`, `lockedByOther`, `spectating`, `offline`.
- Оставить низкоуровневые composable внутри фасада, но наружу отдавать один набор state и
  lifecycle handlers.
- Добавить сценарные тесты на взаимодействие dirty local state, remote pull, lock revoke и
  spectator updates.

Тесты:

- Unit: local dirty node не перетирается remote pull.
- Unit: lock revoked -> heartbeat stop -> UI state updated.
- Unit: spectator live update не применяется к dirty/open diagram.
- E2E: два browser contexts, user A держит lock, user B видит spectator/pointer/live update.

Rollout:

- Сначала добавить facade рядом с существующими composable, затем переключить `ModelEditor.vue`.
- Не удалять старые composable до стабилизации E2E.

### P2: Dual Save Path In Model Editor Increases Maintenance Cost

Риск: `modelEditorSaveCoordinator.ts` использует batch save при наличии batch changes, но если
batch changes нет, падает в legacy save pipeline. Оба пути сохраняют похожие сущности и
поддерживают remapping/timestamps, что создаёт риск расхождения поведения.

Файлы:

- `src/features/models/composables/modelEditorSaveCoordinator.ts`
- `src/features/models/composables/useModelBatchSave.ts`
- `src/features/models/composables/modelEditorSavePipeline.ts`

Рекомендация:

- Зафиксировать intended contract: batch path является primary для entity changes.
- Добавить telemetry/log для legacy path, чтобы понять, когда он реально нужен.
- После подтверждения удалить или сузить legacy path до model metadata only/no-op cases.

Тесты:

- Unit: coordinator использует batch path при create/update/delete.
- Unit: no batch changes не вызывает entity save pipeline без необходимости.
- Unit: false 409 не появляется после timestamp refresh.

Rollout:

- Не удалять legacy path до наблюдения в dev/staging и покрытия batch save прямыми тестами.

### P3: Documentation And Type Cleanup

Риск: в типах auth response остаются `accessToken`/`refreshToken`, хотя runtime перешёл на
cookie auth. Документация и комментарии местами ссылаются на несуществующие или устаревшие
plan docs.

Файлы:

- `src/api/apiClient.ts`
- `src/composables/useAuth.ts`
- `src/features/docs/content/auth.md`
- `src/features/docs/content/auth.en.md`
- `src/features/models/composables/useModelLiveSync.ts`
- `AGENTS.md`

Рекомендация:

- Удалить dead token fields из frontend типов, если backend response уже не требует их.
- Обновить auth docs: JWT не хранится в JS storage; profile in localStorage не является
  security boundary.
- Восстановить отсутствующие plan docs или заменить ссылки на актуальные product docs.

Тесты:

- Typecheck/build.
- `src/composables/authStorage.test.ts` и auth docs smoke.

Rollout:

- Делать после P0/P1, чтобы не смешивать cleanup с security behavior changes.

## Phased Remediation Backlog

### Phase 0: Security Hotfixes

- Add safe internal redirect helper and tests.
- Add explicit markdown sanitizer module/wrapper and apply it to wiki/document previews.
- Add sanitizer regression tests with XSS payload corpus.

### Phase 1: Session And Guard Stability

- Rework refresh/network/session-expired behavior.
- Make logout result-aware.
- Add strict CSRF missing-token handling for mutating requests.
- Replace path-based admin guard with explicit route meta.
- Add router/menu/availability tests.

### Phase 2: High-Impact Structural Refactor

- Extract batch conflict UI from `ModelEditor.vue`.
- Extract required custom property validation.
- Add shared model canvas builder layer and parity tests.
- Introduce `useModelEditorSync` facade around live sync, locks and collaboration.
- Add direct tests for `useModelBatchSave`, `useModelLiveSync`, `useDiagramEditLock`,
  `useDiagramRealtimeCollab`.

### Phase 3: Cleanup And Documentation

- Remove dead auth token fields. ✅ (frontend `AuthResponse` is `{ user }` only; tokens stay httpOnly cookies)
- Update in-app auth docs. ✅
- Align missing docs references. ✅ (obsolete `docs/plans/security-phase-1.md` removed; live plan is this audit)
- Add catch-all 404 route if product wants explicit unknown-route UX. ✅ (redirect to home)

## Verification Matrix

Security:

- `isSafeInternalRedirectPath` unit tests.
- Markdown sanitizer unit and component tests.
- E2E stored-XSS smoke for wiki and document modal.
- Manual prod-like CSP check after sanitizer rollout.

Session/API:

- `apiClient` tests for refresh success, refresh 401/403, refresh network error, missing CSRF.
- `useAuth` tests for `loadCurrentUser` and `logout` failure paths.
- E2E stale local profile with missing cookies.

Routing/access:

- Router guard unit tests for public/protected/admin routes.
- `NavigationMenu` permission rendering tests.
- Existing `npm run verify:availability`, extended for authz-specific outage.

Structure/stability:

- Component/unit tests for extracted batch conflict UI.
- Builder parity tests for notation/model canvas label and style behavior.
- Composable-level live sync/lock/collab tests.
- Two-context Playwright scenario for lock/spectator/live update after the sync facade exists.
  (`tests/diagram-lock-spectator.spec.ts`; requires reachable API via `VITE_API_PROXY_TARGET`).
  Frontend also tolerates bare 409 acquire by inferring blocked state from locks list;
  arepos acquire conflict returns 200 + `reason=LOCKED_BY_OTHER`.

Repo gates after implementation phases:

- `npm run test`
- `npm run lint`
- `npm run build`
- Targeted `npm run test:e2e` scenarios when backend fixtures are available.

## Implementation Notes

- Do not combine P0 security fixes with broad component splits.
- Keep each PR scoped to one user-visible behavior or one extraction.
- Backend remains the security boundary for permissions; frontend guards should improve UX and
  reduce accidental exposure, not be treated as authorization.
- Cookie auth requires same-origin deployment. Any future `VITE_API_BASE_URL` cross-origin
  configuration must be treated as an explicit architecture change and tested with cookies/CSRF.

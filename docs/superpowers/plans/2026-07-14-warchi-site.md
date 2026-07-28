# wArchi Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a separate public `warchi-site` (landing, roadmap, feedback board, tutorials, curated downloads) backed by arepos-server, with wArchi SSO and cutover away from the in-app iframe landing.

**Architecture:** Extend arepos with public catalog APIs + authenticated mutations/downloads; deploy a new Vue 3/Vite SPA on its own domain; configure parent-domain session cookies + `returnUrl` login; redirect wArchi guests from `/` to the site.

**Tech Stack:** Kotlin/Spring Boot/Liquibase/Cerbos/MinIO (arepos); Vue 3 + Vite + TypeScript + vue-router + vue-i18n (warchi-site, patterns from warchi); existing cookie JWT session.

**Spec:** [docs/superpowers/specs/2026-07-14-warchi-site-design.md](../specs/2026-07-14-warchi-site-design.md)

**Phasing (ship independently):**

| Phase | Deliverable | Repo(s) |
|-------|-------------|---------|
| A | Feedback + roadmap API | arepos-server |
| B | Tutorials + downloads API | arepos-server |
| C | warchi-site SPA | new `warchi-site` |
| D | SSO cookie domain + wArchi cutover | arepos-server + warchi |

Work feature branch `feat/warchi-site` in each affected repo (per workspace feature-branch workflow).

---

## File map

### arepos-server (Phases A–B, part of D)

| Path | Responsibility |
|------|----------------|
| `src/main/resources/db/changelog/040-site-feedback-roadmap.sql` | Tables for feedback + roadmap |
| `src/main/resources/db/changelog/041-site-tutorials-downloads.sql` | Tables for tutorials + download assets |
| `src/main/resources/db/changelog/db.changelog-master.yaml` | Register 040–041 |
| `src/main/kotlin/.../model/FeedbackItem.kt` (and Vote, Comment, Roadmap*) | JPA entities |
| `src/main/kotlin/.../model/TutorialVideo.kt`, `DownloadAsset.kt` | JPA entities |
| `src/main/kotlin/.../repository/*` | Spring Data repos |
| `src/main/kotlin/.../controller/FeedbackController.kt` | Public + auth feedback API |
| `src/main/kotlin/.../controller/RoadmapController.kt` | Public roadmap + admin milestones |
| `src/main/kotlin/.../controller/TutorialsController.kt` | Public list + admin CRUD |
| `src/main/kotlin/.../controller/DownloadsController.kt` | Public catalog + auth file + admin upload |
| `src/main/kotlin/.../service/FeedbackService.kt` etc. | Business rules, voteCount, rate limits |
| `authz/cerbos/policies/resource.feedback_item.yaml` | Cerbos policies |
| `authz/cerbos/policies/resource.roadmap_milestone.yaml` | |
| `authz/cerbos/policies/resource.tutorial_video.yaml` | |
| `authz/cerbos/policies/resource.download_asset.yaml` | |
| `src/main/kotlin/.../config/AreposAuthProperties.kt` | Add `cookieDomain` |
| `src/main/kotlin/.../security/AuthCookieService.kt` | Set `Domain` when configured |
| `src/main/kotlin/.../security/SecurityConfig.kt` | Permit public GETs; CORS for site origin |
| `src/test/kotlin/.../controller/FeedbackControllerTest.kt` etc. | Tests |

### warchi-site (Phase C) — new repo sibling to warchi

| Path | Responsibility |
|------|----------------|
| `package.json`, `vite.config.ts`, `tsconfig*` | Vue 3 + Vite scaffold (mirror warchi versions) |
| `src/main.ts`, `src/App.vue`, `src/router/index.ts` | App shell + routes |
| `src/composables/useApi.ts`, `useAuth.ts` | API + session (`/auth/me`) |
| `src/i18n/messages.ts` | ru/en |
| `src/views/LandingView.vue` | Ported landing content |
| `src/views/RoadmapView.vue` | Roadmap |
| `src/views/FeedbackListView.vue`, `FeedbackDetailView.vue` | Board |
| `src/views/TutorialsView.vue`, `DownloadsView.vue` | Media library |
| `src/views/AdminView.vue` | Minimal admin |
| `src/components/*` | Cards, vote button, comment thread, video embed |
| `Dockerfile`, `charts/` (optional later) | Deploy |

### warchi (Phase D)

| Path | Responsibility |
|------|----------------|
| `src/router/index.ts` | Guest `/` → external site; remove LandingView route |
| `src/views/LoginView.vue` (or auth flow) | Honor `returnUrl` allowlist |
| `src/env.d.ts`, `.env.example` | `VITE_SITE_URL`, `VITE_SITE_RETURN_ORIGINS` |
| Delete `public/landing.html`, `LandingView.vue`, landing assets after cutover | |

---

## Phase A — Feedback + Roadmap API (arepos-server)

### Task A1: Liquibase schema for feedback + roadmap

**Files:**
- Create: `src/main/resources/db/changelog/040-site-feedback-roadmap.sql`
- Modify: `src/main/resources/db/changelog/db.changelog-master.yaml`

- [ ] **Step 1: Add SQL migration**

Create tables:

```sql
-- feedback_items, feedback_votes, feedback_comments,
-- roadmap_milestones, roadmap_milestone_items
-- with FKs to users, unique (item_id, user_id) on votes,
-- unique (milestone_id, feedback_item_id) on links,
-- audit triggers matching existing tables
```

Statuses as `varchar` with check constraints matching the spec enums.

- [ ] **Step 2: Register changeset `040-site-feedback-roadmap` in master yaml** (after 039)

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/db/changelog/040-site-feedback-roadmap.sql \
  src/main/resources/db/changelog/db.changelog-master.yaml
git commit -m "feat(db): add feedback and roadmap tables for warchi-site"
```

### Task A2: JPA entities + repositories

**Files:**
- Create: `model/FeedbackItem.kt`, `FeedbackVote.kt`, `FeedbackComment.kt`, `RoadmapMilestone.kt`, `RoadmapMilestoneItem.kt`
- Create: matching `repository/*Repository.kt`

- [ ] **Step 1: Write entities** following existing entity style (`var`, UUID id, `@ManyToOne` author/owner patterns from nearby models)

- [ ] **Step 2: Repositories** with query methods:
  - `FeedbackItemRepository.findByFilters(type, status, pageable)`
  - `FeedbackVoteRepository.findByItemIdAndUserId`
  - `FeedbackCommentRepository.findByItemIdOrderByCreatedAtAsc`
  - `RoadmapMilestoneRepository.findAllByOrderBySortOrderAsc`

- [ ] **Step 3: Commit** `feat: add feedback/roadmap JPA layer`

### Task A3: Cerbos policies

**Files:**
- Create: `authz/cerbos/policies/resource.feedback_item.yaml`
- Create: `authz/cerbos/policies/resource.roadmap_milestone.yaml`

- [ ] **Step 1: Policies**

`feedback_item`:
- role `user` / anonymous principal: `view`
- authenticated: `create`, `vote`, `comment`; owner+status new: `edit`, `delete`
- `ADMIN` / admin roles used elsewhere: `manage`

`roadmap_milestone`:
- public `view`
- admin `manage`

Mirror structure of `resource.admin_panel.yaml` / `resource.model.yaml` for role naming already used in arepos.

- [ ] **Step 2: Commit** `feat(authz): cerbos policies for feedback and roadmap`

### Task A4: FeedbackService + FeedbackController (TDD)

**Files:**
- Create: `service/FeedbackService.kt`
- Create: `controller/FeedbackController.kt`
- Create: `src/test/kotlin/.../controller/FeedbackControllerTest.kt`

- [ ] **Step 1: Write failing controller tests** covering:
  - anonymous `GET /api/v1/feedback` → 200
  - anonymous `POST /api/v1/feedback` → 401
  - authenticated create → 201
  - vote twice → still one vote, voteCount=1
  - unvote → voteCount=0
  - comment create
  - admin status patch; non-admin → 403

Follow patterns in existing `*ControllerTest.kt` (MockMvc + auth helpers).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./gradlew test --tests "*FeedbackControllerTest"
```

- [ ] **Step 3: Implement service + controller**

Endpoints from spec:
- `GET /api/v1/feedback`, `GET /api/v1/feedback/{id}`
- `POST /api/v1/feedback`
- `POST|DELETE /api/v1/feedback/{id}/votes`
- `POST /api/v1/feedback/{id}/comments`
- `PATCH /api/v1/feedback/{id}` (admin status; author edit when `new`)

Validate title/body max lengths; update `voteCount` in same `@Transactional` as vote row.

- [ ] **Step 4: Open SecurityConfig** for public GETs on `/api/v1/feedback/**` (GET only)

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit** `feat: feedback public board API`

### Task A5: Roadmap API (TDD)

**Files:**
- Create: `service/RoadmapService.kt`, `controller/RoadmapController.kt`
- Create: `RoadmapControllerTest.kt`

- [ ] **Step 1: Failing tests** — public GET returns milestones with linked items; admin CRUD + link PUT; non-admin mutate → 403

- [ ] **Step 2: Implement** `GET /api/v1/roadmap`, admin milestone endpoints

- [ ] **Step 3: Tests PASS + commit** `feat: roadmap milestones API`

---

## Phase B — Tutorials + Downloads API (arepos-server)

### Task B1: Schema

**Files:**
- Create: `041-site-tutorials-downloads.sql`
- Modify: `db.changelog-master.yaml`

Tables `tutorial_videos`, `download_assets` (FK `file_id` → `files.id`).

- [ ] Commit `feat(db): tutorials and download_assets tables`

### Task B2: Entities, Cerbos, services

- [ ] Entities + repos
- [ ] Policies `tutorial_video`, `download_asset` (`view` public metadata; `download` authenticated; `manage` admin)
- [ ] Commit

### Task B3: TutorialsController (TDD)

- [ ] Public `GET /api/v1/tutorials` (published only)
- [ ] Admin CRUD; validate embed host allowlist (`youtube.com`, `youtu.be`, `rutube.ru`, `vk.com`, `vkvideo.ru`)
- [ ] Tests + commit `feat: tutorial videos API`

### Task B4: DownloadsController (TDD)

- [ ] Public `GET /api/v1/downloads` — metadata only
- [ ] Authenticated `GET /api/v1/downloads/{id}/file` — stream via `FileStorageService` (no public MinIO URL)
- [ ] Admin multipart create/update/delete
- [ ] Soft-validate `notation_export` JSON has `format: "warchi-notation-export"` (warn or 400 — choose 400 for wrong format when kind=notation_export)
- [ ] Tests: anonymous file GET → 401; authenticated → 200; unpublished hidden from list
- [ ] Commit `feat: curated downloads API`

---

## Phase C — warchi-site SPA (new repository)

### Task C1: Scaffold repo

- [ ] Create repo `warchi-site` next to `warchi` with Vue 3 + Vite + TS + vue-router + vue-i18n + Vitest + ESLint/Prettier (align major versions with warchi `package.json`)
- [ ] Path alias `@` → `src/`
- [ ] `vite` proxy `/api` → arepos (env `VITE_API_PROXY_TARGET`)
- [ ] README with run instructions
- [ ] Initial commit

### Task C2: API + auth composables

**Files:** `src/composables/useApi.ts`, `useAuth.ts`, `src/api/config.ts`

- [ ] Port thin `ApiResult` + `apiGet/Post/Put/Delete` pattern from warchi `useApi.ts` (cookie credentials + CSRF header from `warchi_csrf`)
- [ ] `useAuth`: load `/api/v1/auth/me`; expose `loginRedirect()` → `${VITE_APP_URL}/login?returnUrl=${encodeURIComponent(location.href)}`
- [ ] Unit test CSRF header attachment
- [ ] Commit `feat: api client and auth redirect`

### Task C3: Router + shell layout

Routes from spec: `/`, `/roadmap`, `/feedback`, `/feedback/:id`, `/tutorials`, `/downloads`, `/admin`

- [ ] Dark theme CSS variables inspired by current `public/landing.html`
- [ ] Header nav + sign-in / open-app CTAs
- [ ] Commit

### Task C4: Landing page

- [ ] Port sections from `warchi/public/landing.html` into Vue components (no iframe)
- [ ] Teasers linking to roadmap / tutorials / downloads / feedback
- [ ] Commit `feat: landing page`

### Task C5: Feedback UI

- [ ] List with filters + sort; vote control; create form (gated)
- [ ] Detail with comments
- [ ] On 401 → login redirect
- [ ] Commit `feat: feedback board UI`

### Task C6: Roadmap + Tutorials + Downloads UI

- [ ] Roadmap milestones with linked cards
- [ ] Tutorials with allowlisted iframe embeds
- [ ] Downloads catalog; download button triggers authenticated file GET (blob save); guest sees login CTA
- [ ] Commit `feat: roadmap tutorials downloads UI`

### Task C7: Admin UI (minimal)

- [ ] Guard: only if `/auth/me` indicates ADMIN (same role check as warchi)
- [ ] Forms: feedback status, milestones CRUD + link items, tutorial CRUD, download upload
- [ ] Commit `feat: site admin panel`

---

## Phase D — SSO + wArchi cutover

### Task D1: Cookie Domain on arepos

**Files:** `AreposAuthProperties`, `AuthCookieService`, `application.yaml`, tests

- [ ] Add property `arepos.auth.cookie-domain` (optional). When set (e.g. `.warchi.example`), call `.domain(cookieDomain)` on `ResponseCookie` builder in `AuthCookieService.buildCookie`
- [ ] Document that site, app, and API must share the parent domain
- [ ] CORS: allow site origin with credentials
- [ ] Test cookie header contains `Domain=` when property set
- [ ] Commit `feat(auth): configurable cookie domain for cross-subdomain SSO`

### Task D2: returnUrl allowlist in warchi

**Files:** Login flow + router

- [ ] Env `VITE_SITE_URL`, `VITE_SITE_RETURN_ORIGINS` (comma-separated origins)
- [ ] After successful login, if `route.query.returnUrl` parses to an allowlisted origin, `window.location.assign(returnUrl)`; else go `/home`
- [ ] Unit tests for allowlist helper (reject evil.com, accept site origin)
- [ ] Commit `feat(auth): returnUrl allowlist for warchi-site SSO`

### Task D3: Replace in-app landing

**Files:** `src/router/index.ts`, delete landing assets

- [ ] For unauthenticated visit to `/`: redirect to `VITE_SITE_URL` (external)
- [ ] Authenticated `/` → `/home`
- [ ] Remove `LandingView.vue`, `public/landing.html`, related public JS/CSS/fonts sync scripts once site is live
- [ ] Update `prebuild` if it only existed for landing fonts
- [ ] Commit `feat: cut over landing to warchi-site`

### Task D4: Smoke verification

- [ ] Guest opens site: landing, roadmap, feedback, tutorials, downloads catalog
- [ ] Guest clicks download / create → redirected to app login → returns to site logged in
- [ ] Vote/comment/download works with cookies
- [ ] Admin manages content
- [ ] wArchi `/` no longer shows iframe landing

---

## Self-review vs spec

| Spec requirement | Phase/Task |
|------------------|------------|
| Public marketing site, separate repo/deploy | C |
| Feedback board + votes + comments | A4, C5 |
| Hybrid roadmap | A5, C6 |
| Video embeds | B3, C6 |
| Curated downloads, login to download | B4, C6 |
| arepos backend | A–B |
| wArchi SSO / returnUrl / cookie domain | D1–D2 |
| Remove iframe landing | D3 |
| Cerbos + public read | A3, B2 |
| Out of scope (community upload, OAuth AS, SSG) | not planned |

---

## Execution notes

- Do **not** start Phase C until Phase A public GETs work against a local arepos.
- Phase B can parallelize with early C scaffold after A is merged.
- Phase D cookie domain is required before cross-subdomain SSO works in real deploy; local dev can use Vite proxies on one host as a temporary workaround (`www` and `app` both proxied) but production needs D1.

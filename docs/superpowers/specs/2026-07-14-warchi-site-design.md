# wArchi Site — Design Spec

Date: 2026-07-14  
Status: approved

## Goal

Replace the in-app static landing (`public/landing.html` iframe) with a separate public marketing web application that:

1. Presents the product (landing)
2. Shows a curated development roadmap
3. Hosts a public feedback board (ideas and bugs) with votes and comments
4. Embeds video tutorials
5. Offers a curated download library (e.g. exported notations for local installs)

Primary audience: new visitors and the public community. Authenticated actions use an existing wArchi account.

## Decisions

| Topic | Choice |
|-------|--------|
| Audience | Public marketing site + open feedback |
| Auth for mutations | wArchi account only |
| Guest access | Full read of landing, roadmap, board, comments, tutorials, download catalog |
| Downloads | Catalog public; file download requires wArchi login |
| Deployment | Separate repository and separate deploy (own domain) |
| Board MVP | Items + statuses + upvotes + comments |
| Roadmap | Hybrid: curated milestones + linked feedback items |
| Tutorials | External video embeds (YouTube / Rutube / VK Video); metadata in arepos |
| Downloads / sharing | Admin-curated library only (no user uploads in MVP) |
| Notation packs | Files in existing `warchi-notation-export` JSON format (and other admin-uploaded artifacts) |
| Backend | Extend arepos-server (+ MinIO for downloadable files) |
| Frontend approach | Vue 3 + Vite SPA (same stack family as wArchi) + login redirect SSO |

## Architecture

Three deployables, one API:

```
Visitor → warchi-site (Vue SPA)
            ├─ public GET  → arepos-server
            └─ login redirect → wArchi app → session cookies → arepos-server
Authenticated: feedback mutate, download files
Admin: statuses, milestones, tutorials CRUD, download assets CRUD
Download bytes → arepos → MinIO (existing FileStorageService)
```

### Components

- **warchi-site** (new repo): landing, roadmap, feedback, tutorials, downloads, minimal admin UI
- **arepos-server**: feedback, roadmap, tutorial, download-asset entities + APIs; public catalog reads; authenticated download stream; admin manage; files via MinIO
- **warchi**: remove iframe landing from `/`; guest `/` redirects to site URL (env); authenticated users land on `/home`; login supports `returnUrl` back to the site

### SSO

Site and app on sibling subdomains of one parent (e.g. `www.` / `app.`). «Sign in» on the site redirects to app login with `returnUrl`. Session cookies are scoped to the parent domain so the site can call arepos with the same session. CSRF required on mutating requests, same pattern as wArchi. `returnUrl` must be allowlisted to site origins (no open redirect).

## Data model

### FeedbackItem

- `id`, `type` (`idea` | `bug`), `title`, `body`
- `status` (`new` | `planned` | `in_progress` | `done` | `declined`)
- `author` → Users
- `voteCount` (denormalized; updated in the same transaction as vote insert/delete), `createdAt`, `updatedAt`

### FeedbackVote

- `itemId` + `userId` (unique), `createdAt`

### FeedbackComment

- `id`, `itemId`, `author` → Users, `body`, `createdAt`

### RoadmapMilestone

- `id`, `title`, `description`
- `status` (`planned` | `in_progress` | `done`)
- `sortOrder`, optional `targetPeriod` (e.g. `2026 Q3`)

### RoadmapMilestoneItem

- `milestoneId` + `feedbackItemId` (many-to-many)

### TutorialVideo

- `id`, `title`, `description`, `provider` (`youtube` | `rutube` | `vk`), `externalId` or `embedUrl`
- `thumbnailUrl` (optional), `sortOrder`, `published` (bool), `createdAt`, `updatedAt`

### DownloadAsset

- `id`, `title`, `description`
- `kind` (`notation_export` | `other`)
- `file` → existing Files / FileVersions (MinIO)
- `fileName`, `contentType`, `sizeBytes`
- `versionLabel` (optional display string, e.g. notation semver)
- `sortOrder`, `published` (bool), `downloadCount` (denormalized, optional)
- `createdAt`, `updatedAt`

For `kind = notation_export`, the stored file SHOULD be a valid `warchi-notation-export` v1 JSON payload (same format as editor export in wArchi). Validation on admin upload is recommended but can be soft-warn in MVP.

### Ownership rules (MVP)

- Author may edit/delete own feedback item and own comment while item status is `new`
- Feedback status, milestones, tutorials, download assets: `ADMIN` only
- No community upload of notations in MVP — «sharing» means admin publishes packs for others to download into local installs

## API

### Public (no auth)

- `GET /api/v1/feedback` — filters: `type`, `status`; sort: `votes` | `recent`
- `GET /api/v1/feedback/{id}` — includes comments
- `GET /api/v1/roadmap` — milestones with linked items
- `GET /api/v1/tutorials` — published videos only
- `GET /api/v1/downloads` — published catalog metadata only (no file bytes)

### Authenticated (session cookie)

- `POST /api/v1/feedback`
- `POST` / `DELETE /api/v1/feedback/{id}/votes`
- `POST /api/v1/feedback/{id}/comments`
- `PATCH` own `new` item / own comment
- `GET /api/v1/downloads/{id}/file` — stream/download bytes (401 → site login CTA)

### Admin

- `PATCH /api/v1/feedback/{id}` — status
- `POST` / `PATCH` / `DELETE /api/v1/roadmap/milestones`
- `PUT` milestone ↔ items links
- `POST` / `PATCH` / `DELETE /api/v1/tutorials`
- `POST` / `PATCH` / `DELETE /api/v1/downloads` (multipart upload to MinIO)

### Authorization (Cerbos)

Resources: `feedback_item`, `roadmap_milestone`, `tutorial_video`, `download_asset`

- Public: `view` (catalog/metadata; not file bytes for downloads)
- Authenticated: feedback `create` / `vote` / `comment`; download `download`
- Admin: `manage` on all of the above

## Site routes (warchi-site)

| Route | Purpose |
|-------|---------|
| `/` | Landing: hero, features, roadmap preview, tutorials teaser, downloads teaser, CTAs |
| `/roadmap` | Full roadmap; milestones with linked feedback cards |
| `/feedback` | Board: filters, sort, create button |
| `/feedback/:id` | Detail: body, status, vote, comments |
| `/tutorials` | List of embedded video tutorials |
| `/downloads` | Curated file library (notation packs, etc.); download after login |
| `/admin` | Admin: feedback statuses, milestones, tutorials, download uploads |

### UX rules

- Guests read landing, roadmap, board, comments, tutorials, and download **catalog**
- Create / vote / comment / **download file** → «Sign in» → app login → `returnUrl` back
- Video pages use provider iframe embeds from stored `embedUrl` / provider+id (allowlist hosts)
- Download cards show title, description, kind, size, version; button triggers authenticated file GET
- Visual language continues the current dark landing (not the editor UI)
- Port content from `public/landing.html` into Vue sections (no iframe)

## Error handling

- Unauthenticated mutation or download → `401`; site shows sign-in CTA
- Duplicate upvote → idempotent via unique `(itemId, userId)`; `DELETE` removes vote
- Rate limit create/comment/download per user; max title/body length
- Missing item / unpublished asset → `404` page on site
- Admin-only without role → `403`
- Invalid embed host rejected on admin save (allowlist)

## Security

- Public GET exposes at most author display name (no extra PII)
- Cookie session + CSRF on mutating methods
- Cookie `Domain` / CORS configured for parent domain covering site, app, API
- Comment/body stored as plain text or sanitized markdown — no raw HTML
- `returnUrl` allowlist for site origins only
- Embed iframes only for allowlisted video hosts
- Download endpoints require auth; do not expose long-lived public MinIO URLs in MVP (stream via arepos or short-lived signed URL tied to session check)
- Admin upload: size/type limits; prefer `application/json` for notation exports

## Testing

- **arepos**: controller/repository tests for feedback, roadmap, tutorials, downloads; authz matrix; vote uniqueness; download requires auth; unpublished hidden from public lists
- **warchi-site**: unit tests for API client, status formatting, embed URL building; e2e smoke later
- **warchi**: `returnUrl` allowlist and post-login redirect

## Landing migration

1. Move landing content into warchi-site Vue sections
2. In warchi: guest `/` → `VITE_SITE_URL` (or equivalent); authenticated → `/home`
3. Remove `landing.html`, related public assets, and `LandingView` iframe after cutover

## Out of scope (MVP)

- Separate accounts for the marketing site
- External feedback SaaS (Canny, etc.)
- SSG/Astro landing
- Full OAuth authorization-server flow (unless parent-domain cookies prove insufficient)
- Community / user-uploaded notation marketplace
- Publish-from-editor «make public» flow inside wArchi
- Self-hosted video files / custom player
- Rich attachments on feedback items
- Email notifications

## Success criteria

- Public visitor can understand the product, see roadmap, browse feedback, watch tutorials, and browse the download catalog without an account
- Logged-in wArchi user can create ideas/bugs, vote, comment, and download curated notation packs
- Admin can manage feedback statuses, roadmap milestones, tutorial embeds, and downloadable assets
- wArchi app no longer serves the marketing landing via iframe

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**wArchi** — Vue 3 + TypeScript frontend for architectural modeling. Canvas-based diagram editor, versioned entities (models, notations, types), bilingual UI (Russian default, English).

See `AGENTS.md` for detailed architecture, patterns, and conventions.

## Commands

```bash
npm run dev           # Dev server at http://localhost:5173
npm run build         # Type-check (vue-tsc) + production build
npm run test          # Vitest unit tests
npm run test:watch    # Tests in watch mode
npm run lint          # ESLint
npm run lint:fix      # ESLint auto-fix

# Single test file
npx vitest path/to/file.test.ts
# Tests by name pattern
npx vitest -t "pattern"

# E2E tests (Playwright, requires running backend)
npm run test:e2e          # Headless
npm run test:e2e:headed   # With browser UI
npm run test:e2e:ui       # Playwright UI mode
```

**Node requirement**: `>=20.19.0 <21 || >=22.12.0` (enforced by `engines` and prebuild check).

## Stack

Vue 3.5+ (Composition API, `<script setup>`), TypeScript 5.9+ (strict), Vite 7.3+, Vue Router, Vue I18n, Vitest, @ngroznykh/papirus (canvas engine).

No Pinia/Vuex — state managed via composables with module-level refs.

## Code Style

- Prettier: no semicolons, single quotes, 2-space indent, 100 char width
- BEM CSS classes, `<style scoped>`
- All user-facing strings in `src/i18n/messages.ts` with both `ru` and `en`
- Path alias: `@` → `src/`
- Unused function args prefixed with `_`

## Architecture Essentials

- **API layer**: `ApiResult<T>` discriminated union (`success: true | false`). Functions: `apiGet`, `apiPost`, `apiPut`, `apiDelete` in `src/composables/useApi.ts`
- **Entity versioning**: All entities use `VersionedEntity` with semver. CRUD via `useEntityList<T>` composable
- **Editor state**: Internal flags `_isNew`, `_isDirty`, `_isDeleted` on editor entities. Save order: create → update → delete
- **Custom properties**: JSON `attrs` field parsed/serialized. Internal flags stripped before API calls
- **Auth**: httpOnly cookie session with CSRF on mutating requests; localStorage stores only the user profile for UI state. 401/403 session failures clear local auth state; transient network failures do not force logout.
- **Batch save conflicts**: `POST /models/{id}/batch-save` sends `baseUpdatedAt`; HTTP 409 returns `conflicts[]`. UI offers reload vs force-overwrite with per-entity field diff. See in-app help at `/docs/models` (Saving → conflict).
- **Model live sync**: WebSocket/STOMP + polling hybrid for real-time diagram collaboration. Config via `VITE_MODEL_LIVE_SYNC_MODE` (ws/poll/hybrid)

## Feature Branch Workflow

When implementing features from `docs/` plans: create matching feature branches across all affected projects (warchi, papirus, arepos-server). For local papirus development, replace npm dependency with `"file:../papirus"` in package.json, revert before release.

## Environment

Copy `.env.example` to `.env.local`. Key vars: `VITE_API_PROXY_TARGET` (default `http://localhost:8080`), `VITE_MODEL_LIVE_SYNC_MODE`, `VITE_MODEL_LIVE_POLL_MS`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Warchi is a Vue 3 + TypeScript SPA for managing architectural models and notations. It provides a UI for creating, editing, and versioning domain models with support for components, relations, and custom properties.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Type-check and build for production
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix linting issues
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run Playwright E2E tests
```

## Architecture

### Tech Stack
- Vue 3 with Composition API (`<script setup>`)
- TypeScript with strict mode
- Vite for dev/build
- Vue Router 4 with lazy-loaded routes and auth guards
- Vitest + Playwright for testing

### Project Structure
```
src/
├── api/           # API configuration (config.ts)
├── components/    # Reusable Vue components
│   ├── cards/     # Entity card components
│   ├── forms/     # Form components
│   ├── layout/    # AppHeader, layout
│   ├── list/      # List header, search
│   └── modals/    # Create/delete modal dialogs
├── composables/   # Vue composition functions
│   ├── useAuth.ts       # Authentication state
│   ├── useApi.ts        # Typed fetch wrapper
│   └── useEntityList.ts # Generic CRUD for entities
├── features/      # Feature modules
│   ├── models/    # Models list and editor
│   └── notations/ # Notations list and editor (with sub-composables)
├── router/        # Vue Router config with auth guards
├── types/         # TypeScript interfaces (entities.ts)
├── utils/         # Utilities (version.ts for semver)
└── views/         # Top-level views (LoginView)
```

### Key Patterns

**State Management**: No central store - uses composables pattern. Each feature has its own composables for state.

**API Layer**: Native fetch with typed `ApiResult<T>` pattern in `useApi.ts`. Dev server proxies `/api/*` requests to backend.

**Entity Model**: Versioned entities with semantic versioning. Entities are grouped by name with version selection.

**Papirus Dependency**: Local sibling package (`../papirus`) provides canvas/diagram rendering for NotationEditor.

### Path Aliases
- `@/` resolves to `src/`

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```
VITE_API_PROXY_TARGET   # Backend API URL (default: http://localhost:8080)
VITE_API_BASE_URL       # API base URL
VITE_API_VERSION        # API version (default: v1)
VITE_CANVAS_*           # Canvas settings for diagram editor
```

## Key Files

- `src/router/index.ts` - Route definitions with auth guards
- `src/composables/useEntityList.ts` - Core CRUD logic for entity lists
- `src/features/notations/NotationEditor.vue` - Main diagram editor
- `src/types/entities.ts` - Core data type definitions

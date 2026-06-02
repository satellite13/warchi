# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

**wArchi** is a Vue 3 + TypeScript frontend application for architectural modeling workflows. It provides a web-based interface for managing architectural models, notations (visual languages), node/link types, and diagrams.

Key capabilities:
- **Models**: Hierarchical structures with folders, nodes, diagrams, and links
- **Notations**: Visual language definitions with components, relations, and styling rules
- **Types**: Reusable node types and link types with custom properties
- **Diagram Editor**: Canvas-based editor using Papirus rendering engine

The project uses bilingual UI (Russian/English) with Russian as the default language.

## Technology Stack

- **Framework**: Vue 3.5+ with Composition API (`<script setup>`)
- **Language**: TypeScript 5.9+ (strict mode enabled)
- **Build Tool**: Vite 7.3+
- **Routing**: Vue Router 5.0+
- **I18n**: Vue I18n 11.2+
- **Testing**: Vitest 4.0+
- **Canvas Engine**: @ngroznykh/papirus (proprietary rendering library)
- **UI Icons**: Material Symbols Outlined
- **Fonts**: Outfit (primary), Material Symbols Outlined (icons)

## Build, Test & Development Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:5173)

# Building
npm run build            # Type-check with vue-tsc and build for production
npm run preview          # Preview production build locally

# Testing
npm run test             # Run unit tests (Vitest)
npm run test:watch       # Run tests in watch mode

# Linting
npm run lint             # Run ESLint on src files
npm run lint:fix         # Auto-fix ESLint issues
```

**Running specific tests:**
```bash
npx vitest path/to/test.spec.ts    # Run specific test file
npx vitest -t "test name"          # Run tests matching pattern
```

## Code Style Guidelines

### TypeScript & Vue Conventions

- **Always use `<script setup lang="ts">`** - Options API is not used
- **Strict TypeScript**: Enable all strict flags, avoid `any`, use explicit types
- **Component naming**: PascalCase for file names (e.g., `EntityCard.vue`, `ModelEditor.vue`)
- **Composable naming**: `use*` prefix (e.g., `useAuth.ts`, `useEntityList.ts`)
- **Type naming**: PascalCase with descriptive suffixes (`*Response`, `*Request`, `*Attrs`, `*State`)

### Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Variables/Functions | camelCase | `loadItems`, `createItem` |
| Constants | UPPER_SNAKE_CASE | `STORAGE_KEY`, `API_BASE_URL` |
| Types/Interfaces | PascalCase | `VersionedEntity`, `EntityGroup` |
| CSS Classes | kebab-case (BEM-style) | `model-card`, `model-card__title` |
| Component files | PascalCase | `EntityCard.vue` |
| Composables | camelCase with use* | `useAuth.ts` |
| Emits (template) | kebab-case | `@version-change` |
| Emits (TS) | camelCase | `const emit = defineEmits<{ versionChange }>()` |

### Import Order

```typescript
// 1. Vue/core imports
import { ref, computed, onMounted } from "vue"

// 2. Router
import { useRoute, useRouter } from "vue-router"

// 3. External libraries
import { useI18n } from "vue-i18n"

// 4. Composables
import { useAuth } from "@/composables/useAuth"

// 5. Types
import type { NotationData } from "@/types/entities"

// 6. Components (alphabetical)
import EntityCard from "@/components/cards/EntityCard.vue"

// 7. Styles/Assets
import "@/style.css"
```

### File Organization

```
src/
├── api/              # API configuration
├── assets/           # Static assets (CSS, fonts)
├── components/       # Shared UI components
│   ├── cards/        # Entity cards
│   ├── forms/        # Form inputs
│   ├── layout/       # Layout components
│   ├── modals/       # Modal dialogs
│   └── ...
├── composables/      # Shared reactive logic
├── config/           # App configuration
├── features/         # Feature modules
│   ├── docs/         # Documentation viewer
│   ├── models/       # Model editor
│   ├── notations/    # Notation editor
│   └── types/        # Type editor
├── i18n/             # Internationalization
├── layouts/          # Page layouts
├── router/           # Vue Router configuration
├── types/            # Global TypeScript types
├── utils/            # Utility functions
└── views/            # Top-level page components
```

## Key Architectural Patterns

### State Management (No Pinia/Vuex)

The project uses **composition functions** instead of a global store:

```typescript
// Global state via module-level refs
const currentUser = ref<User | null>(loadStoredUser())

export function useAuth() {
  // Return reactive state and methods
  return { currentUser, isAuthenticated, login, logout }
}
```

### API Layer Pattern

All API calls use the `ApiResult<T>` discriminated union:

```typescript
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError }

// Usage
const result = await apiGet<User>("/auth/me")
if (result.success) {
  // result.data is T
} else {
  // result.error is ApiError
}
```

Key API functions:
- `apiFetch<T>(path, options)` - Low-level fetch wrapper
- `apiGet<T>(path)` - GET request
- `apiPost<T>(path, body)` - POST request
- `apiPut<T>(path, body)` - PUT request
- `apiDelete<T>(path)` - DELETE request

### Entity Versioning Pattern

All major entities are versioned using semantic versioning:

```typescript
interface VersionedEntity {
  id: string
  name: string
  version: string  // Format: X.Y.Z
  ownerId: string
  // ...
}
```

Entities are grouped by name with version selection:
- Use `useEntityList<T>` composable for CRUD operations
- Version comparison uses `compareVersions()` from `@/utils/version`
- Auto-suggest next version with `bumpMinor()` (1.2.3 → 1.3.0)

### Editor State Pattern

Editor components track changes using internal flags:

```typescript
interface EditorNode {
  // ...API fields
  parsedAttrs: ModelNodeAttrs  // Parsed from JSON attrs
  _isNew?: boolean             // Created in this session
  _isDirty?: boolean           // Modified
  _isDeleted?: boolean         // Marked for deletion
}
```

Save operations process entities in order:
1. Create new entities
2. Update modified entities
3. Delete marked entities

**Batch save conflict (HTTP 409):** `POST /models/{id}/batch-save` sends `baseUpdatedAt` on updates; mismatch yields `conflicts[]`. In the UI ([`ModelEditor.vue`](src/features/models/ModelEditor.vue)), users choose **reload from server** vs **force overwrite**, with per-entity **field diff** compare (differing fields only; see [`batchSaveConflictDisplay.ts`](src/features/models/utils/batchSaveConflictDisplay.ts)). Product docs: [`docs/plans/model-batch-save-conflicts.md`](docs/plans/model-batch-save-conflicts.md); in-app help: `/docs/models` (Saving → conflict).

### Custom Properties System

Flexible schema using JSON `attrs` field:

```typescript
// Define in src/features/*/notationAttrs.ts or modelAttrs.ts
interface CustomProperty {
  id: string
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum'
  required: boolean
  // ...validation fields
}

// Parse/serialize helpers
parseEntityAttrs(attrs: string | null): EntityAttrs
serializeEntityAttrs(attrs: EntityAttrs): string
```

Internal flags (like `_fromType`) are stripped before serialization.

### Authentication & Security

- JWT tokens stored in localStorage
- Automatic token refresh on 401 responses
- Custom events for auth state changes (`warchi-auth-updated`, `warchi-auth-cleared`)
- Router guards check `isAuthenticated` and `requiresRole`

## Testing Guidelines

### Unit Testing with Vitest

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock external dependencies
vi.mock("@/composables/useApi", () => ({
  apiGet: vi.fn()
}))

describe("feature", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it("should do something", () => {
    // Test implementation
  })
})
```

### Testing Best Practices

- Mock API calls using `vi.mock()`
- Test composables within `effectScope()` for proper cleanup
- Use `vi.hoisted()` for mock setup that needs to be shared

## Environment Configuration

Create `.env.local` from `.env.example`:

```bash
# API Configuration
VITE_API_PROXY_TARGET=http://localhost:8080   # Backend URL for dev proxy
VITE_API_BASE_URL=                            # API base path (usually empty)
VITE_API_VERSION=v1                           # API version prefix

# Model live sync (optional)
VITE_MODEL_LIVE_SYNC_MODE=hybrid              # ws | poll | hybrid
VITE_MODEL_LIVE_POLL_MS=15000                 # polling interval in ms
```

## Styling Guidelines

### CSS Variables

All styling uses CSS variables defined in `src/style.css`:

```css
/* Backgrounds */
--base-bg: #f4f2ef
--surface: #ffffff
--surface-muted: #faf9f7

/* Text */
--base-text: #1a1a1a
--text-muted: #5c5c5c
--text-subtle: #9a9a9a

/* Primary accent */
--primary: #7c5cfc
--primary-hover: #6a4ce0

/* Status colors */
--danger: #dc3545
--warning: #e67e22
--success: #1ea355
```

### Component Styling

- Use `<style scoped>` for component styles
- BEM naming: `block__element--modifier`
- Avoid deep selectors; use CSS variables for theming

## Internationalization (i18n)

The app supports Russian (default) and English:

```typescript
import { useI18n } from "vue-i18n"

const { t } = useI18n()

// Usage
t("common.save")           // Simple key
t("models.entityName")     // Nested key
t("home.versions", { count: 5 })  // Interpolation
```

All user-facing strings must be in `src/i18n/messages.ts` with both `ru` and `en` translations.

## Common Tasks

### Adding a New Entity Type

1. Add API types to `src/types/api.ts`
2. Add entity interface to `src/types/entities.ts`
3. Create feature directory under `src/features/`
4. Create composable extending `useEntityList<T>`
5. Add route in `src/router/index.ts`
6. Add translations to `src/i18n/messages.ts`

### Adding a New Custom Property Type

1. Extend `CustomPropertyType` union in `*Attrs.ts`
2. Update normalization in `normalizeCustomProperties()`
3. Add UI controls in component forms
4. Update serialization if needed

**Model nodes:** type-level properties live in `nodes.attrs.typeProperties`; notation-component properties stay diagram-scoped — see `docs/model-node-type-vs-component-properties.md`.

## Deployment

### Docker Build

```bash
# Production image
docker build --build-arg VITE_API_BASE_URL=/api -t warchi:latest .
```

### Kubernetes Deployment

```bash
# Standard deployment
./scripts/deploy.sh

# Blue/Green deployment
BLUE_GREEN=true BG_SWITCH=true IMAGE_TAG=0.0.22 ./scripts/deploy.sh
```

Environment variables for deployment:
- `NAMESPACE` - Kubernetes namespace (default: `arch`)
- `RELEASE_NAME` - Helm release name (default: `warchi`)
- `IMAGE_TAG` - Docker image tag
- `BLUE_GREEN` - Enable blue/green deployment
- `BG_SWITCH` - Switch traffic after deployment

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/model-node-type-vs-component-properties.md` | Node **type** vs **notation component** custom properties, `typeProperties`, label template `#{…}` / `${…}`, UI и ключевой код |
| `src/router/index.ts` | Route definitions with auth guards |
| `src/composables/useApi.ts` | Typed API fetch with error handling |
| `src/composables/useAuth.ts` | Authentication state and methods |
| `src/composables/useEntityList.ts` | Generic CRUD for versioned entities |
| `src/types/entities.ts` | Core entity interfaces |
| `src/types/api.ts` | API request/response types |
| `src/i18n/messages.ts` | All UI translations |
| `vite-plugin-version.ts` | Build-time version injection |

## Security Considerations

- JWT tokens are stored in localStorage (vulnerable to XSS)
- All API calls include Authorization header
- Automatic logout on 401/403 responses
- Router guards prevent unauthorized access
- User input is validated before API calls

## License

Dual-licensed:
- AGPL-3.0-or-later for open source usage
- Commercial license available for proprietary usage

See `LICENSE` and `LICENSE_COMMERCIAL.md` for details.

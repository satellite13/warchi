# Warchi Project Context

## Project Overview

**Warchi** is a Single Page Application (SPA) for architectural modeling workflows. It provides a UI for managing models, notations, visual styles, and versioned entities with support for diagram editing on top of the Papirus canvas engine.

### Key Features
- Notation editor with Papirus canvas (selection, transforms, auto-layout)
- JSON import/export for notation data
- Component and relation style customization
- Tags, custom attributes, and relation rules editor
- Versioned models and notations with semantic versioning
- Document management with markdown support
- Blue/green deployment support via Helm

### Tech Stack
- **Frontend Framework:** Vue 3 (Composition API, `<script setup>`)
- **Language:** TypeScript (strict mode)
- **Build Tool:** Vite
- **Routing:** Vue Router 4
- **Testing:** Vitest (unit), Playwright (E2E)
- **Styling:** Scoped CSS with CSS variables
- **Diagram Engine:** `@ngroznykh/papirus` (local sibling package)
- **Deployment:** Docker, Nginx, Helm (Kubernetes)

## Project Structure

```
warchi/
├── src/
│   ├── api/           # API configuration (config.ts)
│   ├── assets/        # Static assets
│   ├── components/    # Reusable Vue components
│   │   ├── cards/     # Entity card components
│   │   ├── forms/     # Form components
│   │   ├── layout/    # AppHeader, layout components
│   │   ├── list/      # List header, search
│   │   └── modals/    # Modal dialogs
│   ├── composables/   # Shared Vue composition functions
│   ├── config/        # App configuration
│   ├── features/      # Feature modules
│   │   ├── docs/      # Document management
│   │   ├── models/    # Models list and editor
│   │   ├── notations/ # Notations list and editor
│   │   └── types/     # Entity types management
│   ├── i18n/          # Internationalization
│   ├── layouts/       # Layout components
│   ├── router/        # Vue Router configuration
│   ├── types/         # TypeScript interfaces
│   ├── utils/         # Utility functions
│   ├── views/         # Top-level route views
│   ├── App.vue        # Root component
│   ├── main.ts        # Application entry point
│   └── style.css      # Global styles
├── charts/            # Helm charts for Kubernetes deployment
├── config/            # Nginx configuration
├── docs/              # Documentation
├── public/            # Public static files
├── tests/             # Test files (E2E, unit)
├── .env.example       # Environment variables template
├── .prettierrc        # Prettier configuration
├── eslint.config.js   # ESLint configuration
├── tsconfig.json      # TypeScript configuration
├── vite.config.ts     # Vite configuration
├── Dockerfile         # Docker build configuration
├── deploy.sh          # Deployment script (legacy + blue/green)
└── package.json       # Dependencies and scripts
```

## Building and Running

### Prerequisites
- Node.js 18+
- npm 9+

### Installation
```bash
npm install
cp .env.example .env.local
```

### Development
```bash
npm run dev          # Start dev server at http://localhost:5173
```

The dev server proxies `/api/*` requests to the backend (default: `http://localhost:8080`).

### Build
```bash
npm run build        # Type-check and production build
npm run preview      # Preview production build
```

### Testing
```bash
npm run test              # Run unit tests (Vitest)
npm run test:watch        # Run tests in watch mode
npm run test:e2e          # Run Playwright E2E tests
```

### Linting
```bash
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix linting issues
```

### Docker Build
```bash
./buildImage.sh           # Build Docker image
```

### Deployment
```bash
# Legacy mode (recreates release)
./deploy.sh

# Blue/Green mode
BLUE_GREEN=true BG_SWITCH=true IMAGE_TAG=0.0.21 ./deploy.sh

# Build image flag
BUILD_IMAGE=false ./deploy.sh
```

## Environment Variables

Configure via `.env.local`:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | Backend API URL for dev proxy |
| `VITE_API_BASE_URL` | `/api` | API base URL |
| `VITE_API_VERSION` | `v1` | API version prefix |
| `VITE_CANVAS_*` | Various | Canvas/editor settings (zoom, grid, pan, etc.) |

See `.env.example` for full list of canvas configuration options.

## Development Conventions

### Code Style

**Vue Components:**
- Use `<script setup lang="ts">` syntax
- Component files: PascalCase (e.g., `EntityCard.vue`)
- Scoped styles with BEM naming: `block__element--modifier`

**TypeScript:**
- Strict mode enabled
- Avoid `any`; use explicit types, generics, utility types
- Type naming: PascalCase with descriptive suffixes (`Response`, `Request`, `Attrs`, `State`)

**Naming:**
- Variables/functions: camelCase (`loadItems`, `createItem`)
- Constants: UPPER_SNAKE_CASE (`STORAGE_KEY`)
- CSS classes: kebab-case (`model-card`, `model-card__title`)
- Composables: `use*` prefix (`useAuth`, `useEntityList`)

**Import Order:**
```typescript
// 1. Vue/core imports
import { ref, computed } from "vue"

// 2. Router
import { useRouter } from "vue-router"

// 3. External libraries
// 4. Composables
import { useAuth } from "@/composables/useAuth"

// 5. Types
import type { Entity } from "@/types/entities"

// 6. Components
// 7. Styles/Assets
```

### Architecture Patterns

**State Management:**
- No central store (Pinia/Vuex)
- Use composables per feature for state
- Entities grouped by name with version selection
- Change tracking via `_isNew`, `_isDirty`, `_isDeleted` flags

**API Layer:**
- Typed `ApiResult<T>` pattern: `{ success: true; data: T } | { success: false; error: ApiError }`
- Error messages localized (Russian)
- Automatic token refresh on 401
- Handle 404 (not found) and 409 (conflict) specially

**Versioning:**
- Semantic versioning (X.Y.Z format)
- Use `isValidVersion()` from `@/utils/version`
- Entity list auto-selects latest version

**Custom Properties:**
- Defined in `notationAttrs.ts` or `modelAttrs.ts`
- Types: string, number, boolean, enum
- Stored as JSON in `attrs` field
- Internal flags (`_fromType`) stripped before serialization

### Key Files Reference

| File | Description |
|------|-------------|
| `src/router/index.ts` | Route definitions with auth guards |
| `src/composables/useAuth.ts` | Authentication state and JWT management |
| `src/composables/useApi.ts` | Typed fetch wrapper with `ApiResult<T>` |
| `src/composables/useEntityList.ts` | Generic CRUD for entity lists |
| `src/types/entities.ts` | Core entity interfaces |
| `src/features/notations/NotationEditor.vue` | Main diagram editor |
| `src/features/models/ModelEditor.vue` | Model editor |
| `src/api/config.ts` | API URL configuration |

## Testing

- **Unit tests:** Vitest, files named `*.spec.ts` or `*.test.ts`
- **Component tests:** `@vue/test-utils`
- **E2E tests:** Playwright
- Mock API with `vi.mock()` or manual `apiFetch` overrides

Run specific tests:
```bash
npx vitest path/to/test.spec.ts
npx vitest -t "test description"
```

## Deployment Details

### Helm Chart Variables
- `NAMESPACE`: Kubernetes namespace (default: `arch`)
- `RELEASE_NAME`: Helm release name (default: `warchi`)
- `CHART_PATH`: Helm chart path (default: `charts/warchi`)
- `WAIT_TIMEOUT`: Readiness timeout in seconds (default: `180`)
- `INGRESS_HOST`: Ingress host for output hints (default: `warchi.local`)

### Blue/Green Deployment
- Deploys to inactive color (blue/green)
- Verifies readiness before traffic switch
- `BG_SWITCH=false` to deploy without switching traffic

## License

Dual licensing:
- **AGPL-3.0-or-later** for open-source usage
- **Commercial license** for proprietary/closed-source usage

See `LICENSE` and `LICENSE_COMMERCIAL.md` for details.

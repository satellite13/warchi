# AGENTS.md

This file provides guidance to AI coding agents (such as opencode) when working with code in this repository.

## Build/Lint/Test Commands

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Type-check and build for production
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
```

**Note**: The project currently has no npm scripts configured for linting or test execution. Add these to `package.json`:
```json
"lint": "eslint src --ext .vue,.ts,.tsx --cache",
"lint:fix": "eslint src --ext .vue,.ts,.tsx --fix",
"test": "vitest run",
"test:watch": "vitest"
```

**Running single tests**: Vitest supports running specific test files or matching tests via CLI:
```bash
npx vitest path/to/test.spec.ts
npx vitest -t "test description"
```

## Code Style Guidelines

### TypeScript & Vue

- **Vue 3 Composition API**: All components use `<script setup lang="ts">` syntax
- **Strict TypeScript**: Use explicit types, avoid `any`. Leverage utility types and generics
- **Component naming**: PascalCase for file names (e.g., `EntityCard.vue`)
- **Composable naming**: `use*` prefix (e.g., `useAuth.ts`, `useEntityList.ts`)
- **Type naming**: PascalCase suffixes (`Response`, `Request`, `Attrs`, `State`)

### Naming Conventions

- **Variables/Functions**: camelCase (`loadItems`, `createItem`, `searchQuery`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `STORAGE_KEY`)
- **Types/Interfaces**: PascalCase (`VersionedEntity`, `EntityGroup`)
- **CSS Classes**: kebab-case (`model-card`, `model-card__title`)
- **Emits**: kebab-case in template, camelCase in TypeScript (`version-change`)

### File Organization

- **Composables**: `src/composables/` for shared logic, `src/features/*/composables/` for feature-specific
- **Types**: `src/types/` for global types, `src/features/*/types.ts` for feature-specific
- **API**: `src/api/` for configuration, `src/features/*/types.ts` for feature API types
- **Views**: Top-level route components in `src/views/`
- **Features**: Feature modules under `src/features/` (models, notations, types, docs)

### Import Order

```typescript
// 1. Vue/core imports
import { ref, computed, onMounted } from "vue"

// 2. Router
import { useRoute, useRouter } from "vue-router"

// 3. External libraries (e.g., Papirus)
// 4. Composables
import { useAuth } from "@/composables/useAuth"

// 5. Types
import type { NotationData } from "@/types/entities"

// 6. Components (alphabetical)
// 7. Styles/Assets
```

### API Error Handling

- Use `ApiResult<T>` pattern: `{ success: true; data: T } | { success: false; error: ApiError }`
- Extract error messages from API responses intelligently (see `useApi.ts:17-38`)
- Handle 404 (not found) and 409 (conflict) status codes specially
- Always check `result.success` before accessing `result.data`

### State Management Pattern

- **No central store**: Use composition functions per feature
- **Entity groups**: Entities grouped by name with version selection
- **Change tracking**: Use `_isNew`, `_isDirty`, `_isDeleted` flags for editor state
- **Reactive refs**: Use `ref()` for primitive state, `computed()` for derived state

### Versioning

- Use semantic versioning (X.Y.Z format)
- Validate versions with `isValidVersion()` from `@/utils/version`
- bumpMinor automatically increments minor version (1.2.3 → 1.3.0)
- Entity list automatically selects latest version when groups change

### Custom Properties System

- Define in `src/features/*/notationAttrs.ts` (for notations) or `modelAttrs.ts` (for models)
- Support types: string, number, boolean, enum
- Store as JSON in `attrs` field, parse/serialize with dedicated functions
- Internal flags (`_fromType`) stripped before serialization

### Styling

- CSS variables defined in `src/style.css` (use palette colors)
- Component styles scoped with `<style scoped>`
- BEM-style class naming: `block__element--modifier`
- Cards have auto-generated gradient colors based on ID hash

### Error Handling

- Display user-friendly error messages (Russian)
- Use context-aware messages (e.g., "Нотация не найдена" vs "Notation not found")
- Log technical details but show simplified messages to users
- Form validation returns error strings or `null` for success

### API Configuration

- Proxy `/api/*` to backend via Vite config (`VITE_API_PROXY_TARGET`)
- Default backend: `http://localhost:8080`
- API version prefix: `/api/v1/` (configure via `VITE_API_VERSION`)
- Authentication: JWT stored in localStorage (see `useAuth.ts`)

## Key Patterns

1. **Generic CRUD composables**: `useEntityList<T>` handles lists, create/delete for any entity type
2. **Parallel API fetches**: Use `Promise.all()` for dependent endpoints
3. **Type-safe responses**: Map raw API types to editor types with parsed attrs
4. **Debounce version suggestions**: Auto-suggest version bump on name change
5. **Lazy loading**: Routes use dynamic imports (`() => import(...)`)
6. **Auth guards**: Check `isAuthenticated` in router navigation guards

## Environment Variables

```env
VITE_API_PROXY_TARGET=http://localhost:8080   # Backend URL
VITE_API_BASE_URL=/api                         # API base path
VITE_API_VERSION=v1                            # API version
VITE_CANVAS_*=...                              # Diagram editor settings
```

## Key Files Reference

- `src/router/index.ts`: Route definitions with auth guards
- `src/composables/useEntityList.ts`: Generic entity list CRUD
- `src/composables/useApi.ts`: Typed fetch wrapper with `ApiResult<T>`
- `src/features/notations/NotationEditor.vue`: Main diagram editor
- `src/features/models/types.ts`: Model editor type definitions
- `src/types/entities.ts`: Core entity interfaces
- `src/features/notations/notationAttrs.ts`: Custom properties parsing/serialization

## Testing

- Unit tests: Vitest (configure test environment in `vitest.config.ts`)
- Component testing: Use `@vue/test-utils` with Vue Test Utils
- E2E tests: Playwright (configure in `playwright.config.ts`)
- Test file naming: `*.spec.ts` or `*.test.ts`
- Mock API responses using `vi.mock()` or manual `apiFetch` overrides

## Common Tasks

**Adding a new entity type**:
1. Add API types to `src/types/api.ts`
2. Create entity-specific composable extending `useEntityList`
3. Register route in `src/router/index.ts`
4. Add to navigation in layout components

**Adding a new custom property**:
1. Define in relevant `*Attrs.ts` file
2. Update normalization functions
3. Add form inputs in component
4. Serialize with `stripInternalFlags` before saving

**Fixing a bug**:
1. Check if error is in API response handling
2. Verify type definitions match API contracts
3. Check reactive dependencies in computed properties
4. Test with actual API (ensure backend is running)

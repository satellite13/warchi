# Warchi

Frontend SPA for architectural modeling workflows: managing models, notations, visual styles, and versioned entities.

Русская версия: `README.ru.md`

## Features

- Notation editor on top of Papirus canvas (selection, transforms, auto-layout)
- JSON import/export for notation data
- Component and relation style customization
- Tags, custom attributes, and relation rules editor
- Versioned models and notations
- Blue/green deployment support via Helm and `deploy.sh`

## Tech Stack

- Vue 3 (`<script setup>`, Composition API)
- TypeScript (strict mode)
- Vite
- Vue Router 4
- Vitest
- Playwright

## Requirements

- Node.js 18+
- npm 9+
- Papirus NPM package (`@ngroznykh/papirus`)

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

App runs on `http://localhost:5173` and proxies `/api/*` to backend.

## NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview built app |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run Playwright tests |

## Deployment (`deploy.sh`)

`./deploy.sh` supports two modes:

- **Legacy**: recreates release
- **Blue/Green**: deploys inactive color, verifies readiness, optionally switches traffic

Main environment flags:

| Variable | Default | Purpose |
|---|---|---|
| `NAMESPACE` | `arch` | Kubernetes namespace |
| `RELEASE_NAME` | `warchi` | Helm release name |
| `CHART_PATH` | `charts/warchi` | Helm chart path |
| `VALUES_FILE` | `charts/warchi/values.yaml` | Values file |
| `BUILD_IMAGE` | `true` | Build Docker image before deploy |
| `WAIT_TIMEOUT` | `180` | Readiness timeout in seconds |
| `INGRESS_HOST` | `warchi.local` | Ingress host in output hints |
| `IMAGE_TAG` | `""` | Image tag override |
| `BLUE_GREEN` | `false` | Enable blue/green mode |
| `BG_SWITCH` | `true` | Switch traffic after green/blue verification |
| `SERVICE_NAME` | `warchi` | Service used to detect active color |

Examples:

```bash
./deploy.sh
BUILD_IMAGE=false ./deploy.sh
BLUE_GREEN=true BG_SWITCH=true IMAGE_TAG=0.0.10 ./deploy.sh
BLUE_GREEN=true BG_SWITCH=false IMAGE_TAG=0.0.10 ./deploy.sh
```

## Environment Variables

Configured via `.env.local`:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | Backend API URL |
| `VITE_API_BASE_URL` | empty | API base URL |
| `VITE_API_VERSION` | `v1` | API version |
| `VITE_CANVAS_*` | empty | Canvas/editor settings |

## Architecture Notes

- State management uses composables (no global store)
- API layer is based on typed `ApiResult<T>` wrappers
- Entities are versioned and grouped by name
- Notation editor uses Papirus rendering engine

## Open Source Readiness

For public release preparation, see:

- `docs/OPEN_SOURCE_PREPARATION.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`

## License

License is not finalized yet. Add `LICENSE` before public release.

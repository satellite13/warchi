# Contributing to Warchi

Thanks for your interest in contributing.

## Development Prerequisites

- Node.js 18+
- npm 9+
- Papirus NPM package (`@ngroznykh/papirus`)

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Quality Checks

Before opening a pull request, run:

```bash
npm run lint
npm run build
npm run test
```

If deployment logic was changed:

```bash
helm lint ./charts/warchi
bash -n ./scripts/deploy.sh
```

## Branching and Pull Request Workflow

1. Create a feature branch from the current default branch (`master`/`main`, depending on repository settings)
2. Keep commits focused and atomic
3. Add/update tests for behavior changes
4. Update docs when behavior or operations changed
5. Open PR with context and a test plan

## Commit Guidelines

- Use clear, imperative commit titles
- Explain *why* the change is needed
- Avoid mixing unrelated refactors and functional updates

## Pull Request Checklist

- [ ] Lint/build/tests pass locally
- [ ] UI behavior is manually verified for changed flows
- [ ] Documentation is updated when needed
- [ ] No secrets or private data were added

## Reporting Issues

Please include:

- expected behavior
- actual behavior
- reproduction steps
- logs or screenshots (if available)

# Open Source Preparation Checklist

This document helps prepare `warchi` for public open-source release.

## 1. Legal and Repository Metadata

- [ ] Choose a license (`MIT`, `Apache-2.0`, `GPL-3.0`, etc.) and add `LICENSE`
- [ ] Verify dependency license compatibility
- [ ] Add repository description, topics, and homepage
- [ ] Add maintainer/contact information

## 2. Security Readiness

- [ ] Remove or replace non-production defaults and private values
- [ ] Ensure no secrets exist in committed files (`.env`, scripts, values)
- [ ] Keep `SECURITY.md` up to date with a private reporting channel
- [ ] Review deployment defaults and environment expectations

## 3. Documentation Baseline

- [x] `README.md` and `README.ru.md`
- [x] `CONTRIBUTING.md` and `CONTRIBUTING.ru.md`
- [x] `SECURITY.md` and `SECURITY.ru.md`
- [x] `CODE_OF_CONDUCT.md` and `CODE_OF_CONDUCT.ru.md`
- [ ] Add architecture diagram (optional)
- [ ] Add FAQ for public users (optional)

## 4. Build and Test Quality Gate

- [ ] CI pipeline for lint/build/test on pull requests
- [ ] Optional: E2E checks in CI
- [ ] Document minimal supported Node/npm versions

Recommended CI baseline:

1. `npm run lint`
2. `npm run build`
3. `npm run test`
4. `helm lint ./charts/warchi`

## 5. Release Process

- [ ] Define versioning policy and release cadence
- [ ] Maintain `CHANGELOG.md` and `CHANGELOG.ru.md`
- [ ] Define release tag format (`vX.Y.Z`)
- [ ] Define container image publishing policy

## 6. Kubernetes/Operations Readiness

- [ ] Validate legacy and blue/green deploy flows
- [ ] Document rollback procedure
- [ ] Document required cluster prerequisites
- [ ] Verify chart defaults are safe and predictable

## 7. Sensitive Data Audit

Before public release, verify:

- [ ] No secrets in repository history and tracked files
- [ ] No internal-only domains or credentials in docs/scripts
- [ ] No personal data in examples or fixtures

## Pre-Release Command Checklist

```bash
npm run lint
npm run build
npm run test
helm lint ./charts/warchi
bash -n ./deploy.sh
```

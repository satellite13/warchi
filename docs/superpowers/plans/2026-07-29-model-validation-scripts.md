# Model Validation Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship shareable JS validation scripts (catalog CRUD + shares) and run them in a browser Dedicated Worker against a model/open diagram with a read-only API and Issues UI.

**Architecture:** arepos-server persists `ValidationScript` as a top-level shareable catalog resource. warchi provides catalog editor (CodeMirror 6) and Model Editor Run flow: build immutable snapshot → Worker evaluates script with sandbox helpers → Issues panel. No server-side execute and no model mutations in v1.

**Tech Stack:** Kotlin/Spring/Liquibase/Cerbos; Vue 3 + TypeScript; CodeMirror 6; Vitest / JUnit.

**Spec:** `docs/superpowers/specs/2026-07-28-model-validation-scripts-design.md`

**Branches:** `feat/model-validation-scripts` in warchi and arepos-server.

---

## File map

### arepos-server

| File | Responsibility |
|------|----------------|
| `db/changelog/046-add-validation-scripts.sql` | Table + shares CHECK |
| `model/ValidationScripts.kt` | JPA entity |
| `repository/ValidationScriptsRepository.kt` | Persistence |
| `dto/.../ValidationScriptDtos.kt` | Request/response |
| `controller/ValidationScriptsController.kt` | CRUD |
| `ShareResourceType` + Cerbos + TopLevelAccess + AccessShares + Permissions | Authz wiring |
| `authz/cerbos/policies/resource.validation_script.yaml` | Policy |
| Controller/repository tests | ACL + CRUD |

### warchi

| File | Responsibility |
|------|----------------|
| `composables/useValidationScripts.ts` | API client |
| `features/validation-scripts/**` | Catalog UI + CodeMirror editor |
| `validationScriptApiCatalog.ts` | Completion metadata |
| `validationScriptApi.ts` + helpers | Sandbox API (shared with worker/tests) |
| `validationScriptWorker.ts` + host runner | Isolate run |
| `buildValidationSnapshot.ts` | Editor → snapshot |
| Model Editor dialog + issues panel | Run UX |
| Router, nav, i18n, `ShareResourceType` | Wiring |

---

### Task 1: Backend — DB + entity + ShareResourceType

**Files:** create migration `046`, entity, repository; extend `ResourceShares.kt` CHECK via migration; wire Cerbos enums.

- [ ] Create `046-add-validation-scripts.sql` (table `validation_scripts`: id, name, description, source text, owner, created_at, updated_at, attrs jsonb; unique (owner, name); audit trigger; extend resource_shares check with `VALIDATION_SCRIPT`)
- [ ] Register changeset in `db.changelog-master.yaml`
- [ ] Add entity + repository
- [ ] Add `ShareResourceType.VALIDATION_SCRIPT`, Cerbos kind/mapper, policy YAML, TopLevelAccess + ResourceAccessService + AccessShares/Permissions when-branches
- [ ] Tests: Cerbos mapping; CRUD controller ACL (owner/view/edit/deny); 400 empty name/source
- [ ] `./gradlew test --tests '*ValidationScript*'` and CerbosAuthzModelTest

### Task 2: Backend — REST controller

- [ ] DTOs + mapper + `ValidationScriptsController` (`/api/v1/validation-scripts`)
- [ ] Create always sets owner = current user; hard delete; clear shares on delete
- [ ] List filters viewable scripts (same approach as node shapes)

### Task 3: warchi — API types + composable + catalog shell

- [ ] Extend `ShareResourceType` / permission types
- [ ] `useValidationScripts.ts`
- [ ] Routes `/validation-scripts`, `/validation-scripts/:id`
- [ ] List+detail page modeled on shapes (without soft-delete admin)
- [ ] ShareAccessModal wiring + nav + i18n

### Task 4: CodeMirror editor + API catalog

- [ ] Add CodeMirror 6 deps
- [ ] `validationScriptApiCatalog.ts`
- [ ] `ValidationScriptCodeEditor.vue` with JS highlight + custom completions
- [ ] Unit test: catalog covers all public bindings

### Task 5: Sandbox API + Worker runner

- [ ] Snapshot types + `buildValidationSnapshot.ts` (+ tests)
- [ ] Helpers (`diagramNodes`, `nodesOfType`, `linksBetween`, `findDuplicateLinks`, …) + tests / golden scripts
- [ ] Worker + host runner (timeout 5s, issue cap 500, Cancel)
- [ ] In-process runner test double for Vitest

### Task 6: Model Editor Run UX

- [ ] Dialog: pick script → Run / Cancel
- [ ] Issues panel; click target → select tree/canvas / open diagram
- [ ] Toolbar entry + i18n
- [ ] Smoke tests with mocks

### Task 7: Verification

- [ ] arepos-server targeted tests green
- [ ] warchi `npx vitest` for new tests + lint on touched files
- [ ] Manual smoke checklist in PR description

---

## Notes

- Prefer NodeShapes patterns for standalone catalog; hard delete (no soft-delete admin flow).
- Do not implement mutate API, server run, or script semver.
- Commits: small, per task; only when user asks or at natural task boundaries if user already approved committing — otherwise leave working tree for review.

# OEF Organizations Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import OEF `organizations` into wArchi Directory folders with correct element `parentNodeId` and diagram `nodeId`.

**Architecture:** Server StAX normalize emits `organizations[]`; client ensures Directory type, builds Directory+element creates in parent-before-child order, chunked batch-save unchanged.

**Tech Stack:** Kotlin/Spring (arepos), Vue/TS (warchi), Vitest/JUnit.

---

### Task 1: arepos — parse organizations in OefParseService

**Files:**
- Modify: `arepos-server/.../dto/oef/OefNormalizeDtos.kt`
- Modify: `arepos-server/.../service/OefParseService.kt`
- Modify: `arepos-server/.../test/.../OefParseServiceTest.kt`
- Modify: fixture `oef/container-assoc-to-flow.xml` or Main-like orgs in fixture

- [ ] Add DTO nodes for organizations (folder vs leaf with refKind)
- [ ] StAX-parse `<organizations>` items (label / identifierRef / nested)
- [ ] Resolve refKind from element/relationship/view id sets
- [ ] Tests green

### Task 2: warchi — types + draft + org apply helpers

**Files:**
- Modify: `types.ts`, `oefNormalizeApi.ts`, `oefDraftBuilder.ts`
- Create: `organizationImport.ts` (+ test)
- Modify: `oefToBatchSave.ts` (+ test)

- [ ] Carry organizations on parsed model / draft
- [ ] Build Directory creates + parent maps; skip relations-only
- [ ] Diagram nodeId from Views folder

### Task 3: warchi — ensure Directory type + wizard UX

**Files:**
- Modify: `useOefImport.ts`, `ModelImportWizard.vue`, `i18n/locales/models.ts`

- [ ] Auto-create Directory via POST /node-types
- [ ] Stats/warnings for folders / skipped Relations / type created

### Task 4: Deploy local k8s

- [ ] Commit + deploy arepos then warchi

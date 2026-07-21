# OEF server normalize + chunked apply — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Large OEF imports work via server normalize + client chunked batch-save without nginx 413.

**Architecture:** `POST /models/{id}/oef/normalize` (multipart) returns compact `OefParsedModel`-shaped JSON; wizard maps as today; apply sends batch-save in chunks ≤800 nodes/links and 1 diagram per request.

**Tech Stack:** Kotlin/Spring (arepos-server), Vue/TS (warchi), nginx proxy limits

---

## File map

### arepos-server
- `dto/oef/OefNormalizeDtos.kt` — response DTOs
- `service/OefParseService.kt` — XML parse + validation
- `controller/OefNormalizeController.kt` — endpoint
- tests under `src/test/...`
- `application.yaml` — multipart size for large OEF
- nginx is in **warchi** `config/default.conf`

### warchi
- `config/default.conf` — `location` 100m for normalize
- `src/features/models/utils/oef/oefNormalizeApi.ts` — upload helper
- `src/features/models/utils/oef/chunkOefBatchSave.ts` — planner + apply
- `ModelImportWizard.vue` / `useOefImport.ts` — wire normalize + chunks
- i18n + docs + CHANGELOG

---

## Tasks

- [x] T1: Branch `feat/oef-server-normalize` in warchi + arepos-server
- [x] T2: arepos DTOs + parse/validate service + controller + tests
- [x] T3: Spring multipart + warchi nginx location 100m
- [x] T4: warchi normalize API + wizard analyze step
- [x] T5: warchi chunked batch-save apply + tests
- [x] T6: i18n, in-app docs, CHANGELOG; mark spec approved

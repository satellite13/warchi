# Model package import — conflict details + notation reuse

Date: 2026-08-07  
Status: approved  
Repos: warchi, arepos-server  
Related: `2026-07-28-model-package-import-export-design.md`

## Goal

При импорте model package:

1. Показывать **что именно** конфликтует (`model` / `notation`, name, version, details).
2. Если нотация с тем же `name+version` уже есть и у пользователя есть **view** — **переиспользовать** её вместо импорта из пакета (при совместимости структуры).
3. При конфликте модели — предложить **переименовать и/или сменить версию** и повторить импорт **без повторной загрузки ZIP**.

## Decisions

| Topic | Choice |
|-------|--------|
| Notation exists + view | Auto-reuse (no UI prompt) |
| Compatibility | Component: `(name, nodeType.name)`; relation: `(name, linkType.name)`; 0 or >1 matches → fail |
| Notation exists + no view | `409` `NOTATION_EXISTS_FORBIDDEN` with name/version |
| Incompatible reuse | `409` `NOTATION_INCOMPATIBLE` + `details[]` |
| Model exists | `409` `MODEL_EXISTS` + keep temp; UI rename and/or bump; `POST .../jobs/{id}/retry` |
| Create alternate notation version | Out of scope v1 |
| Merge into existing model | Out of scope v1 |
| Soft-fail incompatible | Out of scope v1 |

## Error shape

```json
{
  "status": 409,
  "code": "MODEL_EXISTS | NOTATION_EXISTS_FORBIDDEN | NOTATION_INCOMPATIBLE",
  "message": "…",
  "conflict": {
    "entity": "model | notation",
    "name": "…",
    "version": "…",
    "suggestedVersion": "1.1.0",
    "details": ["…"]
  }
}
```

## Import flow

1. For each `notations/*.json`: resolve by `name+version`.
   - Missing → `NotationImportService.import` (as today).
   - Present, no view → `NOTATION_EXISTS_FORBIDDEN`.
   - Present, view → build id maps via name+type match; warning `Reused notation '…' v…`.
2. Apply optional `targetModelName` / `targetModelVersion` overrides.
3. If model `name+version` exists → `MODEL_EXISTS` (temp retained for retry).
4. Else create model graph + document refs (as today).

## Retry API

`POST /api/v1/models/package/jobs/{jobId}/retry`  
Body: `{ "targetModelName"?: string, "targetModelVersion"?: string }`  

Preconditions: job owner, status `FAILED`, code `MODEL_EXISTS`, temp file still present. Re-queues the same ZIP with overrides.

## UI

- Replace generic conflict copy with code-specific messages.
- `MODEL_EXISTS`: modal with editable name + version; submit → retry; cancel → dismiss.
- `NOTATION_INCOMPATIBLE`: show capped `details` list.
- Reused notations surface via existing import warnings.

## Out of scope

Dry-run preview; creating a new notation version from the package when one exists; merging into an existing model; notation-side retry without re-upload.

# Reference: ArchiMate Application Component landscapes

## Notation

Default: **Archimate 3.1**. Resolve ids via `search_catalog` / `search_notation` — do not hardcode across environments.

## Application Component custom properties

Stored in `attrs.componentProperties[notationId][componentId]`:

| Property | Type | Notes |
|----------|------|--------|
| `status` | enum | `new` \| `active` \| `deleted`. For shipped products use **`active`**. |
| `sourceLink` | string (url) | Must match `^https?:\/\/\S+$`. Prefer `https://gitverse.ru/…` over `ssh://` / `git@`. |
| `comment` | string | Short purpose (≤200). |
| `technology` | string | Stack summary (≤200). |
| `label` | string | Optional override label. |
| `group` | boolean | System; usually leave default. |

`ensure_node` / notation binding only sets `notationComponents`. Always follow with `update_node` for properties.

## Relations (typical Archimate 3.1 names)

Confirm exact names with `search_notation(q=relation, kinds=relations)`:

| Name | Use |
|------|-----|
| Aggregation relation | Structural grouping (app aggregates lib) |
| Serving relation | Provider serves consumer (= uses) |
| Association relation | Weak / non-runtime link |
| Composition relation | Strong ownership — avoid for independent packages |

Pass `relationId` when names are ambiguous or contain spaces issues in other tools.

## Tree binding

- **Directory** `nodeId` on diagram → diagram appears in expandable folder.
- **Application Component** `nodeId` → often invisible in tree (component rows do not expand for diagrams).
- Canvas may still show Application Component instances via `modelNodeId` regardless of diagram binding.

## ensure* semantics

| Tool | Match key | On hit |
|------|-----------|--------|
| `ensure_node` | modelId + parentNodeId + name (ci) | No mutate; binding only on create |
| `ensure_link` | modelId + source + target + linkType | Direction-strict |
| `ensure_diagram` | modelId + name → latest | Does **not** update nodeId/notation/attrs |

## Write failures

| Symptom | Likely cause |
|---------|----------------|
| 403 `Forbidden` (Spring default JSON) | Historically CSRF blocking Bearer — fixed by skipping CSRF for `Authorization: Bearer` |
| 403 `missing_scope` | API key lacks `models:write` |
| 403 `model_not_allowed` | Model not in key allowlist |
| 503 Authorization service unavailable | Cerbos down |
| `AMBIGUOUS_NODE` / `AMBIGUOUS_NOTATION_ELEMENT` | Disambiguate with id from search |

## Minimal attrs template

```json
{
  "typeProperties": {},
  "notationComponents": {
    "NOTATION_ID": { "componentId": "APP_COMPONENT_ID" }
  },
  "componentProperties": {
    "NOTATION_ID": {
      "APP_COMPONENT_ID": {
        "status": "active",
        "sourceLink": "https://gitverse.ru/org/repo",
        "comment": "…",
        "technology": "…"
      }
    }
  }
}
```

# OEF organizations → model directories — Design Spec

Date: 2026-07-20  
Status: approved  
Repos: warchi, arepos-server  
Related: `2026-07-20-oef-server-normalize-design.md`

## Goal

Import ArchiMate Open Exchange `organizations` tree into wArchi model folders (Directory nodes), so elements and diagrams land in the same catalog structure as in the source OEF — not flat under the model root.

## Decisions

| Topic | Choice |
|-------|--------|
| Implementation path | Extend `oef/normalize` + client chunked batch-save (same pipeline as large OEF import) |
| Attachment point | Directly under **model root** (current editor root / `treeRootNodeId`) |
| Relations folders | Skip branches that only reference relationships |
| Views folders | Create Directory; attach imported diagrams via `diagram.nodeId` |
| Element folders | Create Directory tree; set element `parentNodeId` |
| Orphan elements (not in any org folder) | Flat under model root |
| Element in multiple folders | First DFS occurrence wins |
| Missing Directory node type | Auto-create via `POST /node-types` (`name=Directory`, `version=1.0.0`); fail with clear error if forbidden |
| Merge with existing folders by name | Out of scope (always create new Directory nodes from OEF) |

## Problem summary

Current OEF import explicitly discards `organizations`. All created nodes use a single `parentNodeId` (model root), and all diagrams use that same root as `nodeId`. Users lose the Archi catalog structure (e.g. Business / Views).

## Architecture

```
OEF XML
  │
  ├─ POST .../oef/normalize
  │     parse elements / relationships / views  (existing)
  │     + parse organizations → OefOrganizationNode[]
  │     + classify branches (element | views | relations | mixed)
  │
  ▼
Wizard (unchanged mapping UX)
  │
  ├─ ensure Directory node type exists (create if missing)
  │
  ├─ buildOefBatchSaveRequest
  │     Directory nodes (parents before children)
  │     element nodes with parentNodeId from org map
  │     links (unchanged)
  │     diagrams with nodeId = Views folder or root
  │
  └─ chunked batch-save (folders/elements top-down in node chunks)
```

## Normalize response extension

Add to `OefNormalizeResponse`:

```json
{
  "organizations": [
    {
      "label": "Business",
      "children": [
        {
          "label": "Apps",
          "children": [
            { "refId": "el-1", "refKind": "element" }
          ]
        },
        { "refId": "el-2", "refKind": "element" }
      ]
    },
    {
      "label": "Relations",
      "children": [
        { "refId": "rel-1", "refKind": "relationship" }
      ]
    },
    {
      "label": "Views",
      "children": [
        { "refId": "view-1", "refKind": "view" }
      ]
    }
  ]
}
```

### Node shape

Discriminated lightly by fields:

- Folder: `{ label: string, children: OefOrganizationNode[] }` (`label` may be empty → fallback name)
- Leaf: `{ refId: string, refKind: "element" | "relationship" | "view" }`

`refKind` is resolved on the server by looking up `refId` in parsed elements / relationships / views. Unknown refs are omitted (optional warning/issue).

### Branch classification (for apply, can also be computed client-side)

Walk a folder subtree and collect leaf `refKind`s:

| Contents | Apply behavior |
|----------|----------------|
| Has any `element` | Create Directory tree; place element nodes under corresponding folders |
| Only `view` (typical Views) | Create Directory (label or fallback `Views`); diagrams get `nodeId` = that folder |
| Only `relationship` (typical Relations) | **Skip** entire branch (no Directory) |
| Mixed | Create folders for structure; place elements; place diagrams under this folder if it contains view refs and no dedicated Views ancestor; ignore relationship leaves |

Nested labeled `<item>` nodes always become Directory nodes when the branch is not skipped.

## Apply pipeline (warchi)

### 1. Ensure Directory type

Before `buildOefBatchSaveRequest`:

1. Find node type where `name.trim().toLowerCase() === "directory"`.
2. If missing: `POST /node-types` with `{ name: "Directory", version: "1.0.0", ... }` (attrs minimal / empty schema).
3. On success: add to editor `nodeTypes` state.
4. On 403/failure: abort import with i18n error (cannot create Directory type).

### 2. Build batch payload

`buildOefBatchSaveRequest` gains organizations input (from normalize → draft):

1. Skip relation-only top-level (and nested) branches.
2. Emit Directory creates for remaining folders (stable tempIds, e.g. `oef-dir-<path-hash>`).
3. Map `elementId → parentDirectoryTempId` (or root) via DFS; first hit wins.
4. Element creates: `parentNodeId` from map / root; names still truncated to 255.
5. Directory names truncated to 255; empty label → `Folder` / localized fallback, or `Views` for view-only folders.
6. Diagram creates: `nodeId` = Views directory tempId if that view’s org parent is a Views (or mixed view-containing) folder; else model root.
7. Create order in `nodes.create`: **all Directory nodes in pre-order (ancestors first)**, then element nodes. Links and diagrams unchanged relative order after nodes.

### 3. Chunking

Reuse `OEF_NODE_CHUNK_SIZE` (800). Planner must not place a Directory child (folder or element) in an earlier chunk than its parent Directory. Approach: serialize nodes in legal parent-before-child order, then slice into chunks of 800 (existing planner works if `nodes.create` is already sorted).

TempId remapping across chunks unchanged.

### 4. UX

- Analyze/preview stats: show folder count (Directory creates).
- Import report: warn when Relations branches skipped; when Directory type was auto-created; name truncations (existing).
- Mapping wizard steps unchanged (organizations do not need type mapping).

## Edge cases

| Case | Behavior |
|------|----------|
| Missing / empty `organizations` | Same as today: everything under model root |
| Views folder without label | Directory named `Views` |
| Duplicate sibling labels | Create separate Directory nodes (no merge) |
| Partial previous flat import | No auto-cleanup |
| View ref not imported (filtered) | Diagram skipped as today; folder may remain empty |
| Element ref unknown | Leaf ignored; optional normalize issue |

## Out of scope (v1)

- Import of properties, styles, documentation, bendpoints
- Merging into existing model folders by name/path
- UI to pick import parent other than model root
- Importing relationship leaves as tree nodes
- Async server-side full import job

## Testing

**arepos-server**

- Fixture with Business / Relations / Views organizations
- Assert normalize `organizations` shape and `refKind` resolution
- Relations-only branch present in JSON (client skips) or optionally tagged — prefer raw tree + client skip for simpler server

**warchi**

- Unit: organization → Directory + `parentNodeId` / diagram `nodeId`
- Unit: chunk order parents before children
- Unit/integration mock: Directory type auto-create then import
- Regression: no organizations → flat import still works

## Rollout

Feature branch `feat/oef-server-normalize` (or follow-up `feat/oef-organizations-import` if splitting). Deploy arepos then warchi to local k8s for verification on large Archi export.

# Scripts

The **Scripts** section lets you write and share JavaScript validation scripts for a model. A script only **reports** issues via `report` — it does not modify the model or diagram.

Run from the model editor toolbar (**Scripts**, terminal icon).

## Run context

The script always receives a snapshot of the **entire model**. The open diagram only affects `ctx.diagram`:

| Situation | `ctx.diagram` |
|-----------|----------------|
| A diagram is open in the editor | that diagram object |
| No diagram open | `null` |

Permissions: **view** on the script and **view** on the model.

## Built-in objects

### `ctx`

- `ctx.model` — model graph: `nodes`, `links`, `folders`, `diagrams`, plus `id` / `name` / `version`
- `ctx.diagram` — open diagram or `null` (`id`, `name`, `notationId`, `nodeIds`, `linkIds`)
- `ctx.notations` — notations used by diagrams in the snapshot (components, relations, rules)
- `ctx.types` — `{ nodeTypes, linkTypes }` with `id`, `name`, `attrs`

## Snapshot structures

Fields of objects in `ctx` and values returned by helpers (read-only snapshot).

### Node (`ctx.model.nodes[]`, `diagramNodes`, `nodesOfType`)

```ts
{
  id: string
  name: string
  parentId: string | null   // parent in the model tree (or null)
  nodeTypeId: string
  attrs: Record<string, unknown> | null  // parsed node attrs
}
```

Model folders (Directory type) are not in `nodes` — they live in `ctx.model.folders[]`: `{ id, name, parentId }`.

### Link (`ctx.model.links[]`, `diagramLinks`, `linksOfType`, `linksBetween`)

```ts
{
  id: string
  name: string              // usually an empty string in the snapshot
  sourceId: string
  targetId: string
  linkTypeId: string
  attrs: Record<string, unknown> | null
}
```

### Diagram (`ctx.model.diagrams[]`, `ctx.diagram`)

```ts
{
  id: string
  name: string
  version: string
  notationId: string
  nodeIds: string[]   // ids of nodes visible on the diagram
  linkIds: string[]   // ids of links on the diagram
}
```

Use `diagramNodes(ctx.diagram)` / `diagramLinks(ctx.diagram)` for node/link objects — diagrams only store id lists.

### Notation (`ctx.notations[]`)

```ts
{
  id: string
  name: string
  version: string
  components: Component[]
  relations: Relation[]
  relationRules: RelationRule[]
}
```

**Component** (`components[]`, `componentForNode` result):

```ts
{
  id: string
  name: string
  notationId: string
  nodeTypeId: string
}
```

**Relation** (`relations[]`):

```ts
{
  id: string
  name: string
  notationId: string
  linkTypeId: string
}
```

**Relation rule** (`relationRules[]`, `relationRules(notationId)`):

```ts
{
  id: string
  relationId: string
  fromComponentId: string
  toComponentId: string
}
```

### Types (`ctx.types`)

```ts
{
  nodeTypes: Array<{ id: string; name: string; attrs: string | null }>
  linkTypes: Array<{ id: string; name: string; attrs: string | null }>
}
```

Type `attrs` is a raw JSON string (or `null`), unlike the parsed object on nodes/links.

### Duplicate links (`findDuplicateLinks`)

```ts
findDuplicateLinks({ by?: 'endpoints' | 'endpoints+type', directed?: boolean })
// by defaults to 'endpoints+type'; directed defaults to true (source→target matters)

{
  linkIds: string[]
  sourceId: string
  targetId: string
  linkTypeId?: string   // present when by: 'endpoints+type'
}
```

With `directed: false`, A→B and B→A are grouped together.

### `report` target

```ts
{ kind: 'node' | 'link' | 'diagram' | 'folder'; id: string }
```

### `report`

Writes items into the results list:

```js
report.error(message, target?)
report.warn(message, target?)
report.info(message, target?)
```

- `message` — result text (required)
- `target` (optional):
  - explicit: `{ kind: 'node' | 'link' | 'diagram' | 'folder', id: '...' }`
  - or a snapshot node/link object — its name is appended to the message, and clicking the result selects the entity

This is **not** `console.log`: without text in `message` (or a name on a node/link target) the report entry will look empty.

## Helpers

| Function | Purpose |
|----------|---------|
| `diagramNodes(diagram)` | Model nodes visible on the diagram |
| `diagramLinks(diagram)` | Model links on the diagram |
| `nodesOfType(typeIdOrName)` | Nodes by type id or name |
| `linksOfType(typeIdOrName)` | Links by type id or name |
| `linksBetween(a, b, { linkType? })` | Links between two nodes (node or id) |
| `findDuplicateLinks({ by, directed? })` | Duplicate links; direction matters by default |
| `componentForNode(node)` | Notation component for a node (or `null`) |
| `relationRules(notationId)` | Relation rules for a notation |

Names are available via editor autocomplete (Ctrl+Space).

## Sandbox limits

- No network (`fetch` / XHR / WebSocket)
- No access to the app DOM
- Execution timeout (a few seconds by default)
- Cap on the number of messages per run

## Example

```js
if (!ctx.diagram) {
  report.warn('Open a diagram before running')
} else {
  for (const n of diagramNodes(ctx.diagram)) {
    report.info('Node:', n)
  }
  for (const dup of findDuplicateLinks({ by: 'endpoints+type' })) {
    report.warn('Duplicate link', { kind: 'link', id: dup.linkIds[0] })
  }
}
```

## Catalog and sharing

In the **Scripts** menu, create a script with **+** in the sidebar, edit the source, and grant `VIEW` / `EDIT` via sharing — same pattern as other catalog entities. A script is a single entity **without** semver versions. Run it from the model editor (you need view access to both the script and the model).

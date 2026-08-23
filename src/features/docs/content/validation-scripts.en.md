# Scripts

The **Scripts** section lets you write and share JavaScript for the **open diagram**: check the canvas, move shapes, or place existing model nodes and links.

A script **does not load the model tree** and **does not change the graph** (it cannot create or delete tree nodes/links). Canvas writes go through the `apply.*` queue after a preview.

Run from the model editor (**Scripts**). The button stays disabled until a diagram is open.

Permissions: view the script and model to produce a report; **Apply** also needs model edit rights and the usual diagram lock.

## Built-in objects

### `ctx`

- `ctx.model` — **canvas slice** only: nodes and links already on the open diagram (`folders` is empty)
- `ctx.diagram` — the open diagram (`id`, `name`, `notationId`, `nodeIds`, `linkIds`, `instances`, `edges`)
- `ctx.notations` — this diagram's notation
- `ctx.types` — types of the nodes/links on the canvas

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

`nodes` are only nodes already on the canvas. `ctx.model.folders` is empty in this snapshot: the script does not receive the model tree.

### Link (`ctx.model.links[]`, `diagramLinks`, `linksOfType`)

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
  nodeIds: string[]
  linkIds: string[]
  instances: Array<{ id, modelNodeId, x, y, width?, height? }>
  edges: Array<{ id, modelLinkId, sourceInstanceId, targetInstanceId }>
}
```

Figure geometry lives in `ctx.diagram.instances` / `edges`. Model node/link objects on the canvas come from `diagramNodes(ctx.diagram)` / `diagramLinks(ctx.diagram)`. Links **off** the canvas: `await linksBetween(...)`.

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
| `diagramNodes(diagram)` | Nodes on the **canvas slice** |
| `diagramLinks(diagram)` | Links on the **canvas slice** |
| `nodesOfType(typeIdOrName)` | Canvas-slice nodes by type id or name |
| `linksOfType(typeIdOrName)` | Canvas-slice links by type id or name |
| `neighbors(nodeId, { direction, linkType?, page? })` | Model neighbors. `{ items, last }` |
| `searchNodes({ q?, type?, limit? })` | Search model nodes. Requires `q` or `type`, limit ≤ 50 |
| `linksBetween(a, b, { linkType? })` | All model links between a pair (both directions) |
| `findDuplicateLinks({ by, directed? })` | Duplicate links **on the canvas** |
| `componentForNode(node)` | Notation component for a node (or `null`) |
| `relationRules(notationId)` | Relation rules for a notation |

`neighbors` / `searchNodes` / `linksBetween` are async model queries, not snapshot helpers.

### `apply` (queue, not a write)

| Command | Meaning |
|---------|---------|
| `apply.setBounds({ instanceId, x, y, width?, height? })` | Figure geometry |
| `apply.addInstance({ nodeId, x?, y? })` | Place an existing model node |
| `apply.addEdge({ linkId })` | Place an existing model link; the host resolves ends |
| `apply.removeInstance({ instanceId })` | Remove the figure; the tree node stays |
| `apply.removeEdge({ edgeInstanceId })` | Remove the edge; the tree link stays |
| `apply.align({ instanceIds, mode })` | `left` / `center` / `right` / `top` / `middle` / `bottom` |
| `apply.distribute({ instanceIds, axis })` | `horizontal` / `vertical` |
| `apply.stack({ instanceIds, mode })` | `vertical` (8px gap) or `overlap` |
| `apply.setEdgeStyle({ linkId, strokeColor })` | Canvas edge stroke (`#rgb` / `#rrggbb`) |

Nothing is written until **Apply**.

Names are available via editor autocomplete (Ctrl+Space).

## Sandbox limits

- No network (`fetch` / XHR / WebSocket). Model queries go through `neighbors` / `searchNodes` / `linksBetween`
- No access to the app DOM
- Timeout covers the whole run including queries
- Cap on the number of messages per run
- `apply.addEdge({ linkId })` takes only a model link id; the host resolves endpoints

## Examples

Canvas check:

```js
const locations = diagramNodes(ctx.diagram).filter((n) =>
  nodesOfType('Location').some((loc) => loc.id === n.id)
)
if (locations.length === 0) {
  report.error('No Location on the diagram', { kind: 'diagram', id: ctx.diagram.id })
}
```

Layout:

```js
const ids = ctx.diagram.instances.map((i) => i.id)
apply.align({ instanceIds: ids, mode: 'left' })
apply.distribute({ instanceIds: ids, axis: 'vertical' })
```

Place existing neighbors:

```js
const id = ctx.diagram.instances[0].modelNodeId
const ns = await neighbors(id, { direction: 'outgoing', linkType: 'Flow' })
for (const item of ns.items) {
  apply.addInstance({ nodeId: item.node.id, x: 40, y: 40 })
  apply.addEdge({ linkId: item.link.id })
}
```

After a run: issues plus a command summary. **Close** leaves the canvas unchanged. **Apply** writes one Undo step and closes the dialog.

## Catalog and sharing

In the **Scripts** menu, create a script with **+** in the sidebar, edit the source, and grant `VIEW` / `EDIT` via sharing — same pattern as other catalog entities. A script is a single entity **without** semver versions and without a script-kind field.

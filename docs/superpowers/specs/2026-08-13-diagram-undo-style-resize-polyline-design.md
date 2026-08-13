# Diagram undo: properties, style, resize, polyline

Date: 2026-08-13  
Status: approved (pending user review of this file)  
Repos: papirus, warchi  
Out of scope for this spec: arepos-server, papirus npm publish (local `file:../papirus` during development)

## Goal

Ctrl+Z / Ctrl+Y in the **model editor with an open diagram** must undo/redo:

1. Right-panel **type properties** and **diagram-scoped** component/relation properties
2. **Figure style** (`diagramStyle` on the diagram instance, including composite)
3. **Resize** of nodes
4. **Manual editable-polyline** edits (move / insert / remove control points)

Same papirus `HistoryManager` as drag, create-on-canvas, and delete-from-diagram. One gesture or a ~350 ms pause in the same panel channel = one history step.

## Decisions

| Topic | Choice |
|-------|--------|
| Property scope | Everything in the right panel, including model-level type properties (B) |
| When history is recorded | Only with an open diagram; stack is that canvas `HistoryManager` (A). No diagram → undo stays disabled |
| Batching | One gesture / 350 ms pause, same as papirus `PropertyChangeBatcher` (A) |
| Architecture | Hybrid (3): papirus commands for resize + polyline; wArchi commands for panel |
| Dual wrap | Never record the same gesture in both papirus and wArchi |
| Type-property undo vs other diagrams | Reverts the shared entity; other diagrams refresh visually; their undo stacks are unchanged |
| Notation editor | Gets resize + polyline undo automatically via papirus; panel undo there is out of scope |

## Architecture

Single stack: `InteractionManager.history` of the active diagram.

```
Canvas gesture (resize, polyline)
  → papirus Command.execute
  → history `change`
  → existing persist (width/height, controlPoints) into diagram attrs

Right panel (properties, style, bind, restore)
  → wArchi command mutates model state
  → existing watch / syncDiagram updates papirus
```

Do not use `suppressHistoryCanvasPersist` for resize/polyline (that flag is layout-only).

### Papirus

- **Resize:** `ResizeManager` resizes **one** node. Snapshot `x, y, width, height` from `resizeStart` (`startBounds`), not from `resizeEnd`. On `resizeEnd` push `ResizeNodesCommand` if bounds changed. Skip no-op.
- **Polyline:** snapshot control points **before** ConnectionManager mutates them. Today `controlPointDragStart` fires *after* insert splice, and double-click remove mutates inside `handleDoubleClick` — a snapshot at those events is too late.
  - Existing-point drag: snapshot before the drag starts (points still unchanged).
  - Insert + drag until mouseup: **one** step; `before` = points *prior to* splice.
  - Double-click remove: snapshot in `InteractionManager` *before* `connectionManager.handleDoubleClick`; if it returns true and points changed, one command.
  - Empty points → `controlPoints = undefined`, matching current persist.

wArchi must **not** wrap `resizeEnd` / `controlPointDragEnd` in `history.execute`.

### wArchi

New composable `useDiagramHistoryBatcher`:

- Apply the mutation **immediately** (live preview), then queue a history command
- Debounce 350 ms
- Coalesce by key `channel + entityId` (`before` = first snapshot, `after` = latest)
- `flush()` records the pending command (idempotent `execute` reapplies `after`, `undo` restores `before`)
- Flush before Ctrl+Z/Y, any other `history.execute` (including `executeDiagramHistoryCommand`), and save
- On diagram switch: **drop** the pending timer without `history.execute` (mutation stays; the stack is about to be cleared anyway)
- Discrete `execute()` for non-batched actions (flush first)
- Different channels do **not** coalesce (style vs typeProperties vs scoped props of the same entity = separate steps)

**Batched channels**

- Node/link `typeProperties`
- Diagram-scoped component/relation property maps
- Instance `diagramStyle` from the style panel (including composite)

**Discrete (no debounce)** — only **panel / context-menu** entry points, not the same helpers when used by connect/drop:

- `handleBindNodeComponent` / `bindInstanceComponent` from the properties select (snapshot instance `notationComponentId` + `diagramStyle` + size, and node default binding if it changed)
- `bindLinkRelation` from the properties select only — **not** the call inside `createOrReuseLink` (that path already has a connection history command)
- Restore style from notation
- Edge path type from canvas context menu

Style-channel snapshot must include whatever `applyDiagramStyleToNodeInstance` writes: `attrs.diagramStyle` **and** `instance.width/height` when the panel actually changed size.

If there is no `history` (no canvas) or the diagram is read-only, apply the mutation without recording (same fallback as `executeDiagramHistoryCommand` today).

**Ctrl+Z flush race:** papirus handles undo on the canvas `keydown` (target phase) *before* a bubbling `window` listener. A pending panel batch would be recorded after undo and wipe redo. Flush the wArchi batcher on **capture-phase** `keydown` for undo/redo shortcuts (and from toolbar `undo()`/`redo()`), then let papirus run.

## Edge cases

- Switching diagrams already clears history (`resetHistory`). Drop the pending batch (do not push a command that would be cleared immediately). The already-applied panel mutation remains.
- Style panel may write `diagramStyle.width/height`; resize writes `instance.width/height`. Separate commands; each undo restores its own snapshot.
- Papirus already disables its own `addEdge` history in the model editor; this spec does not change that.
- Inline canvas label edit already goes through papirus property batcher; do not double-wrap `handleNodeLabelChange`.
- Document *file id* fields in the properties panel go through `setNodeTypePropertyValue` / `setNodeScopedValue` → **in scope**. Opening the wiki editor and editing page content stays **out of scope**.
- `useDocumentModal` uses those same setters; wrapping the setters covers it. Do not add a second history command in the modal.

## Files

**papirus**

- Modify: `src/core/InteractionManager.ts`
- Modify: `src/core/history/commands.ts` (`ResizeNodesCommand`)
- Modify: `src/core/InteractionManager.test.ts` (resize undo/redo; polyline drag/remove undo)

**warchi**

- Create: `src/features/models/composables/useDiagramHistoryBatcher.ts`
- Create: `src/features/models/composables/useDiagramHistoryBatcher.test.ts`
- Modify: `src/features/models/ModelEditor.vue` (panel setters, bind, restore, flush on undo/redo/save; drop pending batch on diagram switch)
- Modify: `src/features/models/components/ModelDiagramCanvas.vue` (context-menu edge type as discrete command only)
- Modify: in-app docs (`src/features/docs/content/diagrams.md` / `.en.md` and/or `hotkeys`)

**Workflow:** matching feature branch in papirus and warchi; warchi `package.json` + lock → `"@ngroznykh/papirus": "file:../papirus"` for local development.

## Testing

- papirus: resize then undo/redo restores bounds; polyline **existing-point** drag undo/redo; **insert-then-drag** is one step that also removes the inserted point; double-click remove undo/redo; no history entry when bounds/points unchanged
- wArchi batcher: two rapid style updates → one command with first `before` and last `after`; pause >350 ms → two commands; different channels do not merge; `flush` then `undo` applies `before`; discrete execute flushes pending batch first
- Wiring: `executeDiagramHistoryCommand` flushes the batcher first; capture-phase undo shortcut flushes before papirus `history.undo`
- Manual: color slider = one Ctrl+Z; resize; polyline bend; type property; restore style; bind component from panel (not an extra step when drawing a link)

## Out of scope

Tree create/rename/move/delete; create/delete/rename diagram; wiki **page content** (documentation button), except property `documentFileId` fields; note modal text; delete link/node from the **model**; OEF import; diagram copy wizard; model-level undo without an open diagram; notation editor property/style panel undo.

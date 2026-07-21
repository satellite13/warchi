# Show label flag in figure style — Design Spec

Date: 2026-07-21  
Status: approved  
Repos: warchi  
Related: `DiagramStyle` label fields in `src/domain/attrs/notationAttrs.ts`

## Goal

Allow notation (and diagram-instance) figure styles to hide the node label on the canvas when the label is not needed for that element type, without affecting names in the model/notation trees.

## Decisions

| Topic | Choice |
|-------|--------|
| Storage | `showLabel?: boolean` on `DiagramStyle` |
| Default | Absent or `true` → draw label (backward compatible) |
| Scope | Nodes (figures) only; edges unchanged |
| Runtime mechanism | Do not pass / clear papirus `node.label` when `showLabel === false` |
| Papirus changes | None — absence of label already skips `renderLabel` |
| Composite | Hide only external `Node.label`; inner composite text unchanged |
| Tree / palette names | Unaffected — use entity `.name`, not canvas label |
| Override level | Same as other label fields: notation style + optional diagram-instance override |

## Problem summary

Every figure currently gets a canvas label from the node name (or `labelTemplate`). Some notation components (icons, anchors, decorative shapes) should not show text inside the figure. There is no explicit style flag; workarounds like transparent `labelColor` still keep a label object and can affect layout.

## Architecture

```
DiagramStyle.showLabel
        │
        ├─ normalizeDiagramStyle / parse attrs
        │
        ├─ NodeStylePanel (Label section toggle)
        │
        └─ buildNodeLabel (notation + model canvas)
              │
              ├─ showLabel === false → undefined (no label)
              └─ otherwise → existing string | TextLabelOptions
```

Papirus already supports this path: `if (this._label === undefined) return` in `Node.renderLabel`, and `node.label = undefined` clears the label.

## Data model

```ts
export type DiagramStyle = {
  // ...existing fields...
  /** When false, do not draw the node label on the canvas. Default: true (absent = show). */
  showLabel?: boolean
}
```

Normalization: if `typeof value.showLabel === 'boolean'`, assign to style; otherwise leave unset.

## UI

In `NodeStylePanel` → section «Метка» / Label:

- Toggle bound to `showLabel` (default on)
- i18n keys in `ru` and `en` (e.g. `nodeStyle.showLabel`)
- When off, other label fields remain editable and stored; they simply do not affect rendering until the flag is on again

## Application points

1. `src/features/notations/utils/notationElementBuilders.ts` — `buildNodeLabel`
2. `src/features/models/components/ModelDiagramCanvas.vue` — local `buildNodeLabel` / node create & update
3. `src/features/notations/composables/useNotationDiagram.ts` — create/update nodes
4. `src/features/diagram-style/composables/useNodeStyleState.ts` + `NodeStylePanel.vue` — state, emit, apply
5. Style presets / restore-from-notation — copy `showLabel` with the rest of `DiagramStyle`

When applying style to an existing papirus node with `showLabel === false`, set `node.label = undefined`.

## Out of scope

- Edge labels
- Hiding composite internal text nodes
- New papirus API (`label.visible` / `showLabel` on Node)
- Backend schema changes (attrs JSON already flexible)

## Testing

- `normalizeDiagramStyle`: `true` / `false` / absent
- `buildNodeLabel`: returns `undefined` when `showLabel: false`; unchanged when field absent
- Style panel / state round-trip if covered by existing tests patterns

## Success criteria

- Component with `showLabel: false` renders without canvas text
- Trees and lists still show the component/node name
- Existing notations without the field behave exactly as before

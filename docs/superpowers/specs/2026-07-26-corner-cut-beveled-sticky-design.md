# Design: Fixed corner cut for beveled rectangle and sticky note

**Date:** 2026-07-26  
**Status:** Approved for planning  
**Scope:** warchi only; papirus unchanged; no DB migration

## Problem

Built-in `beveled-rectangle` uses `cut = min(w, h) * 0.16`, so chamfers grow with the node. Sticky-note fold uses `max(10, min(w, h) * 0.2)` and also scales. Rounded rectangle already keeps `cornerRadius` in absolute pixels; beveled has no equivalent control.

## Goals

1. Beveled rectangle: chamfer size in **px**, editable in Style like `cornerRadius`.
2. Sticky note: fold cut fixed at **16px** (clamped to bounds); no UI.
3. Same geometry for canvas render, outline attach, and SVG export.

## Non-goals

- Diamond / trapezoid / slanted-rectangle fixed geometry.
- Sticky-note cut configuration in UI.
- 9-slice for built-in shapes (custom shapes keep existing `customScaleSlice`).
- Papirus API changes.
- Folder-tab geometry changes.

## Chosen approach

**A. `diagramStyle.cornerCut` (px)** for beveled; sticky-note hardcodes 16px in `diagramShapes.ts`.

| Decision | Choice |
|----------|--------|
| Beveled cut source | `diagramStyle.cornerCut` |
| UI | Number field next to R, visible when shape is beveled (incl. composite outer beveled) |
| Sticky-note | Constant `16`, clamp `min(16, w/2, h/2)` |
| Default when unset | `12` for beveled (mirror typical radius default) |
| Papirus | Unchanged — factories still return `(w,h) => Path2D` via closure |

## Data model

```ts
// DiagramStyle
cornerCut?: number  // px, >= 0; meaningful for beveled-rectangle
```

- Normalize in `normalizeDiagramStyle` like `cornerRadius` (finite number ≥ 0).
- Persist in component / instance `diagramStyle` JSON (existing attrs path).
- Do **not** store on sticky-note instances for cut size.
- Presets / export / import: round-trip `cornerCut` when present (same as other style numbers).

## Geometry

### Beveled rectangle

```
cut = min(cornerCut ?? 12, width / 2, height / 2)
```

Same octagon path as today, with this `cut` instead of `0.16 * min(w,h)`.

### Sticky note

```
cut = min(16, width / 2, height / 2)
```

Single folded top-right corner; no proportional term.

### Factory API

Extend `diagramShapes` so beveled (and sticky) accept cut:

- `beveled-rectangle`: `(w, h, cutPx?)` or factory builder `makeBeveled(cutPx)`
- `sticky-note`: ignore external cut; always 16

`diagramNodeFactory` / composite outer path close over `ds.cornerCut` (or default) when creating `CustomShapeNode` / `CompositeNode` path factories. Sync paths that call `setPathFactory` must pass the same cut.

## UI

- `useNodeStyleState` / `NodeStylePanel` / `CompositeStylePanel`:
  - ref `cornerCut`
  - load/emit with `diagramStyle.cornerCut`
  - show input when `nodeShape === 'beveled-rectangle'` or composite `compositeShapeType === 'beveled-rectangle'`
  - hide for plain rectangle (keep R only) and other shapes
- i18n: `nodeStyle.cornerCut` (ru/en), short hint optional
- No Style control for sticky notes (diagram-only notes)

## Sync / wiring

- Notation + model canvases: when creating/updating beveled nodes, rebuild path with current `cornerCut`.
- Sticky / folder special shapes: sticky uses fixed 16; folder-tab unchanged.
- Outer-shape fingerprint for composite rebuild includes `cornerCut` when beveled.

## Tests

- Unit: beveled SVG/path at two widths with same `cornerCut` → cut segments stay equal px.
- Unit: sticky at two sizes → cut stays 16 (or clamped).
- Factory / style normalize: `cornerCut` round-trips; default applied when missing.

## Migration / compatibility

Existing beveled components without `cornerCut` get default **12** at render (visual change from old proportional cut — intentional). Authors can set cut in Style.

## Out of scope follow-ups

Trapezoid / slanted fixed insets; sticky cut UI; diamond tip bands.

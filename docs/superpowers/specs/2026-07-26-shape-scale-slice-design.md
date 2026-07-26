# Design: 9-slice scale for custom node shapes

**Date:** 2026-07-26  
**Status:** Approved for planning  
**Scope:** warchi (primary); arepos-server only if attrs round-trip already covers it (no schema migration); papirus unchanged

## Problem

Custom outlines are stored in normalized 0–1 coordinates and mapped linearly onto the node `width × height`. Decorative corners (chamfers, folds) stretch with the node and look wrong.

## Goals

1. Let authors mark fixed edge insets so corners keep pixel size when the node is resized.
2. Let authors place those insets themselves in the shape editor.
3. Let authors test the behavior in the shape editor without opening a notation/diagram.

## Non-goals

- Per-segment / per-point lock flags (alternative models A/B).
- Moving slice logic into papirus.
- Using or redefining `contentArea` for this feature (`contentArea` stays reserved for content/label inset if/when used).
- Changing built-in diagram shapes (`diagramShapes.ts` factories).

## Chosen model

**9-slice guides with pixel insets** and a **dual-pane editor preview**.

| Decision | Choice |
|----------|--------|
| Scaling model | 9-slice (L/R/T/B guides) |
| Units | Absolute pixels from edges |
| Editor preview | Left: template + guides; right: live resizable preview |
| Papirus | Unchanged — still receives `(w,h) => Path2D` |
| Persistence | `attrs.scaleSlice` on catalog shape; snapshot on component `diagramStyle` |

## Data model

### Catalog shape (`/node-shapes`)

Store in existing JSON `attrs` (no DB column):

```ts
type ScaleSlice = {
  left: number   // px ≥ 0
  right: number
  top: number
  bottom: number
}

// attrs JSON
{ scaleSlice?: ScaleSlice, ... }
```

Absence of `scaleSlice` or all zeros ⇒ current uniform stretch.

### Notation component snapshot

When a custom shape is selected, copy into `diagramStyle` (same pattern as `customOutline`):

```ts
customScaleSlice?: ScaleSlice
```

Export/import of notation packages must carry `attrs` (already does) and keep `customScaleSlice` on components when present. Selecting / remapping a catalog shape refreshes both outline and slice from the catalog entity.

### Reference size for editing

Guides are authored against a **reference preview size** used only in the editor UI (default e.g. `180 × 120`). Stored values are always px insets for runtime, independent of that reference. Dragging a guide updates `left|right|top|bottom` in px relative to the live-preview’s current interpretation: at runtime the same px apply to the node size.

Clarification for mapping normalized outline → px:

- Outline points remain 0–1.
- At render time, 9-slice maps each normalized point into the node rectangle using insets in px.
- Editor shows guides as lines at `x = left`, `x = width - right`, etc. on the **live preview** and as corresponding fractions on the template canvas (`left/refW`, …) so they align with the contour.

## Scaling algorithm

Extend [`src/utils/customOutlinePath.ts`](../../src/utils/customOutlinePath.ts):

1. If no effective slice → existing `scalePoint` (bbox fit to w×h).
2. Else clamp/shrink insets when `w < left+right` or `h < top+bottom` (proportional shrink of the conflicting pair).
3. For each point `(nx, ny)` in normalized space (after existing design-space normalize if needed):

   - Map X with classic 9-slice:  
     - `nx` in left fixed band → `x = nx * left / leftNorm` (or equivalent: left band of template maps into `[0, leftPx]`)  
     - middle band → stretch into `[leftPx, w - rightPx]`  
     - right band → map into `[w - rightPx, w]`
   - Same for Y with top/bottom.

Template fixed bands are derived from insets ÷ reference size **or**, more simply and robustly for catalog shapes already in 0–1 full bbox: treat inset px as absolute at render, and define fixed **normalized** bands as fractions of a canonical reference used when the slice was last edited (store optional `refWidth`/`refHeight` alongside slice, default 180×120).

**Recommended storage to avoid ambiguity:**

```ts
type ScaleSlice = {
  left: number
  right: number
  top: number
  bottom: number
  refWidth: number   // default 180
  refHeight: number  // default 120
}
```

Normalized fixed bands: `left/refWidth`, etc. Runtime still places those bands into absolute px equal to `left`… when `w >= left+right` (after shrink). This keeps “chamfer stays ~20px” while guides stay consistent with the 0–1 outline.

Bezier control points use the same point mapping (as today).

## UI

### Shape editor ([`CustomOutlineEditor.vue`](../../src/features/shapes/CustomOutlineEditor.vue) / [`ShapeForm.vue`](../../src/features/shapes/components/ShapeForm.vue))

- Toggle **Scale slice** (on ⇒ show guides + enable dual preview).
- **Left pane:** existing outline editor; four draggable guides (vertical L/R, horizontal T/B). Guides cannot cross (min middle band, e.g. 1px / small epsilon).
- **Right pane:** filled outline preview with resize handles (or corner drag) changing preview `width`/`height`; redraw via `customOutlineToSvgPath` / Path2D with current slice.
- Save persists `attrs.scaleSlice` with outline.

### Notation style panels

- On custom shape select: parse shape `attrs`, set `customScaleSlice` alongside `customOutline`.
- Pass slice into `diagramNodeFactory` path factories.

### Docs / i18n

- Update in-app `shapes.md` / `shapes.en.md` and `messages.ts` (ru/en).

## Runtime wiring

- [`diagramNodeFactory.ts`](../../src/features/diagram/diagramNodeFactory.ts):  
  `customOutlineToPath2D(segments, w, h, slice)` and SVG counterpart for both plain custom and composite custom.
- [`OutlineShapePreview.vue`](../../src/features/notations/components/OutlineShapePreview.vue): optional slice for list thumbnails (nice-to-have; default size without stressing corners).
- Notation export/import / shape remapping: refresh `customScaleSlice` when outline is refreshed from catalog.

## Testing

- Unit tests in `customOutlinePath.test.ts`: uniform (no slice), fixed corner under wide resize, inset shrink when node too small, bezier control points.
- Component/e2e smoke optional: guides visible when toggle on; preview resize keeps corner size stable (pixel tolerance).

## Out of scope follow-ups

- Partial guides UX polish (disable individual sides via zero inset — already supported by zeros).
- Visual snap of guides to outline vertices.
- Papirus shared utility if other apps need the same mapping.

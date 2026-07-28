# Design: Proportional contentInset sides (`contentInsetScale`)

**Date:** 2026-07-26  
**Status:** Approved for planning  
**Scope:** warchi + papirus; no DB migration (attrs JSON only)

## Problem

Custom shapes like C4 Actor (human bust silhouette) use `contentInset` to keep the label in the torso. Insets are absolute pixels. When the node is scaled up, a fixed top inset no longer clears the head, so the label overlaps the silhouette. Authors need some sides to grow with the node and others to stay fixed (e.g. top+left proportional, right+bottom fixed).

## Goals

1. Per-side opt-in proportional scaling for **`contentInset` only**.
2. Values stay **reference px** authored at the component style default size.
3. Any subset of sides can be proportional (not only top).
4. Default behavior unchanged: no scale flags → all sides fixed px.
5. Resolve once to absolute px in papirus layout so label, icon, badges, and composite content stay consistent.

## Non-goals

- Proportional `labelInset` / `iconInset` / composite child padding.
- Percent / fraction values in the UI (no `0.4` or `40%` authoring).
- Explicit `baseWidth` / `baseHeight` fields separate from style defaults.
- Changing `customScaleSlice` (outline 9-slice) — orthogonal to text insets.
- Backend / Liquibase changes.

## Chosen approach

| Decision | Choice |
|----------|--------|
| Field scope | `contentInset` only |
| Storage | Parallel optional `contentInsetScale` object |
| Value semantics | Reference px at style default `width` / `height` |
| Base size | `diagramStyle.width` / `diagramStyle.height`; if missing → scale factor 1 |
| Side selection | Opt-in: only sides with `true` in `contentInsetScale` scale; absent/`false` = fixed |
| Resolve location | Papirus `Node.getLabelContainerBounds` (and callers that rely on resolved content inset, e.g. composite auto-size) |

Rejected alternatives:

- **Per-side `{ value, scale }` objects** — breaks existing `InsetSides` type and normalize/UI.
- **String/bitmask of scaled sides** — awkward in forms and code.
- **Fraction/percent authoring** — worse UX than keeping familiar px + ∝ checkbox.

## Data model

```ts
// DiagramStyle (notationAttrs)
contentInset?: number | InsetSides  // unchanged — reference px
contentInsetScale?: {
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}
```

### Normalize / persist

- `normalizeDiagramStyle`: keep only sides where value is strictly `true`; drop empty object.
- Missing `contentInsetScale` → all sides fixed (legacy).
- Presets / export / import: round-trip `contentInsetScale` when present (same as other style fields).

### Resolve formula

Given node size `(nodeW, nodeH)` and base `(baseW, baseH)` from style defaults:

```
sx = baseW > 0 ? nodeW / baseW : 1
sy = baseH > 0 ? nodeH / baseH : 1

top′    = scale.top    ? top    * sy : top
bottom′ = scale.bottom ? bottom * sy : bottom
left′   = scale.left   ? left   * sx : left
right′  = scale.right  ? right  * sx : right
```

Then existing layout subtracts `top′…` from bounds (with existing clamps).

Non-uniform resize: vertical sides follow height; horizontal sides follow width.

## Runtime wiring

### Papirus

- Extend content-inset types to accept optional scale flags + base size (or resolved inset API).
- Prefer resolving inside `getLabelContainerBounds` so one path covers labels, icons, badges, composite content bounds.
- Composite auto-size paths that add content inset must use the same resolved px.
- Circle/diamond content-bounds override: keep current behavior; do not invent new inset semantics there unless already applying `contentInset`.

### Warchi

- Persist `contentInsetScale` on `diagramStyle`.
- When applying style to a node instance, pass scale flags and base W/H from style defaults together with `contentInset`.
- Instance resize does not rewrite stored inset numbers; only runtime resolve changes.

## UI

- `InsetSidesInput` (or contentInset-only variant): per-side **∝** checkbox next to the px input.
- Default unchecked = fixed.
- Shown only for **content inset** controls (`NodeStylePanel` / `CompositeStylePanel` root content inset). Not for label/icon inset.
- Numbers always mean reference px at default size; helper hint when any ∝ is on (e.g. “px @ base size”).
- i18n: short label for ∝ (ru/en).

## Edge cases

| Case | Behavior |
|------|----------|
| `baseW` or `baseH` ≤ 0 / missing | Factor `1` for that axis |
| Author changes default width/height | Same reference px; new base → visual inset changes (expected for style authors) |
| All scale flags false / omitted | Identical to today |
| Resolved inset larger than half side | Existing layout clamps |

## Testing

1. **Papirus unit:** resolve only-top; top+left; all fixed; missing base → factor 1; non-uniform W/H.
2. **Warchi unit:** normalize drops false/empty; round-trip style with `contentInsetScale`.
3. **Manual:** C4 Actor — enable ∝ on top (and optionally left); enlarge node; label stays in torso, not on head.

## Success criteria

- Actor (or similar custom silhouette) can use proportional top (and any other sides) without changing fixed sides.
- Legacy notations without `contentInsetScale` render unchanged.
- No proportional controls leak onto label/icon inset UI.

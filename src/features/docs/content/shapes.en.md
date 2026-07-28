# Shapes

The **Shapes** section is used to manage custom node outlines that can later be used in notations as a **custom shape**.

## Why shapes are useful

- create branded or domain-specific contours not available in built-in shapes;
- reuse the same contour across multiple notations;
- update a contour centrally instead of editing each notation manually.

## Page structure

The page has two main areas:

- **Left panel** — shape list, search, and create button;
- **Right panel** — editor for the selected shape.

## Shape fields

Each shape has these key fields:

- **Name** — shown in lists and in notation shape selection;
- **Outline** — shape geometry edited visually;
- **Fixed edges (9-slice)** — optional guides that keep corner/edge regions from stretching when a node is resized.

## Outline editing

The outline editor supports core operations:

- drag a point to change contour;
- double-click an edge to add a point;
- double-click a point to remove it (minimum 3 points);
- zoom controls: `+`, `-`, and reset `1:1`.

A **preview** is always available on the right: drag the resize handles to see how the outline looks at a different aspect ratio.

## Fixed edges (9-slice)

When **Fixed edges** is enabled:

1. Four orange guides appear on the outline (left/right/top/bottom).
2. Drag them to mark non-scaling regions — for example a chamfered corner.
3. Use the preview on the right to check that the corner stays stable while resizing.
4. Insets are stored in pixels and applied when the node is resized on a diagram.

Without this setting the outline still stretches uniformly with width and height.

## Creating and deleting

### Create a shape

1. Click **Add shape**.
2. A new shape is created with a basic rectangle outline.
3. Update name and outline.
4. Click **Save**.

### Delete a shape

1. Select a shape.
2. Click **Delete**.
3. Confirm action in the dialog.

## Access control

- If the user has no edit permission, the shape opens in read-only mode.
- In read-only mode fields are disabled and save/delete actions are unavailable.

## Using shapes in notation

After saving, the shape can be selected in component style settings:

1. Open notation editor.
2. Select a component.
3. In shape settings, set type to **Custom shape**.
4. Select the required shape from the list.

If corners or decorative cuts stretch when the node is resized on a diagram, return to the shape editor and configure **Fixed edges (9-slice)** (see above).

After picking the outline, review the component **content inset** (`T/R/B/L`): for silhouettes (for example an actor) you often need a larger top inset so the label does not overlap the “head”. How content, label, and icon insets nest is described under [Notations → Insets](/docs/notations).

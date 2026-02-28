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

Each shape has two key fields:

- **Name** — shown in lists and in notation shape selection;
- **Outline** — shape geometry edited visually.

## Outline editing

The outline editor supports core operations:

- drag a point to change contour;
- double-click an edge to add a point;
- double-click a point to remove it (minimum 3 points);
- zoom controls: `+`, `-`, and reset `1:1`.

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

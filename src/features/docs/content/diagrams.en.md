# Diagrams

A diagram is a graphical representation of an architectural model. Each model can contain one or more diagrams.

## Managing Diagrams

### Creating a Diagram

1. Open the context menu in the model tree
2. Select **Create diagram**
3. Enter the name and select the notation
4. Version is selected automatically — if a diagram with this name already exists, the minor version is incremented

### Switching Between Diagrams

Click the desired diagram in the model tree. If there are unsaved changes, the system will prompt:

- **Save and switch** — save current changes, then open the new diagram
- **Don't save** — discard changes and switch
- **Cancel** — stay on the current diagram

### Closing and Deleting

- **Close** — button on the toolbar. The diagram remains in the model but is closed in the editor
- **Delete** — context menu in the tree. The diagram will be deleted when saving

## Diagram Editor

The diagram editor provides a graphical canvas for placing and connecting model components.

### Adding Elements

Elements can be added to the diagram in several ways:

1. **Drag from palette** — drag an element type from the palette onto the canvas
2. **From model tree** — drag an existing component from the model tree

### Moving and Resizing

- **Move** — click an element and drag it to the desired location
- **Resize** — use the handles on the edges of the selected element
- **Multiple selection** — hold `Ctrl/Cmd` and click several elements
- **Marquee selection** — `Ctrl/Cmd` + drag on empty canvas space

### Connecting Elements

To create a link between elements:

1. Hold `Shift` and click the source element
2. Drag the line to the target element
3. Release the mouse button on the target's connection point

> If the notation does not have relation rules configured for the selected element types, connection will be unavailable.

### Canvas Navigation

- **Zoom** — mouse wheel or trackpad gestures
- **Pan canvas** — drag on empty space, middle mouse button, or `Space` + drag
- **Fit to screen** — toolbar button, scales the canvas to fit all elements

## Toolbar

### History

| Action | Description |
|--------|-------------|
| Undo | Undo last action (`Ctrl+Z`) |
| Redo | Redo undone action (`Ctrl+Y`) |

### Zoom and Navigation

| Action | Description |
|--------|-------------|
| Zoom in | Increase canvas scale |
| Zoom out | Decrease canvas scale |
| Fit to screen | Scale canvas to fit all elements |
| Zoom to selection | Scale to fit selected elements |
| Auto-layout nodes | Automatically arrange nodes on canvas |
| Reset zoom | Restore scale and position to default |

### Display

| Action | Description |
|--------|-------------|
| Grid | Show/hide grid on canvas |
| Minimap | Show/hide minimap in canvas corner |
| Snap to grid | Enable/disable element snapping to grid when moving |
| Lock link anchors | Fix connection points (links don't move when nodes move) |

### Export and Data

| Action | Description |
|--------|-------------|
| Export to PNG | Save diagram as PNG raster image |
| Export to SVG | Save diagram as SVG vector image |
| View JSON | Show JSON representation of diagram data |

### Controls

| Action | Description |
|--------|-------------|
| Close diagram | Close current diagram (without deleting) |
| Save | Save all model changes |

## Saving

The **Save** button on the toolbar becomes active when there are unsaved changes. Before saving, the system validates that all required component properties are filled. If validation fails, an error message will be shown with the specific element and property indicated.

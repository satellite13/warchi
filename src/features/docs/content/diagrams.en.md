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

### Creating a Baseline (new diagram version)

A baseline is a new version of the current diagram created from its current state.

How to create a baseline:

1. Open the required diagram in the model editor
2. Trigger the action for creating a new diagram version (baseline)
3. Confirm creation — the system creates the next version and opens it

Important details:

- a baseline copies element set and layout from the source diagram at creation time;
- you can switch to any diagram version via the version switcher;
- only the latest version is editable, previous versions open in read-only mode.

#### When to create a baseline

Create a baseline before changes that may significantly alter diagram structure:

- before auto-layout of many nodes;
- before bulk edits of links or display styles;
- before reworking subsystem grouping and composition;
- before experimenting with an alternative architecture view.

Example scenario:

1. The current diagram is agreed and used as the working version.
2. You need to try a new layout (for example, reorganize into different subsystems).
3. Create a baseline.
4. Apply changes in the new version.
5. If the result is good, continue in the new version; otherwise, return to the previous version as a stable reference.

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

## Diagram Settings

Diagram settings control editor behavior for a specific diagram.

Core settings:

- **Auto-links in groups** — when dropping a component into a container, the editor can suggest creating or reusing a grouping relation automatically;
- **Snap to grid** — helps align elements cleanly while moving;
- **Grid / minimap / rulers** — visual aids for navigation and layout;
- **Lock link anchors** — keeps link endpoints fixed when moving nodes.

Practical recommendations:

- enable snap to grid for clean, consistent layouts;
- enable auto-links in groups when modeling many container relationships;
- use minimap and rulers on large diagrams for faster navigation.

### Export and Data

| Action | Description |
|--------|-------------|
| Export to PNG | Save diagram as PNG raster image |
| Export to SVG | Save diagram as SVG vector image |
| Share as image link | Open dialog to get a public link to the diagram preview (see below) |
| View JSON | Show JSON representation of diagram data |

### Share diagram as image

You can get a link to the diagram preview as SVG. Use it to share with colleagues or embed the image in Notion, Confluence, chats, or documents — anyone with the link can open it without logging in.

**How to get the link:**

1. Open the desired diagram in the model editor.
2. Click **Share as image link** on the toolbar.
3. In the dialog, choose the link type:
   - **This diagram version** — the link will always show the current snapshot (good for a fixed view).
   - **Always latest version by name** — the link will show the latest saved version of the diagram with this name (the image updates after you save).
4. Click **Get link** — the current view is uploaded as preview and the link is generated.
5. Click **Copy link** and paste it where needed.

The preview is also uploaded automatically when you save the model, so an "always latest" link will show the current state after you save.

### Controls

| Action | Description |
|--------|-------------|
| Close diagram | Close current diagram (without deleting) |
| Save | Save all model changes |

## Saving

The **Save** button on the toolbar becomes active when there are unsaved changes. Before saving, the system validates that all required component properties are filled. If validation fails, an error message will be shown with the specific element and property indicated.

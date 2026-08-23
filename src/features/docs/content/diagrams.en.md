# Diagrams

A diagram is a graphical representation of an architectural model. Each model can contain one or more diagrams.

## Managing Diagrams

### Creating a Diagram

1. In the tree panel, click the create-diagram button
2. Enter the name and select the notation
3. Version is selected automatically — if a diagram with this name already exists, the minor version is incremented

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

### Copying a Diagram to Another Model

The **Copy diagram to another model** action (tree row and editor) opens a wizard: choose an existing target model, the notation for the new diagram, and optionally change its name, version, and folder. If preview returns a known issue, the wizard shows a localized blocker or warning.

The wizard first matches elements against the target model: nodes by `stableId`, then by exact name and type; links by `stableId`, then by type and endpoints. **Match** reuses an existing node/link in the target model — it does not map a notation component. If there is no candidate, the wizard defaults to **Create**. Ambiguous matches (several nodes with the same name and type) stay unset so you can match, create, or skip them. The user chooses the target diagram notation. Changing the target model recalculates matches from scratch.

In v1, documents and files are not copied.

### Diagram Version Comparison

For the active diagram, you can open a dedicated version comparison screen.

How to open it:

1. Open the diagram in the model editor.
2. In the diagram version block, click **Compare diagram versions** (the `compare` icon).
3. In the comparison screen, choose left and right versions.

Comparison behavior:

- comparison is scoped to one diagram name (for example, `Context` versions `1.0.0` and `1.1.0`);
- both sides are rendered in read-only mode;
- you can switch the base side via **Switch base**;
- the **Sync** toggle links pan and zoom on both sides (on by default, remembered in the browser);
- clicking an element opens a **was/became** property table at the bottom;
- link route and link properties are also compared.

When this is useful:

- right after creating a baseline, to quickly inspect what actually changed;
- before team review/approval of a new diagram version;
- before sharing a public image link for the latest visual state.

### Closing and Deleting

- **Close** — button on the toolbar. The diagram remains in the model but is closed in the editor
- **Delete** — row action in the tree. The diagram will be deleted when saving

## Diagram Editor

The diagram editor provides a graphical canvas for placing and connecting model components.

### Edit lock

Only **one user** can **edit the canvas** of a given diagram at a time. When you open a diagram, the client requests a lock; while you hold it, others with access usually see the diagram in **view-only** mode (no moving elements or saving canvas changes).

- The **model tree** shows **who holds the lock** — you or someone else.
- If you opened the diagram while another user was editing, after the lock is released you can use an action such as **Try to edit** (request the lock again).
- If you were viewing and the diagram **changed on the server**, you may be offered **Reload from server** to fetch the latest state.
- The lock is **refreshed periodically** while the editor is open; after long idle time or a disconnected session it may **expire**, allowing another user to edit.
- **Administrators** can force-release a stuck lock from the admin area.

Changes elsewhere — **model tree**, **links**, and other entities — are still saved with **Save** in the model editor; parallel edits can trigger a **save conflict** — see [Models → Saving](/docs/models).

### Adding Elements

Elements can be added to the diagram in several ways:

1. **Drag from palette** — drag an element type from the palette onto the canvas
2. **From model tree** — drag an existing component from the model tree
3. **Note or container** — from the canvas context menu (diagram-only; no new node in the model tree)

Existing model nodes and links can also be placed by a script (**Scripts** in the header). A script does not create tree entities — it only puts on the canvas what already exists in the model. See [Scripts](/docs/validationScripts).

### Moving and Resizing

- **Move** — click an element and drag it to the desired location
- **Resize** — use the handles on the edges of the selected element
- **Multiple selection** — hold `Ctrl/Cmd` and click several elements
- **Marquee selection** — `Ctrl/Cmd` + drag on empty canvas space

### Connecting Elements

To create a link between elements:

1. Hover the source element — a `+` handle appears on the outline near the cursor (when **Link by contour** is on; toolbar button, on by default)
2. Drag the handle to the target element
3. Release the mouse button on the target outline

Or hold `Shift` and drag from the element body — Shift is not needed when dragging the handle.

> If the notation does not have relation rules configured for the selected element types, connection will be unavailable.

### Canvas Navigation

- **Zoom** — mouse wheel or trackpad gestures
- **Pan canvas** — drag on empty space, middle mouse button, or `Space` + drag
- **Fit to screen** — toolbar button, scales the canvas to fit all elements

### Node and link labels (composite template)

Text on a node shape or link can be driven by a **template** in the notation component or relation: `${name}` for the node or relation name, `#{…}` for **node type / link type** fields, `${…}` for **component / relation** fields (except the reserved `name`). Values are edited in the node or link **properties panel** in the [model editor](/docs/models). See [Models](/docs/models) and [Notations → Label templates](/docs/notations).

## Toolbar

### History

| Action | Description |
|--------|-------------|
| Undo | Undo last action (`Ctrl+Z`): diagram edits, figure style, properties panel, resize, manual polyline bends, and edge path type |
| Redo | Redo undone action (`Ctrl+Y`) |

### Zoom and Navigation

| Action | Description |
|--------|-------------|
| Zoom in | Increase canvas scale |
| Zoom out | Decrease canvas scale |
| Fit to screen | Scale canvas to fit all elements |
| Zoom to selection | Scale to fit selected elements |
| Auto-layout | Opens a preview: **layered** (ELK) and **remove overlaps**; apply only after you review the result |
| Reset zoom | Restore scale and position to default |

### Display

| Action | Description |
|--------|-------------|
| Grid | Show/hide grid on canvas |
| Minimap | Show/hide minimap in canvas corner |
| Snap to grid | Enable/disable element snapping to grid when moving |
| Link by contour | Show a `+` handle on the node outline so you can start a link without Shift |
| Smart guides / rulers | Alignment guides while dragging and rulers along the canvas |
| Navigation mode | Pan the canvas without accidentally moving elements |
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
5. Click **Copy link** or **Open link**. The dialog stays open after copy.

The preview is also uploaded automatically when you save the model, so an "always latest" link will show the current state after you save.

### Controls

| Action | Description |
|--------|-------------|
| Close diagram | Close current diagram (without deleting) |
| Save | Save all model changes |

## Saving

The **Save** button on the toolbar becomes active when there are unsaved changes. Before saving, the system validates required fields: **node type properties** and **notation component properties** wherever those schemas apply. If validation fails, an error message will be shown with the specific element and property indicated. See [Models → Saving](/docs/models) for save conflicts and live sync.

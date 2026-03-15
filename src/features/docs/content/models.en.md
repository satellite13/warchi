# Working with Models

Models are the core entities in wArchi. Each model represents an architectural description of a system, consisting of diagrams, components, and relations.

## Model List

The **Models** page displays a list of all created models. Models are grouped by name — each group can contain multiple versions.

### Creating a Model

1. Click the **Create** button in the list header
2. Enter the model name
3. Select the notation to be used in the model
4. Click **Create** to confirm

A new model is created with version `1.0.0`. The notation defines which component and link types are available in the palette and on diagrams.

### Renaming a Model

The model name can be changed directly in the editor header — click the name and enter a new one. Renaming is also available through the model card in the list.

### Sharing a Model

The model owner can grant access to other users via the **Share** button:

- **VIEW** — user can view the model and diagrams;
- **EDIT** — user can edit the model and its diagrams.

The model card displays the current access level.

### Versioning

Models support semantic versioning (SemVer):

- **Major** — incompatible architecture changes
- **Minor** — adding new elements while maintaining compatibility
- **Patch** — fixes and minor updates

You can create a new model version based on an existing one.

### Model Version Comparison

Models provide a dedicated **visual version comparison** screen.

How to open it:

1. Open the target model in the editor.
2. Click **Compare with version** (the `compare_arrows` icon) in the header.
3. Select left and right versions.
4. If needed, choose the diagram name to match between versions.

How to read the result:

- the screen renders two diagrams side by side in read-only mode;
- one side is treated as **base**, the other as **changes**;
- use **Switch base** to invert change interpretation;
- when you click a node or link, the bottom table shows **was/became** properties;
- for elements missing on one side, the table shows `—`.

Difference highlighting:

- **added**;
- **removed**;
- **modified**.

Comparison covers both node/link presence and properties, including diagram-scoped notation-specific values.

## Model Editor

The model editor includes several areas:

### Model Tree (left panel)

The left panel displays the hierarchical structure of the model:

- **Folders** — for grouping components
- **Components** — architecture elements (services, modules, databases, etc.)
- **Diagrams** — graphical representations of the model

Available actions via context menu:

- Create folder, component, or diagram
- Rename element
- Delete element

### Palette

The palette panel contains available element types defined in the model's notation. Drag an element from the palette onto the diagram to add a new component.

### Properties Panel (right panel)

When selecting an element in the tree or on the diagram, the properties panel displays:

- **Style** — visual properties of the element (color, shape, size), with the ability to restore styles from the notation
- **Custom properties** — values of properties defined in the element type

#### Style panel field hints

Compact fields use short labels:

- `W/H/R` — width, height, radius;
- `PT/PB/PL/PR` — number of top/bottom/left/right ports;
- `T/R/B/L` — top/right/bottom/left insets.

When hovering these fields, a tooltip shows the full parameter name.
Inset blocks also support sync modes **Pair** (paired sides) and **All** (all sides), and button captions are localized according to the current UI language.

The left and right panels can be resized and collapsed.

### Diagrams

A model can contain multiple diagrams. Each diagram is a separate graphical representation that can display all or part of the model's components. For more on working with diagrams, see [Diagrams](/docs/diagrams).

For the active diagram, the **Diagram Info** action is available in the toolbar. The popup shows:

- diagram name and version;
- notation name and version;
- notation owner (if metadata is available).

## Saving

The **Save** button on the toolbar is active when there are unsaved changes. The indicator (dot) on the button shows uncommitted changes. Before saving, all required properties of components are validated.

When switching or closing a diagram with unsaved changes, the system will prompt to save, discard, or return to editing.

## Deleting a Model

To delete a model, use the delete button in the model list. Deletion is irreversible and affects all model data.

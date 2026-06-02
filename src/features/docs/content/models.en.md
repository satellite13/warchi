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

### Notation access through a model

Model access and notation access are **separate** permissions. If you have **EDIT** on a shared model but no direct share on the notation:

- the model editor loads notation metadata, components, relations, and types **only for the notation version already used by an active diagram in that model**;
- you **cannot** attach an arbitrary foreign notation by ID with model permissions alone — the API enforces this;
- to browse or edit the notation in the **Notations** catalog, the owner must still grant a separate notation share.

The client passes `modelId` when loading notation data from the model editor context.

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

When you select an element in the tree or on the diagram, the properties panel opens (**Properties**, **Traceability** tabs; for a node on the canvas, **Style** as well):

- **Style** tab — appearance of the **instance** on the diagram (color, shape, size), with the option to restore styles from the notation.

#### Composite elements in the model editor

For nodes created from notation components with the **Composite** shape, the **Style** tab includes composite-instance controls:

- edit instance-level applied style values;
- restore style from notation (where available);
- preview the result with bindings and current node property values applied.

Recommended workflow: evolve the base composite structure in the notation editor first, then use model-level style overrides only for local diagram-scoped variations.

#### Custom properties for a node (Properties tab)

For a **node** in the model, two separate blocks of fields are shown (when defined in the type catalog and in the notation):

1. **Node type properties** — schema is defined in [Types](/docs/types) for the corresponding node type. Values are **shared for that node across the whole model** (all diagrams). Each field shows a **node type** source badge and a **diagram label placeholder** hint: `#{propertyName}`.
2. **Notation component properties** — schema is defined in the [notation editor](/docs/notations) for the component. Values are **diagram-scoped** (the same model node can have different values on different diagrams). Label placeholder: `${propertyName}`. UI badge: **component**.

The node’s display name on the shape is controlled separately in the composite label template: **`${name}`** is reserved and is **not** a component custom property.

Full placeholder syntax is described under [Notations → Label templates](/docs/notations).

For **links**, the Properties tab shows fields from the link type and from the notation relation (bound to the notation in a similar way).

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

The **Save** button on the toolbar is active when there are unsaved changes. The indicator (dot) on the button shows uncommitted changes. Before saving, required fields are validated, including **node type properties** and **notation component properties** wherever those schemas apply.

When switching or closing a diagram with unsaved changes, the system will prompt to save, discard, or return to editing.

### Save conflict

If you and another user **changed the same node, link, or diagram** so the server already has a newer version, clicking **Save** may **abort** the batch save so other people’s edits are not overwritten silently. A **Save conflict** dialog opens:

- At the top, **two explanation blocks** (reload from server vs overwrite server) describe each path.
- Below, a **list of conflicting entities** with timestamps: what version your edit was based on, and the server’s last change time.
- On **each row**, expand the compare section: the table lists **only fields where your draft and the server differ** (main fields and top-level keys in `attrs`). Timestamps for “what version you edited from” stay in the list row caption, not repeated in the table. Server values load per id; while loading, the table is hidden.
- Below the intro text: while the dialog is open, a **second** conflict dialog does not open by itself; after you choose an action and **Save** again, the server is checked anew — if someone else saved in the meantime, you **may see the conflict dialog again**.

Pick **one** of the two main actions at the bottom:

- **Reload from server** — **full model reload** from the API. Conflicting **nodes and links** get **current server values** for every field (including attrs) so others’ tree edits are preserved; fields where you and the server already matched stay matched. If a **diagram** is listed: metadata and diagram attrs (except the canvas) come from the server; if the on-canvas **instances** block differed, **your** canvas copy is kept (no parallel canvas editing). Then **Save** again.  
  **Note:** unsaved edits to **other** model objects (not in the conflict list) are **lost** on full reload — you keep server data plus the diagram canvas exception above.
- **Overwrite server with my data** — save again with force overwrite; other users’ changes to those objects are lost.
- **Cancel** — close the dialog; local edits stay, but you cannot finish saving until you choose a strategy.

Button labels match the in-app `models` locale strings.

**Who can edit the canvas** on an open diagram is also governed by an **edit lock** (one editor at a time) — see [Diagrams](/docs/diagrams).

### Live sync between users

The model editor uses live sync for shared models:

- when other users change model data, the client pulls fresh model, node, link, and diagram state;
- synchronization uses WebSocket notifications with periodic polling fallback;
- your local unsaved draft remains visible in the current tab, and conflicting records are resolved via the save conflict dialog.

## Deleting a Model

To delete a model, use the delete button in the model list. Deletion is irreversible and affects all model data.

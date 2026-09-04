# Working with Models

Models are the core entities in wArchi. Each model represents an architectural description of a system, consisting of diagrams, components, and relations.

## Model List

The **Models** page displays a list of all created models. Models are grouped by name — each group can contain multiple versions.

### Creating a Model

1. Click **Create model** in the list toolbar
2. Enter the model name
3. Click **Create** to confirm

A new model is created with version `1.0.0`. You pick a notation later — **when creating a diagram**. One model can have diagrams with different notations.

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
4. If needed, choose the diagram name in the **searchable** list.

How to read the result:

- the screen renders two diagrams side by side in read-only mode;
- the **Sync** toggle links pan and zoom on both sides (on by default, remembered in the browser);
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

The model editor includes several areas. The header also has **scripts** for the open diagram — see [Scripts](/docs/validationScripts).

### Model Tree (left panel)

The left panel displays the hierarchical structure of the model:

- **Folders** — for grouping components
- **Components** — architecture elements (services, modules, databases, etc.)
- **Diagrams** — graphical representations of the model

Large models load incrementally: the editor first opens the tree root and diagram
list, then loads the contents of an expanded folder. **Load more** fetches the
next branch page; an error in one branch does not close the editor and can be
retried. Opening a diagram loads only its instances and the required nodes and
links.

Use **search** above the tree: the list narrows to matches and their ancestor path, and non-matching ancestors are muted. Clearing search keeps the selected node in view.

Actions are toolbar buttons and per-row mini-buttons (there is no context menu):

- create a folder, component, or diagram;
- rename or delete an item;
- copy a diagram into another model;
- see who holds the canvas lock.

A panel-header toggle syncs selection between the tree and the canvas.

### Palette

The palette lists element types from the **active diagram’s notation**. Drag an element from the palette onto the diagram to add a new component. The palette icon comes from the notation component’s **Palette icon** field when set; otherwise from the figure icon.

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

#### Custom properties for a link (Properties tab)

For a **link** in the model, two separate blocks of fields are shown (when defined in the type catalog and in the notation):

1. **Link type properties** — schema is defined in [Types](/docs/types) for the corresponding link type. Values are **shared for that link across the whole model** (all diagrams). Diagram label placeholder: `#{propertyName}`.
2. **Relation properties** — schema is defined in the [notation editor](/docs/notations) for the relation. Values are **diagram-scoped** (the same model link can have different values on different diagrams). Label placeholder: `${propertyName}`.

The relation name on the link is controlled separately in the composite label template: **`${name}`** is the reserved relation name in the notation, **not** a relation custom property. When a template is set, displayed text comes from the template; a free-form diagram instance label is not used for display.

#### Style panel field hints

Compact fields use short labels:

- `W/H/R` — width, height, radius;
- `PT/PB/PL/PR` — number of top/bottom/left/right ports;
- `T/R/B/L` — top/right/bottom/left insets (content inset and label inset).

When hovering these fields, a tooltip shows the full parameter name.
Inset blocks also support sync modes **Pair** (paired sides) and **All** (all sides), and button captions are localized according to the current UI language.

The three node style insets (**content**, **label**, **icon**) nest and are not interchangeable: first the shape’s content area shrinks, then text and the icon zone sit inside it. Details: [Notations → Content, label, and icon insets](/docs/notations).

The left and right panels can be resized and collapsed.

### Diagrams

A model can contain multiple diagrams. Each diagram is a separate graphical representation that can display all or part of the model's components. For more on working with diagrams, see [Diagrams](/docs/diagrams).

For the active diagram, the **Diagram Info** action is available in the toolbar. The popup shows:

- diagram name and version;
- notation name and version;
- notation owner (if metadata is available).

### Relation matrix

The model editor header includes **Relation matrix**. It opens a separate matrix screen for links between the model's node types (this is **not** the notation editor **Rules matrix**: that one edits allowed component pairs; this one audits links already present in the model).

- **Without notation (types)** — the vertical and horizontal axes use **node types**; the Relations axis lists **link types** in the model.
- With a **notation** selected, the vertical and horizontal axes still use **node types**, while Relations lists **link types** used by that notation's relations. A link is placed by source/target **node types** and by **link type** id — not by relation name and not by per-instance component/relation bindings. Names such as `relationship` and `flow` are not matched to each other by themselves.
- Links whose link type is **not used** by any relation of the selected notation are **excluded** from the matrix (outside that notation's vocabulary).
- Cells **allowed by the selected notation's relation rules** are visually highlighted.
- **Allowed by rules only** (when a notation is selected) keeps only those cells; **Hide empty rows and columns** removes axes with no links.
- Filters for axes and link types, plus a heatmap by link count per cell.
- Clicking a cell opens a details panel with the list of links.
- Export: **CSV long**, **CSV wide**, **PNG**.

Use the matrix to audit relation coverage and produce reports without walking every diagram manually.

### Validation

The model editor header has a **Validation** button next to the relation matrix. It opens a separate report of duplicate instances in the model tree — without downloading the full graph into the browser.

The server runs two checks:

- **Instances** — nodes of the same type whose names match after trim, case-insensitive. The Directory type is excluded.
- **Links** — two or more directed edges with the same endpoints and type. `A→B` and `B→A` of the same type are not duplicates.

The server returns at most 200 groups of each kind; if there are more, the heading shows “200 of N”.
Expand a member to see diagrams that contain it. A chip opens that diagram and focuses the entity; clicking a node name selects it in the tree without opening a canvas.

A radio button in the group chooses the copy that **will remain**. **“Merge into remaining”** on another row opens the wizard for that pair: the properties step compares values on the kept and removed copies (which value to keep), then which unique links to transfer (nodes only), then confirm. The merge is atomic on the server. If both links already sat on the same diagram, one arrow remains. Documentation of the dropped instance is not moved in v1. On conflict (the pair changed), refresh the report — the wizard does not retry the request.

Diagram scripts in the editor are a separate tool: they see the open canvas only, not the whole model tree.

### Open Exchange (XML) import

The editor header also offers the **Import Open Exchange (XML)** wizard to load an architecture model from OEF XML:

1. **Analyze** — pick a target notation and XML file; the file is uploaded to the server for parsing (up to ~100 MB), and the client receives compact JSON plus validation issues.
2. **Mapping** — map file element/relationship types to notation components/relations (filter unmapped types and bulk-apply mappings).
3. **Preview** — review import volume (nodes, links, diagrams) and warnings. Also configure **reuse**: always create nodes/links or match existing ones in the model (node: name + type; link: endpoints + type, optionally diagram edge label). On match — reuse id only or update properties from OEF. Diagrams and organization folders are always created anew.
4. Click **Import** — entities are created/updated in the current model via **chunked** batch-save; progress appears in the wizard footer. On a failed chunk, import stops (already created entities are not rolled back automatically).

After import a **report** may open: unmatched or unconverted properties, relation-rule notes, and required fields still empty. Fill required properties in the properties panel before the next save.

### Model package (export / import)

A model ZIP package moves a model between environments, users, or serves as a backup. The archive includes:

- model metadata, nodes, links, and diagrams;
- **notations** used by the model’s diagrams (types, components, relations, rules, shapes) — one JSON file per notation;
- **wiki files** and `document_refs` attachments, including cross-page `mdfile://` links.

Diagram preview SVGs are **not** included — they are regenerated on save or when publishing a diagram share link from the editor.

**Export** is available from the model card in the list (download icon) and from the editor header. **Import** is the **Import model package** button in the list toolbar: pick a ZIP file and the server creates a **new** model owned by the current user (merging into an existing model is not supported). While the job runs, the UI shows stages (queued, validating, notations, files, model, document refs). On success, the new model opens in the editor; warnings, if any, appear after import. Package import **does not** add SVGs to the icon library: if notations name icons that are missing from the catalog and the instance library, a warning appears — an administrator uploads them on [Admin → Icons](/docs/admin).

If a notation with the same **name and version** already exists and you can view it, import **reuses** it (components and relations are matched by name and type). If the notation is inaccessible or structurally incompatible, import fails with a detailed error.

If a model with the same **name and version** already exists, a dialog lets you **rename** the model and/or **change the version** and retry **without re-uploading** the ZIP.

## Saving

The **Save** button on the toolbar is active when there are unsaved changes. The indicator (dot) on the button shows uncommitted changes. Before saving, required fields are validated, including **node type properties** and **notation component properties** wherever those schemas apply. For a complete large-model check, the editor temporarily prepares a detached model snapshot and shows cancellable progress; this snapshot does not replace the open tree branches.

When switching or closing a diagram with unsaved changes, the system will prompt to save, discard, or return to editing.

### Save conflict

If you and another user **changed the same node, link, or diagram** so the server already has a newer version, clicking **Save** may **abort** the batch save so other people’s edits are not overwritten silently. A **Save conflict** dialog opens:

- At the top, **two explanation blocks** (reload from server vs overwrite server) describe each path.
- Below, a **list of conflicting entities** with timestamps: what version your edit was based on, and the server’s last change time.
- On **each row**, expand the compare section: the table lists **only fields where your draft and the server differ** (main fields and top-level keys in `attrs`). Timestamps for “what version you edited from” stay in the list row caption, not repeated in the table. Server values load per id; while loading, the table is hidden.
- Below the intro text: while the dialog is open, a **second** conflict dialog does not open by itself; after you choose an action and **Save** again, the server is checked anew — if someone else saved in the meantime, you **may see the conflict dialog again**.

Pick **one** of the two main actions at the bottom:

- **Reload from server** — the editor reloads the available tree branches and the open diagram. Conflicting **nodes and links** get **current server values** for every field (including attrs) so others’ tree edits are preserved; fields where you and the server already matched stay matched. If a **diagram** is listed: metadata and diagram attrs (except the canvas) come from the server; if the on-canvas **instances** block differed, **your** canvas copy is kept (no parallel canvas editing). Then **Save** again.
  **Note:** unsaved edits to **other** model objects can be discarded while reloading; if loading fails, the conflict dialog remains open and the action can be retried.
- **Overwrite server with my data** — save again with force overwrite; other users’ changes to those objects are lost.
- **Cancel** — close the dialog; local edits stay, but you cannot finish saving until you choose a strategy.

Button labels match the in-app `models` locale strings.

**Who can edit the canvas** on an open diagram is also governed by an **edit lock** (one editor at a time) — see [Diagrams](/docs/diagrams).

### Live sync between users

The model editor uses live sync for shared models:

- when other users change model data, the client reloads only affected open branches, entities, and diagrams;
- synchronization uses WebSocket notifications with periodic polling fallback;
- your local unsaved draft remains visible in the current tab, and conflicting records are resolved via the save conflict dialog.

## Deleting a Model

To delete a model, use the delete button in the model list. This is a **soft delete**: the model leaves the catalog and remains until an administrator runs **permanent delete** under [Administration → Deleted](/docs/admin). There is no restore-from-trash action in the UI.

# Notations

A notation defines the visual representation and rules for architectural diagrams. It specifies which element types are available and how they are displayed.

## Notation List

The **Notations** page displays a list of all notations, grouped by name. Each notation can have multiple versions.

### Creating a Notation

1. Click the **Create** button in the list header
2. Enter the notation name
3. Click **Create** to confirm

### Sharing a Notation

Notations also support sharing via the **Share** button:

- **VIEW** — view notation;
- **EDIT** — modify components, relations, and link rules.

When working with shared resources, available actions are determined by the granted permission level.

### Importing a Notation

You can also import a notation from a JSON file containing the full notation description with types and styles.

## Notation Editor

The notation editor is a visual tool for configuring the appearance and behavior of notation elements.

### Notation Components

A notation consists of the following elements:

- **Node types** — visual templates for components (rectangles, circles, etc.)
- **Link types** — visual templates for connections (arrows, lines)
- **Relation rules** — define which element types can be connected. Edit them in the component properties panel or via the **Rules matrix** in the editor toolbar (click a from→to cell).

### Style Configuration

For each node type you can configure:

- Shape (rectangle, ellipse, diamond, etc.)
- Fill and stroke color
- Font and text color
- Default dimensions
- Icon

For link types you configure:

- Line type (solid, dashed, dotted)
- Arrow style (open, closed, diamond, etc.)
- Color and line width

### Node Shapes

In component style settings, you can choose a node shape:

- **Rectangle**
- **Beveled rectangle**
- **Diamond**
- **Circle**
- **Trapezoid**
- **Parallelogram** (slanted rectangle)
- **Custom shape**
- **Composite**

Practical guidance:

- rectangle is typically used for core services/modules;
- diamond and trapezoid work well for special semantics (conditions, gateways, aggregators);
- circle is useful for compact role/event-like nodes;
- custom shape is useful when built-in options are not enough and a custom contour is required.

Additional notes:

- corner radius (`R`) applies to rectangular forms where radius is supported;
- after changing shape, review content inset (`T/R/B/L`) and label position.

### Composite UI Editor

For `Composite` shape, the style panel provides:

- visual tree editor for `compositeContent` (container/text/icon/divider/shape),
- A5 form-builder for `stylePropertyBindings` with typed conditions,
- live preview canvas,
- JSON mode as advanced fallback.

#### How to configure a composite component

1. Select **Composite** as the component shape.
2. Build the tree in `compositeContent` (`container` + nested `text`/`icon`/`shape`/etc.).
3. Configure properties of the selected node in the type-specific inspector.
4. Add A5 rules in the form **value source** -> **condition** -> **patch** (to a target node or the outer wrapper).
5. Validate behavior in live preview; use JSON mode for precise low-level edits.

#### What bindings can do

- **Text nodes**: bind to the node name and string custom properties.
- **Icons**: bind to the notation component icon (keeps palette and diagram visuals aligned).
- **A5 style bindings**: apply conditional style patches based on component or node-type properties.

Supported A5 operators: `equals`, `contains`, `matchesRegex`, `isEmpty`, `isNotEmpty`, `is`, `range`, `lt`, `lte`, `gt`, `gte`.

### Diagram-Only Elements In Notation Editor

You can add diagram-only nodes and edges directly on notation preview canvas:

- they are **not** added to component/relation trees,
- they are stored in `editorDiagramLayer` inside notation attrs,
- they are imported/exported with notation data.

#### Short field label hints

For compact layout, the style panel uses abbreviated labels:

- `W/H/R` — width, height, radius;
- `PT/PB/PL/PR` — top/bottom/left/right ports;
- `T/R/B/L` — top/right/bottom/left insets.

Hovering a field shows a tooltip with the full meaning.
Inset sync buttons **Pair**/**All** are localized automatically according to the active UI language.

### Custom Properties

Node and link types can have custom properties that are available when editing the model. Properties can be of different types: text, number, enum, etc.

When creating a property, you can mark it as **system** — such properties are used for special behavior in the editor.

### System Property `group`

The `group` system property (`boolean`) enables **component grouping behavior** driven by relation semantics.

#### Why it is needed

`group` helps model container relationships (for example, "service belongs to subsystem") not only visually but behaviorally:

- nested elements can move together with the container;
- grouping links can be hidden to reduce diagram clutter;
- when dropping an element inside a container, the editor helps create/reuse the correct relation.

#### For components

If a component type has the `group=true` system property, that component can act as a container:

- dragging this component also moves components fully located inside its bounds;
- it participates in auto-grouping flows when dropping components inside other components.

#### For links

If a link type has the `group=true` system property, that link is treated as a grouping relation:

- when `target` is fully inside `source`, the link may be hidden on the diagram (the structural relation still exists, visual noise is reduced); self-loops (`source === target`) are still shown;
- when dropping one component inside another, if a `group=true` relation is allowed, the editor suggests reusing an existing relation or creating a new one;
- if multiple relation types are possible, the relation type chooser is shown.

#### Configuration

1. Create a custom property named `group`.
2. Set its type to `boolean`.
3. Usually set default value to `true` (if that type always participates in grouping).
4. Enable the **Sys.** (system) checkbox.
5. Configure this property for the required types:
   - for **component types** — to enable container behavior;
   - for **link types** — to mark a relation as grouping.

### Interactive Properties on the Diagram

For **component** properties you can enable **“Interactive on diagram”**. Then, for nodes that have a value for this property, a small icon button appears in the top-left corner of the node on the diagram; clicking it performs an action depending on the chosen type. For any interactive property (URL, Diagram, Document) the property type must be **"string"**; when you choose an action type, the type is set automatically if needed.

#### Action Types and What to Enter

| Action type | What to enter as the property value | Example | What happens on click |
|-------------|-------------------------------------|---------|------------------------|
| **URL** | Web page address | `https://wiki.example.com/ServiceA` | Opens in a new browser tab |
| **Diagram** | Diagram ID (UUID) within the current model | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | Editor switches to that diagram (selection in the tree on the left) |
| **Document** | Document file ID (UUID) | `f0e1d2c3-b4a5-9876-5432-10fedcba0987` | Opens the document viewer/editor for that file |

#### Filling Values in the Model Editor

In the model editor, for **Diagram** and **Document** types a dropdown is available instead of typing a UUID: you select a diagram by name and version, or a document from those already attached in the model (to nodes or diagrams). For **Document** there is a **"New document"** button: an empty document is created in storage and its ID is set as the property value. For **URL** you enter the address in a text field; in the notation editor you can set the property's "Regex" field to validate the URL format (a default pattern is suggested when you choose the URL action type).

#### How to Get the IDs (if needed manually)

- **Diagram**: Each diagram in the model tree has a unique UUID. You can copy it when dragging a diagram (the clipboard gets text like `diagram:<uuid>` — use the part after `diagram:`), or from model export/API.
- **Document**: When you attach a document to a node or diagram, the system stores the file ID. Use that same ID in an interactive property of type “Document” if you want the badge to open that file. The file ID is returned when saving a document or when selecting an existing file in the model editor.

#### Setup in the Notation Editor

1. Open the notation component and the desired custom property.
2. Enable **“Interactive on diagram”**.
3. Choose the **action type**: URL, Diagram, or Document.
4. Choose the **icon** for the diagram button (link, open_in_new, description, article, etc.).
5. Save the notation.

In the model editor, when this property is filled for a node, the corresponding icon appears on the diagram; clicking it performs the chosen action.

### Label Templates

For notation components you can set a **composite label template**: what text is shown on the diagram node. The template can include the node name, **node type** fields, and **notation component** fields; users edit values in the [model editor](/docs/models) (node properties panel).

#### Syntax

- `${name}` — **node name** on the diagram (reserved; not a component custom property)
- `#{key}` — **node type** custom property value (key as in [Types](/docs/types))
- `${key}` — **notation component** custom property value (key from the component properties section below)

**Important:** **`#`** is only for node type fields; **`$`** is for the node name (`name`) or component fields.

If no template is set, the node name is shown (default behavior).

#### Examples

| Template | Result |
|----------|--------|
| `${name}` | node name only, e.g. `API Gateway` |
| `${name} · #{code} · ${status}` | name, code from node type, status from component |
| `${name} [${status}]` | name and **component** property `status`, e.g. `API Gateway [active]` |
| `${protocol}://${name}:${port}` | if `protocol` and `port` are **component** fields — composite text with node name |
| `${name}\n#{description}` | name on first line, **type** description on second |

#### Line Breaks

For multi-line labels use `\n` in the template. For example, `${name}\n${status}` shows the name on the first line and **component** `status` on the second.

#### Where to Configure

The label template can be set in two places:

- **Style panel** — "Template" field in the "Label" section when a component is selected on the diagram
- **Properties panel** — "Composite label" section with input field and result preview

#### Behavior

- If a property from the template is not found — the placeholder is replaced with an empty string
- When double-clicking a node to rename, only the node name is shown, not the template result
- In the **model editor**, values come from the node properties panel: **Node type properties** and **Notation component properties**; if missing, defaults from the type and notation schemas apply
- In the notation editor **preview**, schema defaults are used; for node type fields, type defaults apply (same as in the UI)
- **Migration:** node type values used to be expressible as `${key}`; use **`#{key}`** for the node type and keep `${key}` for **component** fields only
- Templates are supported only for nodes (not for links)

### Label Alignment

The node label has two independent positioning settings:

- **Position** — which edge of the shape the label is aligned to (auto, center, top, bottom, left, right)
- **Alignment** — how text lines are aligned within the label (center, left, right). Relevant for multi-line labels.

## Notation Versioning

Notations, like models, support semantic versioning. When creating a new notation version, all types and styles are copied from the previous version.

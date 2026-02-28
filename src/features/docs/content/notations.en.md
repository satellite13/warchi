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
- **Relation rules** — define which element types can be connected

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

### Custom Properties

Node and link types can have custom properties that are available when editing the model. Properties can be of different types: text, number, enum, etc.

When creating a property, you can mark it as **system** — such properties are used for special behavior in the editor.

### System Property `group`

A system property named `group` with type `boolean` enables component grouping mode:

- **Link hiding**: If the `target` component is fully inside the `source` component and there is a link with type `group=true` between them, the link is not displayed on the diagram
- **Group drag**: When dragging a component with `group=true`, all components fully contained within it move together with it
- **Auto-link creation**: When a component is dragged and dropped inside another component, and a `group=true` relation is possible between them:
  - If the link already exists on the diagram, nothing is prompted
  - If the link exists but is not on the diagram, you'll be prompted to add the existing link or create a new one
  - If no link exists and only one relation is available, a confirmation dialog is shown
  - If no link exists and multiple relations are available, a dialog shows to select the relation type

#### Configuration

1. Create a property with name `group`
2. Set type to `boolean`
3. Set default value to `true`
4. Enable the **Sys.** (system) checkbox
5. Optionally mark as **Req.** (required)

### Label Templates

For notation components you can set a composite label template that defines what text is displayed on the diagram node.

#### Syntax

The template uses placeholders in the form `${...}`:

- `${name}` — component name (reserved)
- `${propertyName}` — value of a custom property by name

If no template is set, the component name is displayed (default behavior).

#### Examples

| Template | Result |
|----------|--------|
| `${name}` | `API Gateway` |
| `${name} [${status}]` | `API Gateway [active]` |
| `${protocol}://${name}:${port}` | `https://API Gateway:8080` |
| `${name}\n${status}` | `API Gateway` (first line) `active` (second line) |

#### Line Breaks

For multi-line labels use `\n` in the template. For example, the template `${name}\n${status}` will display the name on the first line and status on the second.

#### Where to Configure

The label template can be set in two places:

- **Style panel** — "Template" field in the "Label" section when a component is selected on the diagram
- **Properties panel** — "Composite label" section with input field and result preview

#### Behavior

- If a property from the template is not found — the placeholder is replaced with an empty string
- When double-clicking a node to rename, only the component name is shown, not the template result
- In the model editor, values are taken from the properties of the specific instance, or from notation defaults if absent
- Templates are supported only for nodes (not for links)

### Label Alignment

The node label has two independent positioning settings:

- **Position** — which edge of the shape the label is aligned to (auto, center, top, bottom, left, right)
- **Alignment** — how text lines are aligned within the label (center, left, right). Relevant for multi-line labels.

## Notation Versioning

Notations, like models, support semantic versioning. When creating a new notation version, all types and styles are copied from the previous version.

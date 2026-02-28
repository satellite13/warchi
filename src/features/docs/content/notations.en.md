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

### Node Shapes

In component style settings, you can choose a node shape:

- **Rectangle**
- **Beveled rectangle**
- **Diamond**
- **Circle**
- **Trapezoid**
- **Parallelogram** (slanted rectangle)
- **Custom shape**

Practical guidance:

- rectangle is typically used for core services/modules;
- diamond and trapezoid work well for special semantics (conditions, gateways, aggregators);
- circle is useful for compact role/event-like nodes;
- custom shape is useful when built-in options are not enough and a custom contour is required.

Additional notes:

- corner radius (`R`) applies to rectangular forms where radius is supported;
- after changing shape, review content inset (`T/R/B/L`) and label position.

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

- when `target` is fully inside `source`, the link may be hidden on the diagram (the structural relation still exists, visual noise is reduced);
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

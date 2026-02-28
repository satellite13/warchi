# Node and Link Types

Types are global entities that define the structure of elements in architectural models. A type specifies the **name** of an element and a set of **custom properties**. Visual styling (shape, color, icon) is configured separately in notation components that are linked to the type.

Type management is done through the **Types** section in the navigation menu.

## Node Types

Node types describe architecture components — services, modules, databases, interfaces, and other elements.

A node type defines the **component semantics** (what the entity is), while visual appearance (shape, color, icon, labels) is configured in notation via a component item.

### Node Type Properties

| Property | Description |
|----------|-------------|
| Name | Unique type name |
| Icon (`icon`) | SVG icon of the type. Used in palette/lists for faster visual identification |
| Default directory path (`defaultDirectoryPath`) | Default folder path suggested for placing/structuring component instances of this type |

### Creating a Node Type

1. Go to the **Types** section
2. In the node types panel, click **Add**
3. Enter the type name
4. (Optional) select a type icon
5. (Optional) set default directory path
6. Save changes

### Where a Node Type Is Used

After creation, a node type is typically used in two places:

1. **In notation** — create a component item linked to the node type, then define style and diagram behavior.
2. **In models** — users create component instances of this type and fill custom properties.

Additionally:

- `icon` improves discoverability of types in palettes and lists;
- `defaultDirectoryPath` provides a recommended default structure for new component instances.

If a node type is not linked to a notation component, it cannot be fully used on diagrams.

### Deleting a Node Type

A type can be deleted via the context menu or delete button. Before deleting, ensure the type is not used in notations and models.

### Updating a Node Type

- Renaming a node type affects all usage points (notations, models, relation rules).
- When adding new custom properties, consider impact on existing model instances (especially for required fields).

## Link Types

Link types describe relationships between components — dependencies, data flows, inheritance, etc.

A link type defines the **relation semantics** (what the link means), while visual appearance is configured in notation via a relation component (line style, markers, labels, colors).

### Link Type Properties

| Property | Description |
|----------|-------------|
| Name | Unique link type name |

> In projects that use grouping, the `group` system property (`boolean`) is commonly added to a link type to mark it as a grouping relation. This affects diagram editor behavior (auto-links in groups, hiding structural links inside containers).

### Creating a Link Type

1. Go to the **Types** section
2. In the link types panel, click **Add**
3. Enter the link type name
4. Save changes

### Where a Link Type Is Used

After creation, a link type is usually configured in two places:

1. **In notation** — create a relation component linked to this link type and define its visual style.
2. **In relation rules** — define source/target constraints that specify which component types can be connected by this link type.

Without relation rules in notation, interactive linking on diagrams may be unavailable.

### Updating and Deleting a Link Type

- Renaming a link type affects all places where it is used (notations, rules, models).
- Before deletion, ensure the type is not used in notations and existing models; otherwise related editing flows may become unavailable.

## Custom Properties

Node and link types can have custom properties. These properties are available when editing instances in the model.

Supported property types:

- **Text** — string value
- **Number** — numeric value
- **Enum** — selection from a predefined list of values

For each property you can specify:

- Property name
- Data type
- Default value
- Required/optional
- System flag (**Sys.**) for editor-specific behavior

> When adding a new required property with a default value, existing instances in models will automatically receive the default value on next model open.

System properties are used for special editor logic. A common example is `group` (`boolean`), which is used in component grouping and grouping-relation flows.

## Relation Rules

Relation rules define which node types can be connected by which link types. This ensures correctness of architectural models.

### Configuring Rules

For each rule you specify:

- **Relation** — link type the rule applies to
- **Source** — allowed source component type
- **Target** — allowed target component type

## Types and Notations

Types are global entities available in all notations. In the notation editor, types are used to create notation **components** and **relations**. A notation component is linked to a type and adds visual styling: shape, color, icon, line style, and other display parameters on the diagram.

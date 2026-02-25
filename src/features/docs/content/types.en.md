# Node and Link Types

Types are global entities that define the structure of elements in architectural models. A type specifies the **name** of an element and a set of **custom properties**. Visual styling (shape, color, icon) is configured separately in notation components that are linked to the type.

Type management is done through the **Types** section in the navigation menu.

## Node Types

Node types describe architecture components — services, modules, databases, interfaces, and other elements.

### Node Type Properties

| Property | Description |
|----------|-------------|
| Name | Unique type name |

### Creating a Node Type

1. Go to the **Types** section
2. In the node types panel, click **Add**
3. Enter the type name
4. Save changes

### Deleting a Node Type

A type can be deleted via the context menu or delete button. Before deleting, ensure the type is not used in notations and models.

## Link Types

Link types describe relationships between components — dependencies, data flows, inheritance, etc.

### Link Type Properties

| Property | Description |
|----------|-------------|
| Name | Unique link type name |

### Creating a Link Type

1. Go to the **Types** section
2. In the link types panel, click **Add**
3. Enter the link type name
4. Save changes

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

> When adding a new required property with a default value, existing instances in models will automatically receive the default value on next model open.

## Relation Rules

Relation rules define which node types can be connected by which link types. This ensures correctness of architectural models.

### Configuring Rules

For each rule you specify:

- **Relation** — link type the rule applies to
- **Source** — allowed source component type
- **Target** — allowed target component type

## Types and Notations

Types are global entities available in all notations. In the notation editor, types are used to create notation **components** and **relations**. A notation component is linked to a type and adds visual styling: shape, color, icon, line style, and other display parameters on the diagram.

# System Overview

**wArchi** is a web application for managing architectural models, notations, and types. It supports the full workflow: from defining types and relation rules to building diagrams, versioning, and collaborative access.

## Key Features

- **Models** — create and edit architectural models with version support
- **Notations** — visual configuration of components and relations (shapes, styles, behavior)
- **Diagrams** — graphical editor with navigation tools, auto-layout, PNG/SVG export, and JSON view
- **Model live sync** — cross-user model synchronization with WebSocket and polling fallback support
- **Diagram baselines** — create a new diagram version from current state and switch between versions
- **Version comparison** — visual comparison for model versions and diagram versions with highlights and property table
- **Types** — manage node/link types including custom and system properties
- **Custom properties** — `string`, `number`, `boolean`, `enum` with defaults and validation
- **Sharing** — ACL sharing for models, notations, types, and shapes with `VIEW`/`EDIT` access levels

## Application Structure

The application consists of several main sections available through the navigation menu:

| Section | Description |
|---------|-------------|
| Home | Dashboard with statistics, recent activity, quick actions, and current version info |
| Models | Model list, model editor, diagrams, and baseline version flow |
| Notations | Notation list, visual editor for components/relations, and relation rules |
| Types | Node/link type editor with fields (`icon`, `defaultDirectoryPath`, custom properties) |
| Shapes | Custom node shape catalog with visual outline editor |
| Documentation | Product help section |
| Wiki | Entity-linked pages for model, notation, type, and shape documentation |

## Documentation Section

This section includes focused pages:

- **System overview** — high-level map of product capabilities and workflows;
- **Models** — model structure, versioning, and typical operations;
- **Notations** — components, relations, styles, and relation rules;
- **Diagrams** — editing flow, navigation, export, baselines, and version comparison;
- **Types** — system/custom fields and attribute management;
- **Shapes** — creation and reuse of custom node outlines;
- **Scripts** — JavaScript model checks with a sandbox and issues report;
- **Hotkeys** — keyboard shortcuts for faster daily work;
- **FAQ** — answers to frequently asked questions;
- **Changelog** — recent product updates.

## Wiki Section

`Wiki` complements the static help pages with entity-linked documentation. Use it for domain conventions, team instructions, and contextual notes attached to specific models, notations, types, or shapes.

See comparison details in:

- model comparison — [Models](/docs/models);
- diagram comparison — [Diagrams](/docs/diagrams).

## Permissions and Sharing

The system uses a combination of roles and policy/ACL permissions:

- **ADMIN** — access to the admin panel (`ADMIN_PANEL:VIEW`): users, deleted resources, and force-releasing diagram edit locks. Access to workspace resources is still governed by ownership and sharing (policy/ACL).
- **USER** — works with their own resources and those shared with them.
- Sharing of top-level entities (models, notations, types, shapes) supports two levels:
  - **VIEW** — view only;
  - **EDIT** — edit access.

Cards and lists display the actual access level for each resource.

Model access does not replace notation sharing: in the model editor, notation data is available only for the version already linked to a diagram in that model. See [Models → Notation access through a model](/docs/models).

## Getting Started

1. Log in through the login page
2. On the home page you will see an overview of your models and notations
3. Go to **Types** and create node/link types; add custom and system properties when needed
4. Create a **notation** by adding components and relations based on types, then configure styles and relation rules
5. Create a **model**, select a notation, and build a diagram by dragging elements from the palette
6. Before major diagram refactoring, create a **baseline** to keep a stable reference version and experiment safely

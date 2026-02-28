# System Overview

**wArchi** is a web application for managing architectural models, notations, and types. It supports the full workflow: from defining types and relation rules to building diagrams, versioning, and collaborative access.

## Key Features

- **Models** — create and edit architectural models with version support
- **Notations** — visual configuration of components and relations (shapes, styles, behavior)
- **Diagrams** — graphical editor with navigation tools, auto-layout, PNG/SVG export, and JSON view
- **Diagram baselines** — create a new diagram version from current state and switch between versions
- **Types** — manage node/link types including custom and system properties
- **Custom properties** — `string`, `number`, `boolean`, `enum` with defaults and validation
- **Sharing** — ACL sharing for models, notations, and types with `VIEW`/`EDIT` access levels

## Application Structure

The application consists of several main sections available through the navigation menu:

| Section | Description |
|---------|-------------|
| Home | Dashboard with statistics, recent activity, quick actions, and current version info |
| Models | Model list, model editor, diagrams, and baseline version flow |
| Notations | Notation list, visual editor for components/relations, and relation rules |
| Types | Node/link type editor with fields (`icon`, `defaultDirectoryPath`, custom properties) |
| Documentation | This help section |

## Permissions and Sharing

The system uses a role-based model and ACL permissions:

- **ADMIN** — full access to all resources.
- **USER** — works with their own resources and those shared with them.
- Sharing of top-level entities (models, notations, types) supports two levels:
  - **VIEW** — view only;
  - **EDIT** — edit access.

Cards and lists display the actual access level for each resource.

## Getting Started

1. Log in through the login page
2. On the home page you will see an overview of your models and notations
3. Go to **Types** and create node/link types; add custom and system properties when needed
4. Create a **notation** by adding components and relations based on types, then configure styles and relation rules
5. Create a **model**, select a notation, and build a diagram by dragging elements from the palette
6. Before major diagram refactoring, create a **baseline** to keep a stable reference version and experiment safely

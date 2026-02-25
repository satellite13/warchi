# System Overview

**wArchi** is a web application for managing architectural models and notations. The system allows you to create, edit, and version domain models with support for components, relations, and custom properties.

## Key Features

- **Models** — create and edit architectural models with versioning support
- **Notations** — visually define notations for displaying elements on diagrams
- **Diagrams** — graphical editor for building and editing diagrams with PNG and SVG export
- **Types** — manage node and link types with custom properties
- **Versioning** — semantic versioning for all entities (SemVer)
- **Sharing** — ACL sharing of resources between users with view and edit permissions

## Application Structure

The application consists of several main sections available through the navigation menu:

| Section | Description |
|---------|-------------|
| Home | Dashboard with statistics, recent activity, quick actions, and current version info |
| Models | List of models and model editor with diagrams |
| Notations | List of notations and visual notation editor |
| Types | Editor for node and link types |
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
3. Go to **Types** and create node and link types for your architecture
4. Create a **notation** by adding components and relations based on types and configuring their visual styles
5. Create a **model**, select a notation, and build a diagram by dragging elements from the palette

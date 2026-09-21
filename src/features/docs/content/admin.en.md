# Administration

Administration pages are available to users with `ADMIN_PANEL:VIEW` permission. In practice this is typically granted to users with the **ADMIN** role.

## Users

User management supports:

- search by email;
- role change (`admin` / `architect` / `editor` / `reader` / `viewer`);
- account activation/blocking;
- profile editing for a user;
- password reset/change for a user;
- view and **revoke** the user’s API keys (plaintext is never shown; revoke immediately blocks MCP and key exchange);
- **extra feature grants** for a user (allow-only keys on top of the role matrix).

Changes are applied immediately after confirmation.

## Role grants

The **Role grants** section (`/admin/role-grants`) is the UI capability matrix (feature grants) by role.

Feature grants **do not replace** resource ACL (ownership, shares, Cerbos): they only show or hide UI actions on top of existing object permissions. Data access is still decided by server-side resource authorization.

Product roles:

| Role | Purpose |
|------|---------|
| `admin` | Administration; **always** has every feature grant (the admin column is not editable) |
| `architect` | Full work with models and catalogs (wide default grant set) |
| `editor` | Edit models and related entities within ACL |
| `reader` | Read access and a limited set of UI actions |
| `viewer` | Minimal view |

The `ui.languageSwitch` grant enables the RU/EN switcher in the header. Without it the UI stays in **Russian** (default for `reader` / `viewer` and guests; seeded for `architect` / `editor`).

An administrator can:

- edit the grant matrix for `architect` / `editor` / `reader` / `viewer`;
- give a user **extra** keys (allow-list expansion only — role grants cannot be taken away per user).

> **Phase 1:** feature grants apply only on the client (buttons, menus, soft route guards). The API does **not** yet reject requests for missing grants — server ACL and Cerbos policies remain a separate layer.

## Deleted resources

The **Deleted** section lists entities removed from catalogs (**soft delete**). Models, notations, types, and shapes disappear from working lists but stay here until an administrator permanently deletes them.

List sections:

- deleted models;
- deleted notations;
- deleted node types;
- deleted link types;
- deleted shapes.

Available actions:

- inspect deleted entities;
- run **permanent delete** after confirmation.

Permanent delete can be **blocked** (HTTP 409) while the entity is still in use: for example a notation in active models, or a type in components, nodes, and links.

> Permanent delete is irreversible. Use it only after confirming the resource is no longer needed. There is no restore-from-trash action in the UI.

## Diagram locks

The **Diagram locks** section (`/admin/diagram-locks`) lists active canvas edit locks.

Available actions:

- view active locks with a “model / diagram” path and lock holder;
- live list refresh;
- **force-release** a lock after confirmation — when an editor session is stuck or the canvas must be handed over urgently.

Normal collaborative locking is described in [Diagrams](/docs/diagrams). Admin force-release is an exceptional tool; after release, another user with EDIT access can acquire the canvas again.

## Icons

The **Icons** section (`/admin/icons`) is the instance-wide SVG library.

- upload one or more SVGs;
- export and import a `warchi-icon-bundle`;
- import icons from a notation export JSON (`icons[]` only — the notation is not created);
- delete an icon (notation references will stop resolving).

Regular users only pick these icons in the picker. Notation import does not add icons to the library.

Related roles and feature-grant overview: [Authentication](/docs/auth).

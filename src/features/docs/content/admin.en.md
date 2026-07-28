# Administration

Administration pages are available to users with `ADMIN_PANEL:VIEW` permission. In practice this is typically granted to users with the **ADMIN** role.

## Users

User management supports:

- search by email;
- role change (`USER` / `ADMIN`);
- account activation/blocking;
- profile editing for a user;
- password reset/change for a user.

Changes are applied immediately after confirmation.

## Deleted resources

The **Deleted** section lists removed models and notations.

Available actions:

- inspect deleted entities;
- run **permanent delete** after confirmation.

> Permanent delete is irreversible. Use it only after confirming the resource is no longer needed.

## Diagram locks

The **Diagram locks** section (`/admin/diagram-locks`) lists active canvas edit locks.

Available actions:

- view active locks with a “model / diagram” path and lock holder;
- live list refresh;
- **force-release** a lock after confirmation — when an editor session is stuck or the canvas must be handed over urgently.

Normal collaborative locking is described in [Diagrams](/docs/diagrams). Admin force-release is an exceptional tool; after release, another user with EDIT access can acquire the canvas again.

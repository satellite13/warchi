# Authentication and Access

## Sign in

After a successful sign-in, the server creates a cookie session and the app stores only the user profile needed for UI display. JWTs are not stored in `localStorage` or `sessionStorage`. If a user was redirected to login from a protected route, the app navigates back to that route after authentication; otherwise it opens the home page. Failed authentication returns an error message.

## SSO sign-in

When an administrator has enabled corporate SSO (OIDC), the login page shows an extra button labeled with the identity provider name. After a successful provider login, wArchi opens a normal cookie session — the rest of the app works the same as after password sign-in.

In the profile (when SSO is enabled) you can **link** a provider account to an existing user or **unlink** it. Linking requires the SSO email to match the wArchi account email. Unlinking does not delete the local account and does not end the current session.

## Sign up

After a successful sign-up, a session is created and the app navigates to the home page. Protected sections remain available without signing in again while the session is active.

## Roles

Product user roles (`role` field):

| Role | Purpose |
|------|---------|
| `admin` | Admin panel and the full feature-grant set |
| `architect` | Full work with models and catalogs (default) |
| `editor` | Editing within resource ACL |
| `reader` | Read access and limited UI |
| `viewer` | Minimal view |

Access to **specific** models, notations, and other objects is still decided by ownership, sharing, and Cerbos (resource ACL). Role and feature grants do not replace those checks.

Admin capabilities (users, deleted resources, diagram locks, grant matrix) require `ADMIN_PANEL:VIEW` — typically the `admin` role. See [Administration](/docs/admin).

## Feature grants

**Feature grants** are UI capability keys (`model.create`, `notation.nav`, …) returned in the user profile (`/auth/me` → `featureGrants`).

- Effective set = role grants **plus** per-user allow-only extras (set by an admin on the user card).
- The `admin` role **always** receives the full grant catalog.
- Admins configure the role matrix and user extras under [Administration → Role grants](/docs/admin).
- In **phase 1**, grants only hide/show UI and soft-guard some routes; the API does **not** yet reject calls for a missing grant.
- Examples: without `model.wiki.create` the Wiki nav item and `/wiki` route are hidden; without `model.comments` the comments panel and badges are hidden; without `profile.apiKeys` the profile API keys section is hidden (admin key revocation is unchanged).

## Route protection

- Protected pages are unavailable without an active session.
- Opening a protected route while unauthenticated redirects to login.
- The **Help** section (`/docs`) is available **without signing in**. Guests see help in the header and a **Sign in** button (after login, the same page opens).
- Admin routes are guarded by permission checks (`ADMIN_PANEL:VIEW`) via policy-based authorization.
- Some catalog/tool routes also require a feature grant (missing grant redirects home); this is a client soft-guard, not a substitute for ACL.

## Session refresh

When the cookie session expires, the client attempts to refresh it via `/auth/refresh`. If the server explicitly rejects the refresh, local session state is cleared and sign-in is required again. Temporary network errors do not immediately clear the local session.

## Sign out

Sign-out first calls the server logout endpoint so httpOnly cookies can be removed. Local session state is cleared after the server confirms logout.

MCP API keys are created in [Profile](/docs/profile) and do not replace the browser cookie session.

## Service unavailable

If the API or authorization service is temporarily unavailable, a blocking overlay appears with a retry action. While it is shown, editing is paused — wait for recovery or click Retry.

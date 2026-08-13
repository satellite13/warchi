# Authentication and Access

## Sign in

After a successful sign-in, the server creates a cookie session and the app stores only the user profile needed for UI display. JWTs are not stored in `localStorage` or `sessionStorage`. If a user was redirected to login from a protected route, the app navigates back to that route after authentication; otherwise it opens the home page. Failed authentication returns an error message.

## SSO sign-in

When an administrator has enabled corporate SSO (OIDC), the login page shows an extra button labeled with the identity provider name. After a successful provider login, wArchi opens a normal cookie session — the rest of the app works the same as after password sign-in.

In the profile (when SSO is enabled) you can **link** a provider account to an existing user or **unlink** it. Linking requires the SSO email to match the wArchi account email. Unlinking does not delete the local account and does not end the current session.

## Sign up

After a successful sign-up, a session is created and the app navigates to the home page. Protected sections remain available without signing in again while the session is active.

## Roles

- **USER** — works with owned resources and shared resources.
- **ADMIN** — has additional administration capabilities (user management, including revoking a user’s API keys, deleted resources, force-releasing diagram locks).

## Route protection

- Protected pages are unavailable without an active session.
- Opening a protected route while unauthenticated redirects to login.
- Admin routes are guarded by permission checks (`ADMIN_PANEL:VIEW`) via policy-based authorization.

## Session refresh

When the cookie session expires, the client attempts to refresh it via `/auth/refresh`. If the server explicitly rejects the refresh, local session state is cleared and sign-in is required again. Temporary network errors do not immediately clear the local session.

## Sign out

Sign-out first calls the server logout endpoint so httpOnly cookies can be removed. Local session state is cleared after the server confirms logout.

MCP API keys are created in [Profile](/docs/profile) and do not replace the browser cookie session.

## Service unavailable

If the API or authorization service is temporarily unavailable, a blocking overlay appears with a retry action. While it is shown, editing is paused — wait for recovery or click Retry.

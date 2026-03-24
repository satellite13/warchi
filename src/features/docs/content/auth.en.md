# Authentication and Access

## Sign in

After a successful sign-in, the app stores tokens and grants access to protected sections. If a user was redirected to login from a protected route, the app navigates back to that route after authentication; otherwise it opens the home page. Failed authentication returns an error message.

## Sign up

After a successful sign-up, a session is created and the app navigates to the home page. Protected sections remain available without signing in again while the session is active.

## Roles

- **USER** — works with owned resources and shared resources.
- **ADMIN** — has additional administration capabilities (user management, deleted resources).

## Route protection

- Protected pages are unavailable without an active session.
- Opening a protected route while unauthenticated redirects to login.
- Admin routes are guarded by permission checks (`ADMIN_PANEL:VIEW`) via policy-based authorization.

## Session refresh

When an access token expires, the client attempts a refresh-token flow. If refresh fails, the session is cleared and sign-in is required again.

## Sign out

Sign-out clears local session state and returns the app to unauthenticated mode.

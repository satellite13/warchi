# Authentication and Access

## Sign in

After a successful sign-in, the app stores tokens and grants access to protected sections. Failed authentication returns an error message.

## Roles

- **USER** — works with owned resources and shared resources.
- **ADMIN** — has additional administration capabilities (user management, deleted resources).

## Route protection

- Protected pages are unavailable without an active session.
- Opening a protected route while unauthenticated redirects to login.
- Admin routes are guarded by role checks.

## Session refresh

When an access token expires, the client attempts a refresh-token flow. If refresh fails, the session is cleared and sign-in is required again.

## Sign out

Sign-out clears local session state and returns the app to unauthenticated mode.

# Security architecture

Backend authorization is authoritative. The Next.js application may hide navigation. It cannot grant access.

## Authentication

- Argon2id password hashes.
- Access JWT, about 15 minutes, in a `Secure` `HttpOnly` `SameSite=Lax` cookie. `Secure` is off only for local HTTP.
- Refresh token, opaque, stored as a SHA-256 hash, rotated on every refresh.
- Reuse of a revoked refresh token revokes the token family.
- CSRF cookie is readable by the browser; the matching header is required on unsafe requests.
- Login failures share one error body. A known account locks after repeated failures.
- Passwords, refresh tokens, and access tokens are not logged.

## Tenant

See [multi-tenancy.md](multi-tenancy.md). The browser cannot pass a clinic id that selects data.

## Authorization

Roles are `OWNER`, `DOCTOR`, `RECEPTIONIST`, and `STAFF`. `OWNER` is the clinic owner, not a platform operator. Platform administration, if added, uses a separate principal and separate policies. The permission matrix is [../security/permission-matrix.md](../security/permission-matrix.md).

## Transport and headers

Production terminates TLS at the load balancer. The API sets a nosniff content type option, a deny frame option, and a strict referrer policy. CORS allows only the configured web origin and credentials.

## Data

Money uses `numeric`. Identifiers are UUIDv7. Errors return a code, message, details, timestamp, and request id. Responses omit stack traces, SQL, and secrets.

## Still required before production

Rate limiting, dependency scanning in CI beyond compile, file-content validation, webhook signature checks, export authorization tests, and a review of cookie flags behind the production TLS terminator.

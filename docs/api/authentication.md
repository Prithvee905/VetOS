# Authentication

Cookies:

| Cookie | HttpOnly | Purpose |
| --- | --- | --- |
| `vetos_access` | Yes | JWT access token, about 15 minutes |
| `vetos_refresh` | Yes | Opaque refresh token |
| `XSRF-TOKEN` | No | CSRF token the browser copies into `X-XSRF-TOKEN` |

`SameSite=Lax`. `Secure` is true when `vetos.security.cookie-secure` is true.

Access token claims: `sub` user id, `clinic_id`, `roles`, `iat`, `exp`. The signature is HMAC-SHA256. The secret is `VETOS_JWT_SECRET` outside local development.

Refresh tokens are random 32-byte values. The database stores SHA-256. Refresh rotates the token. Presenting a revoked token revokes every token in that family.

Logout revokes the presented refresh token and clears both auth cookies.

`GET /api/v1/auth/me` returns the current user. `GET /api/v1/branches` is the authenticated tenant-scoped read used to prove isolation.

Password reset and email verification are not in this milestone.

# API overview

Base path: `/api/v1`. OpenAPI document: [openapi.yaml](openapi.yaml).

Implemented in this milestone:

- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/clinic`
- `PATCH /api/v1/clinic`
- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/{userId}`
- `GET /api/v1/branches`
- Actuator liveness and readiness

The OpenAPI file also describes the first vertical slice so the contract exists before those controllers do. Slice paths are marked `x-status: planned`. Calling them returns 404 until they are built.

Authentication uses cookies. The access token is not returned in the JSON body. Unsafe methods require the CSRF header after `GET /api/v1/auth/csrf`.

Collection responses use the pagination rules in [pagination-filtering.md](pagination-filtering.md). Errors use [error-handling.md](error-handling.md).

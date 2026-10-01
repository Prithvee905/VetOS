# Error handling

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication failed.",
  "details": [],
  "timestamp": "2026-09-30T18:00:00Z",
  "requestId": "018f..."
}
```

| HTTP | code | When |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Bean validation or malformed JSON. `details` lists fields. |
| 401 | UNAUTHORIZED | Missing or invalid login or token. |
| 403 | FORBIDDEN | Authenticated but not allowed, including CSRF rejection. |
| 404 | NOT_FOUND | Hidden and missing resources, including other tenants' ids. |
| 409 | CONFLICT | Unique constraint or illegal state transition. |
| 409 | IDEMPOTENCY_CONFLICT | Same key, different payload. |
| 409 | OPTIMISTIC_LOCK | Stale `version`. |
| 429 | RATE_LIMITED | When rate limiting is enabled. |
| 502 | EXTERNAL_FAILURE | Provider failed after local commit was not required. |
| 500 | DATABASE_FAILURE | Unexpected persistence error, message stays generic. |
| 500 | INTERNAL_ERROR | Anything else unexpected. |

The body never includes a stack trace, SQL, or a secret. A request id filter supplies `requestId` and `X-Request-Id`.

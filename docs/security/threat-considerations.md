# Threat considerations

| Threat | Control | State |
| --- | --- | --- |
| Cross-tenant read or write (IDOR) | RLS, server-derived clinic id, tests | Foundation tested for branches, users, refresh tokens, audit |
| Forged clinic id from the browser | Clinic id taken from the user row | Implemented |
| Stolen access cookie | Short TTL, HttpOnly, SameSite, TLS in production | Implemented; TLS depends on deployment |
| Stolen refresh cookie | Rotation, hash storage, family revocation on reuse | Implemented |
| CSRF on cookie auth | Double-submit style CSRF cookie and header | Implemented |
| Password guessing | Argon2id, identical error, lockout | Implemented |
| SQL injection | Parameterized queries, JPA | In use |
| Secret leakage in logs or git | No tokens in logs; JWT secret from environment in production | Dev default is local only |
| Audit tampering | Application role lacks UPDATE and DELETE on `audit_events` | Implemented |
| Webhook spoofing | Signature and event id | Not built |
| Export of another clinic | Owner check plus RLS inside the job | Not built |
| Prompt injection and over-sharing | AI module rules | Not built |
| Offline payment or stock fraud | Those operations are online-only | Documented |

Login lookup uses a security-definer function. That function is a privileged path. It must stay a fixed statement. New definer functions need review.

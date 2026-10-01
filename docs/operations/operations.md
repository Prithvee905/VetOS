# Operations

## Health

- Liveness: `/actuator/health/liveness`
- Readiness: `/actuator/health/readiness`

Readiness fails when the database connection fails. The process should not receive traffic in that state.

## Shutdown

ECS sends SIGTERM. The embedded server stops accepting requests and finishes in-flight ones until the stop timeout. Background workers, once they exist, must stop claiming jobs on that signal.

## Retention

| Data | Rule |
| --- | --- |
| Audit events | Keep at least 7 years unless a later legal requirement sets a different period. Clinic users cannot delete them. |
| Clinical records | Keep. Soft delete hides operational lists and does not erase finalized consultations. |
| Invoices and payments | Keep. Void and refund with new rows. |
| Export artifacts | Expire after 7 days, then delete the object. |
| Outbox processed rows | Retain 30 days, then a cleanup job may delete them. |
| Refresh tokens | Delete expired rows with a cleanup job. |

## Secrets

Production secrets live in AWS Secrets Manager. The repository does not contain provider keys. The local JWT secret in Compose is for the developer machine only.

## Known operational gaps

Sentry, CloudWatch alarms, backup restore drills, and rate limiting are not operating yet. See [../progress.md](../progress.md).

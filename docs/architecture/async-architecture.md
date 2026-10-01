# Async architecture

Business transactions commit in PostgreSQL before any external call. The outbox table is specified in [../database/schema.md](../database/schema.md) and is not migrated yet.

## Outbox row

`id`, `clinic_id`, `event_type`, `payload`, `status`, `attempt_count`, `next_attempt_at`, `last_error`, `created_at`, `processed_at`.

Statuses: `PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`.

## Worker

A worker claims rows with `FOR UPDATE SKIP LOCKED`, sets the tenant GUC from `clinic_id`, calls the provider, and marks the row. Retry uses exponential backoff with jitter and a maximum attempt count. Exhausted rows stay in `FAILED` for inspection. The claim is safe across multiple API instances.

Spring Scheduler plus ShedLock covers reminders, cleanup, export expiry, and retry sweeps. Those jobs are not registered yet.

Redis is not the queue and not the ledger. It may later hold rate-limit counters and short-lived cache entries.

External HTTP clients will use Resilience4j timeouts, retries, circuit breakers, and bulkheads. Outbox retry is separate from in-request retry. Non-idempotent provider calls do not get a blind retry.

## Webhooks

WhatsApp webhooks, when built, verify the signature, store the provider event id uniquely, ignore duplicates, and audit the processing result.

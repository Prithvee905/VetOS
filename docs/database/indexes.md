# Indexes

Foundation indexes in `V1__foundation.sql`:

- Unique index on `lower(email)` for live users.
- Unique index on branch name per clinic for live branches.
- Unique index on refresh token hash.
- Index on `refresh_tokens (family_id)`.
- Index on `audit_events (clinic_id, created_at desc)`.
- Index on `branches (clinic_id)` and `users (clinic_id)`.

`pg_trgm` is installed. GIN trigram indexes for client name, patient name, and product name are added with those tables.

Later unique indexes:

- `(clinic_id, invoice_number)`
- `(clinic_id, idempotency_key)` on payments
- Appointment overlap exclusion on `(doctor_user_id, tstzrange(starts_at, ends_at))` where status is still active, so double booking fails in the database.

List endpoints stay paginated so these indexes are used with a stable order, not as a license for unbounded scans.

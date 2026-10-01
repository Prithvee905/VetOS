# Database architecture

PostgreSQL 17 is the system of record. One database, one schema (`public`) for tenant data, plus `app` for security-definer functions.

## Conventions

- Primary keys are UUID. Application code generates UUIDv7. The database does not invent a second identifier.
- Tenant-owned tables include `id`, `clinic_id`, `created_at`, `updated_at`, and, where the row is editable, `created_by`, `updated_by`, `version`, and `deleted_at` only if soft delete is allowed for that entity.
- Timestamps are `timestamptz` and stored in UTC.
- Money is `numeric(14,2)` unless a rate needs `numeric(9,6)`.
- Status and category values use check constraints, not free text.
- Foreign keys point at the owning row and include `clinic_id` where both sides are tenant-owned, so a pet cannot reference an owner from another clinic.
- Optimistic locking uses `version` on editable aggregates.
- Flyway owns schema changes. Production schema is not edited by hand.

## Soft delete

Used for clinics' operational records that can be retired: branches, users, clients, patients, catalog rows. Not used for audit events, payments, issued invoice lines, stock movements, or outbox history. Those are corrected by a new compensating row.

## Search

`pg_trgm` is installed for later name search. Full text indexes are added with the entities they serve.

## Connection roles

| Role | Use |
| --- | --- |
| Database owner (`postgres` locally) | Flyway, owns tables and definer functions |
| `vetos_app` | API runtime, no superuser, no bypass RLS |

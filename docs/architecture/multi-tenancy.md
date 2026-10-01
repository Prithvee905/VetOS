# Multi-tenancy

Model: one database, one schema, many clinics.

The tenant key is `clinics.id`. Tenant-owned tables carry `clinic_id` and a foreign key to `clinics`.

## How the clinic is chosen

1. Login resolves the user by email through a security-definer function.
2. The access token stores that `clinic_id`.
3. The request transaction sets `app.clinic_id` with `set_config(..., true)`, which is local to the transaction.
4. RLS policies compare `clinic_id` to that setting.
5. Missing or blank settings match no rows.

A client header, query parameter, or body field named clinic id is ignored for authorization.

## Roles

Flyway connects as the database owner so migrations can create policies. The application connects as `vetos_app`, which is not a superuser and does not bypass RLS. Table owner is the migration role. Policies are forced.

Login and refresh lookup use `SECURITY DEFINER` functions in the `app` schema. Those functions run a fixed query and do not accept dynamic SQL. After the clinic is known, writes use the application role and RLS.

## Async work

Workers read `clinic_id` from the job or outbox row and set the GUC inside the job transaction. They must not reuse a web request thread-local as the only control.

## Tests

`CrossTenantIsolationTest` inserts a branch as clinic A and asserts clinic B, and a session with no clinic id, cannot see it. The same test covers update and delete.

## Not allowed

A second database per module, a schema per tenant, or trusting a clinic switcher in the browser.

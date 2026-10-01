# Data flow

## Authenticated request

1. The browser sends cookies and the CSRF header on unsafe methods.
2. Spring Security validates CSRF and the access JWT.
3. The JWT subject and `clinic_id` become the security principal. The clinic id was copied from the user row at login.
4. The request filter opens the transaction, sets `app.clinic_id` for that transaction, and then runs the controller.
5. PostgreSQL RLS hides other clinics. Application queries still include the clinic predicate where a repository is introduced.
6. The transaction commits or rolls back. `SET LOCAL` ends with the transaction.

## Login

Login cannot use RLS, because the clinic is unknown. `app.find_login(email)` is `SECURITY DEFINER`, returns at most one user, and does not accept a clinic id from the client. After the password matches, the service starts a transaction, sets that user's clinic id, stores the refresh token, and writes an audit event.

## First vertical slice, when built

Owner session creates a client and patient. Reception creates an appointment and checks the pet into the queue. The doctor writes a consultation and prescription. Billing creates an invoice whose lines snapshot prescription details and the price used at that time. Payment records a succeeded payment with an idempotency key. Each write commits business rows and an audit row together.

## Outbox, when built

The same database transaction inserts the business row, the audit row, and an `outbox_events` row. A worker claims the row after commit and calls WhatsApp, email, or another provider. Provider failure retries the outbox row and does not roll back the clinical or financial record.

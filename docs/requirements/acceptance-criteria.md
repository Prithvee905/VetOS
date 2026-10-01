# Acceptance criteria

A requirement is complete only when its criteria pass and the evidence is recorded in the requirements matrix. Criteria below are the target behavior. Unless the matrix says `IMPLEMENTED` or later, the behavior is not in the product yet.

## Identity and tenant

### REQ-IDN-001 Login

- Given an active user with a correct password, when they submit login with a valid CSRF token, then the response sets HttpOnly access and refresh cookies and returns the user id, clinic id, display name, and roles.
- Given a wrong password or an unknown email, the response is the same unauthorized error and does not reveal which case occurred.
- Given five consecutive failures for a known account, further attempts are rejected until the lock expires.

### REQ-IDN-002 Refresh rotation

- Given a valid refresh cookie, when the client refreshes, then the previous token is revoked, a new refresh cookie is set, and a new access cookie is set.
- Given a revoked refresh token presented again, the token family is revoked and the request is rejected.

### REQ-IDN-003 Logout

- Given an authenticated session, logout revokes the current refresh token and clears auth cookies.

### REQ-TNT-001 Tenant boundary

- Given two clinics, a session for clinic A cannot read, update, or delete clinic B branches, users, refresh tokens, or audit events.
- The clinic id comes from the authenticated user, never from a client-supplied clinic id header or body.

### REQ-TNT-002 Transaction tenant context

- Every tenant-scoped query in a request runs in a transaction where `app.clinic_id` is set with `SET LOCAL` semantics and cleared when the transaction ends.

## Clinic and access

### REQ-CLN-001 Clinic profile

- An owner can read and update the authenticated clinic profile.
- A user cannot update another clinic.

### REQ-CLN-002 Branches

- Branches store address, contact, operating hours, and status.
- Branch access stays inside the authenticated clinic.
- Doctor schedules and inventory, when added, are branch-scoped where the requirement says so.

### REQ-USR-001 Roles

- Assignable clinic roles are only `OWNER`, `DOCTOR`, `RECEPTIONIST`, and `STAFF`.
- Backend authorization rejects a role that the permission matrix does not allow.
- Frontend role checks do not grant access the API would refuse.

## Patients and front office

### REQ-CLT-001 Owner profile

- A client record stores contact details, communication consent, and notes, and belongs to one clinic.

### REQ-PAT-001 Pet registration

- A pet stores name, species, breed, date of birth or age, sex, color, optional microchip, owner, and notes, and belongs to that owner's clinic.

### REQ-PAT-002 Pet size

- Size category is exactly `SMALL`, `MEDIUM`, or `LARGE` and is stored as controlled data.

### REQ-APT-001 Appointments

- Creating an appointment captures branch, pet, owner, doctor, start, duration, and notes.
- Status transitions follow the documented lifecycle.
- The same doctor cannot be double-booked for overlapping times.

### REQ-QUE-001 Queue

- Check-in creates a queue entry with position, priority, and status.
- Transitions among waiting, in consultation, completed, cancelled, and no-show are stored and audited.

## Clinical and money

### REQ-CON-001 Differentials

- A consultation can record zero or more differential diagnoses without replacing the final diagnosis field.

### REQ-CON-002 Doctor remarks and notes

- A consultation stores doctor remarks and doctor notes as distinct fields.
- Clinical AI cannot write these fields.

### REQ-PRE-001 through REQ-PRE-005 Prescription lines

- Each line stores medicine, quantity, dosage, frequency, and duration.
- Instructions and route can be stored.
- A prescription has an explicit status lifecycle.

### REQ-BIL-001 Prescription to invoice

- Issuing an invoice from a prescription copies medicine, quantity, duration, dosage or frequency when required, unit price, tax rate, discount, and line total onto the invoice line.
- Later catalog price changes do not change issued invoice lines.

### REQ-PAY-001 Payments

- Payments support cash, card, UPI, bank transfer, and other configured methods.
- Partial payments are allowed until the invoice total is reached.
- A payment succeeds only after the server records a succeeded payment. A browser flag is not confirmation.
- Repeating the same idempotency key does not create a second payment.

## Export and communications

### REQ-EXP-001 Owner export

- An owner can request an export of authorized clinic data in CSV, XLSX, JSON, and ZIP when documents are included.

### REQ-EXP-002 Export tenant scope

- The export job reads only the authenticated clinic. Another clinic's rows, files, and messages are absent from the artifact.

### REQ-EXP-003 Export audit

- Export request and download write tenant-scoped audit events.

### REQ-COM-001 Reminders

- Appointment, vaccination, deworming, and follow-up reminders are idempotent, retryable, and do not send twice for the same due event.

### REQ-COM-002 Consent

- Campaign and WhatsApp sends do not go to recipients who have opted out.

## Offline and AI

### REQ-OFF-001 Controlled offline

- Offline mutations use a sync queue, UUIDv7, and an idempotency key.
- Stock decrement and payment confirmation are rejected while offline.

### REQ-AI-001 Advisory AI

- AI output is schema-validated and shown for human review.
- AI does not diagnose, prescribe, change clinical records, change invoices, change inventory, or send clinical messages unless an authorized person performs that action in the product.

# Constraints

Foundation checks:

- Clinic status `ACTIVE` or `SUSPENDED`.
- Branch status `ACTIVE` or `INACTIVE`.
- User status `ACTIVE` or `DISABLED`.
- Currency code length 3.
- Default tax rate greater than or equal to zero.
- Role code in the four clinic roles.

Slice checks, applied when those tables are migrated:

- Patient size `SMALL`, `MEDIUM`, or `LARGE`.
- Appointment, queue, consultation, prescription, invoice, and payment statuses listed in [schema.md](schema.md).
- Payment amount greater than zero.
- Invoice totals equal the sum of line amounts inside the billing transaction. The database stores the snapshot; the billing service recomputes before insert and a check constraint keeps non-negative amounts.

Foreign keys are mandatory for owner, pet, appointment, consultation, prescription, invoice, and payment links. Composite keys include `clinic_id` so a row cannot point at another clinic.

Audit events have no application update or delete privilege. Refresh token hashes are unique.

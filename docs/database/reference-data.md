# Reference data

Seeded by `V1__foundation.sql`:

| Set | Codes |
| --- | --- |
| Roles | `OWNER`, `DOCTOR`, `RECEPTIONIST`, `STAFF` |
| Permissions | `CLINIC_MANAGE`, `USER_MANAGE`, `BRANCH_READ`, `PATIENT_WRITE`, `APPOINTMENT_WRITE`, `QUEUE_WRITE`, `CONSULTATION_WRITE`, `INVOICE_WRITE`, `PAYMENT_WRITE`, `AUDIT_READ`, `EXPORT_REQUEST` |

Role grants match [../security/permission-matrix.md](../security/permission-matrix.md) at a coarse level. Endpoint enforcement is still per feature.

Later seeds, in the migration that introduces the column:

- Species and sex codes
- Appointment, invoice, and payment statuses as check constraints rather than a second lookup table when the set is small and stable
- Stock movement types
- Notification types
- Job states

Application code uses the same constants as the checks. New codes are a migration plus a code change, not a free string.

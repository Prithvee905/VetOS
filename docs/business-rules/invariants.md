# Business invariants

| ID | Rule |
| --- | --- |
| BR-IDN-001 | A password is stored only as an Argon2id hash. Login does not reveal whether the email exists. |
| BR-IDN-002 | A refresh token is stored hashed, rotated on use, and its family is revoked when a revoked token is presented. |
| BR-IDN-003 | Cookie-authenticated unsafe requests require a CSRF token. |
| BR-TNT-001 | A clinic user cannot read or write another clinic's rows, files, messages, exports, jobs, or audit events. |
| BR-TNT-002 | Tenant context is taken from the authenticated user and applied with transaction-local `app.clinic_id`. |
| BR-CLN-001 | Clinic profile changes apply only to the caller's clinic. |
| BR-CLN-002 | A branch belongs to one clinic. Staff, schedules, and stock assigned to a branch stay in that clinic. |
| BR-USR-001 | Clinic roles are only OWNER, DOCTOR, RECEPTIONIST, and STAFF. |
| BR-USR-002 | The permission matrix is enforced on the server. |
| BR-CLT-001 | A client belongs to one clinic. Consent flags govern outbound messages. |
| BR-LED-001 | A lead is not a client until a conversion transaction creates the client and marks the lead converted. |
| BR-PAT-001 | A pet belongs to one client and that client's clinic. |
| BR-PAT-002 | Pet size is SMALL, MEDIUM, or LARGE. |
| BR-PAT-003 | The timeline reads authoritative records. It is not a second clinical store. |
| BR-APT-001 | Appointment status changes follow SCHEDULED, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, and NO_SHOW. Completed and cancelled rows do not jump backward. |
| BR-APT-002 | A doctor has at most one active appointment overlapping a time range in a branch. |
| BR-QUE-001 | Queue status changes are explicit and audited. |
| BR-CON-001 | Differentials are stored separately from the recorded diagnosis. |
| BR-CON-002 | Doctor remarks and doctor notes are both stored. |
| BR-CON-003 | Only an authorized person finalizes a consultation. AI output is not written into these columns by the model call. |
| BR-PRE-001 | A prescription line has medicine, quantity, dosage, frequency, and duration, and belongs to a consultation in the same clinic. |
| BR-BIL-001 | Invoice lines snapshot description, quantity, unit price, discount, tax rate, tax amount, and total. Catalog edits do not change issued lines. |
| BR-BIL-002 | Invoice numbers are unique per clinic and allocated under a lock. Totals use numeric arithmetic. |
| BR-BIL-003 | Service prices used on an invoice are the price row current at issue time, copied onto the line. |
| BR-PAY-001 | A payment is succeeded only after the server inserts a succeeded row. The same idempotency key returns the original payment. |
| BR-PAY-002 | A refund is a new row linked to the payment and cannot exceed the remaining paid amount. |
| BR-INV-001 | Selling price and purchase price are different fields. |
| BR-INV-002 | Every stock change inserts a stock movement in the same transaction. Quantity cannot go negative. |
| BR-PRC-001 | A purchase order does not increase stock. Goods receipt does. |
| BR-PRC-002 | A vendor belongs to the clinic that created it. |
| BR-CLN-003 | Lab, surgery, IPD, and grooming records belong to the clinic and link to billing by line source, not by a second price. |
| BR-FIN-001 | An expense stores amount, category, date, and branch. |
| BR-FIN-002 | Profit and revenue reports sum invoices, payments, and expenses. They do not sum browser state. |
| BR-COM-001 | WhatsApp and email are sent from the outbox after commit. |
| BR-COM-002 | A reminder key is unique per clinic, subject, channel, and due time. |
| BR-COM-003 | Opted-out recipients are excluded from campaigns. |
| BR-COM-004 | A notification belongs to one clinic and one recipient. |
| BR-AUD-001 | Audit rows are tenant-scoped and append-only for clinic users. |
| BR-FIL-001 | A file's object key and metadata belong to one clinic and one entity in that clinic. |
| BR-RPT-001 | Reports filter by clinic, and by branch when the caller is branch-limited. |
| BR-EXP-001 | Only an owner can request a clinic export. |
| BR-EXP-002 | The export query is tenant-scoped. |
| BR-EXP-003 | Export request and download are audited. |
| BR-OFF-001 | Offline clients cannot confirm payment or decrement stock. |
| BR-AI-001 | AI results require human action before they change clinical, financial, inventory, or communication records. |
| BR-OPS-001 | Readiness is down when the database is unusable. |

Critical invariants get a database constraint, a service check, or both, and a test when the feature is implemented. Identity, tenant, and audit rules above have foundation tests. The rest are specified only.

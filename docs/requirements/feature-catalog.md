# Feature catalog

Source: VetOS production brief. Status values describe this repository, not intent.

| Feature | Module | Status | Notes |
| --- | --- | --- | --- |
| Clinic profile | clinic | IMPLEMENTED | Owner read/update via API and settings UI |
| Branches, addresses, hours | branch | PLANNED | Table and list endpoint exist for tenant isolation |
| Users | user | IMPLEMENTED | Owner list/create via API and settings UI |
| Roles OWNER, DOCTOR, RECEPTIONIST, STAFF | user | IMPLEMENTED | Reference data and role assignment table |
| Permission checks | identity | IMPLEMENTED | Clinic and user admin routes enforce OWNER permissions |
| Pet owners | client | PLANNED | |
| Leads and conversion | lead | PLANNED | A lead is not a customer until conversion |
| Customer segmentation | client | PLANNED | |
| Pet registration | patient | PLANNED | Includes size category |
| Pet gallery | patient, file | PLANNED | Files in S3, metadata in PostgreSQL |
| Pet medical timeline | patient | PLANNED | Read model over authoritative records |
| Appointments | appointment | PLANNED | Explicit status transitions |
| Doctor scheduling and availability | schedule | PLANNED | No double booking unless a later requirement allows it |
| Queue and triage | queue | PLANNED | Auditable transitions |
| Consultation, SOAP, differentials, diagnosis, doctor notes | clinical | PLANNED | Differentials and doctor notes are mandatory |
| Prescriptions | prescription | PLANNED | Medicine, quantity, dosage, frequency, duration |
| Prescription details into billing | billing | PLANNED | Financial snapshot, not a live price copy |
| Vaccinations | vaccination | PLANNED | |
| Deworming | vaccination | PLANNED | Separate records from vaccines |
| Laboratory | laboratory | PLANNED | |
| Surgery | surgery | PLANNED | |
| IPD / hospitalization | ipd | PLANNED | |
| Grooming | grooming | PLANNED | |
| Service catalog | service | PLANNED | Price snapshot for historical invoices |
| Pharmacy catalog | pharmacy | PLANNED | |
| Inventory, batches, expiry, movements | inventory | PLANNED | No silent quantity changes; no offline stock decrement |
| Vendors | vendor | PLANNED | |
| Purchase orders, goods receipt, purchase invoices | procurement | PLANNED | Stock increases on receipt, not on PO creation |
| Unified invoice basket | billing | PLANNED | Decimal money, concurrent invoice numbers |
| Payments, partial payments, refunds | payment | PLANNED | Idempotent confirmation |
| Expenses and profit/loss | expense, analytics | PLANNED | From authoritative financial records |
| Analytics | analytics | PLANNED | |
| WhatsApp Cloud API | communication | PLANNED | Webhook signature, templates, consent |
| Email via Resend | communication | PLANNED | |
| In-app notifications | notification | PLANNED | |
| Reminders | notification | PLANNED | Idempotent, tenant-aware jobs |
| Campaigns | campaign | PLANNED | Consent and opt-out enforced |
| Audit log | audit | IMPLEMENTED | Append-oriented security events for auth; clinical and financial audit not yet written |
| Files and documents | file | PLANNED | |
| Reports | report | PLANNED | |
| Owner data export | export | PLANNED | Tenant-scoped, audited, asynchronous for large jobs |
| AI assistance | ai | PLANNED | Advisory only; no voice or telephony |
| Controlled offline workflows | web offline | PLANNED | Not enabled for stock decrement or payment confirmation |
| Background jobs and outbox | platform | PLANNED | Schema designed; worker not implemented |
| Operational monitoring | platform | PLANNED | Actuator health exists; Sentry and CloudWatch do not |

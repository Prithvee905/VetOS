# Requirements matrix

Source for every row is the VetOS production brief unless noted as an architecture decision. Business-rule links point at [../business-rules/invariants.md](../business-rules/invariants.md). Database detail for the first slice is in [../database/schema.md](../database/schema.md).

Status `IMPLEMENTED` means the foundation behavior exists and has an automated test or a reviewed migration. It does not mean `PRODUCTION_READY`.

| ID | Description | Module | Business rule | Database | API | Frontend | Authorization | Tenant | Tests | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-IDN-001 | Login with Argon2id and cookies | identity | BR-IDN-001 | users | POST /api/v1/auth/login | Shell only | Public plus CSRF | User record supplies clinic | AuthFlowTest | IMPLEMENTED | apps/api identity module |
| REQ-IDN-002 | Refresh rotation and reuse detection | identity | BR-IDN-002 | refresh_tokens | POST /api/v1/auth/refresh | Not built | Refresh cookie | Token family is clinic-scoped | AuthFlowTest | IMPLEMENTED | RefreshTokenService |
| REQ-IDN-003 | Logout and revocation | identity | BR-IDN-002 | refresh_tokens | POST /api/v1/auth/logout | Not built | Authenticated | Clinic of the session | AuthFlowTest | IMPLEMENTED | AuthController |
| REQ-IDN-004 | CSRF on cookie-authenticated writes | identity | BR-IDN-003 | none | CSRF cookie and header | Not built | All unsafe methods | n/a | AuthFlowTest | IMPLEMENTED | SecurityConfig |
| REQ-TNT-001 | Clinic A cannot read clinic B | tenant | BR-TNT-001 | RLS policies | Enforced below the API | n/a | Authenticated clinic | RLS and app filters | CrossTenantIsolationTest | IMPLEMENTED | V1 migration and test |
| REQ-TNT-002 | Transaction-scoped clinic id | tenant | BR-TNT-002 | app.clinic_id | All tenant queries | n/a | Server identity only | SET LOCAL | CrossTenantIsolationTest | IMPLEMENTED | TenantTransactionSupport |
| REQ-CLN-001 | Clinic profile management | clinic | BR-CLN-001 | clinics | GET/PATCH /api/v1/clinic | /settings/clinic | OWNER for update | Own clinic only | ClinicUserAdminTest | IMPLEMENTED | ClinicController |
| REQ-CLN-002 | Branch management | branch | BR-CLN-002 | branches | GET /api/v1/branches | Not built | Authenticated read | RLS | CrossTenantIsolationTest | IMPLEMENTED | List only; mutations planned |
| REQ-USR-001 | Users and four clinic roles | user | BR-USR-001 | users, roles, user_roles | GET/POST/PATCH /api/v1/users | /settings/users | OWNER for management | User clinic | ClinicUserAdminTest | IMPLEMENTED | UserController |
| REQ-USR-002 | Permission matrix enforced per action | user | BR-USR-002 | role_permissions | Clinic and user routes | Settings nav hides user admin | Backend authoritative | Clinic roles | ClinicUserAdminTest | IMPLEMENTED | RolePermissions |
| REQ-CLT-001 | Pet owner profile and consent | client | BR-CLT-001 | clients | Planned | Planned | Reception and above | clinic_id | None | PLANNED | schema.md |
| REQ-LED-001 | Lead capture and conversion | lead | BR-LED-001 | leads | Planned | Planned | Reception and owner | clinic_id | None | PLANNED | Not a client until converted |
| REQ-PAT-001 | Pet registration | patient | BR-PAT-001 | patients | Planned | Planned | Clinical and reception | Pet clinic matches owner | None | PLANNED | schema.md |
| REQ-PAT-002 | Size SMALL, MEDIUM, LARGE | patient | BR-PAT-002 | patients.size_category | Planned | Planned | Same as registration | clinic_id | None | PLANNED | Check constraint specified |
| REQ-PAT-003 | Pet gallery | file | BR-FIL-001 | files | Planned | Planned | Authorized entity access | Object key is tenant-prefixed | None | PLANNED | file-storage.md |
| REQ-PAT-004 | Unified pet timeline | patient | BR-PAT-003 | Read model | Planned | Planned | Clinical read | clinic_id | None | PLANNED | No duplicate source records |
| REQ-APT-001 | Appointment lifecycle | appointment | BR-APT-001 | appointments | Planned | Planned | Front office and doctor | clinic and branch | None | PLANNED | schema.md |
| REQ-SCH-001 | Doctor availability and conflicts | schedule | BR-APT-002 | doctor_schedules | Planned | Planned | Owner and doctor | Branch inside clinic | None | PLANNED | No double book |
| REQ-QUE-001 | Queue and triage | queue | BR-QUE-001 | queue_entries | Planned | Planned | Front office and doctor | clinic_id | None | PLANNED | Audited transitions |
| REQ-CON-001 | Differentials | clinical | BR-CON-001 | consultation_differentials | Planned | Planned | Doctor and owner | clinic_id | None | PLANNED | schema.md |
| REQ-CON-002 | Doctor remarks and notes | clinical | BR-CON-002 | consultations | Planned | Planned | Doctor and owner | clinic_id | None | PLANNED | Distinct columns |
| REQ-CON-003 | SOAP, vitals, diagnosis, follow-up | clinical | BR-CON-003 | consultations | Planned | Planned | Doctor and owner | clinic_id | None | PLANNED | AI cannot write |
| REQ-PRE-001 | Prescription medicine | prescription | BR-PRE-001 | prescription_items | Planned | Planned | Doctor | clinic_id | None | PLANNED | schema.md |
| REQ-PRE-002 | Quantity | prescription | BR-PRE-001 | prescription_items.quantity | Planned | Planned | Doctor | clinic_id | None | PLANNED | schema.md |
| REQ-PRE-003 | Dosage | prescription | BR-PRE-001 | prescription_items.dosage | Planned | Planned | Doctor | clinic_id | None | PLANNED | schema.md |
| REQ-PRE-004 | Frequency | prescription | BR-PRE-001 | prescription_items.frequency | Planned | Planned | Doctor | clinic_id | None | PLANNED | schema.md |
| REQ-PRE-005 | Duration | prescription | BR-PRE-001 | prescription_items.duration | Planned | Planned | Doctor | clinic_id | None | PLANNED | schema.md |
| REQ-VAC-001 | Vaccination history and due date | vaccination | BR-VAC-001 | vaccinations | Planned | Planned | Doctor and reception | clinic_id | None | PLANNED | Reminders later |
| REQ-DWM-001 | Deworming history and due date | vaccination | BR-VAC-001 | deworming_doses | Planned | Planned | Doctor and reception | clinic_id | None | PLANNED | Separate from vaccines |
| REQ-BIL-001 | Prescription details flow into billing | billing | BR-BIL-001 | invoice_lines | Planned | Planned | Owner and receptionist | clinic_id | None | PLANNED | Price snapshot |
| REQ-BIL-002 | Invoice numbering and totals | billing | BR-BIL-002 | invoices | Planned | Planned | Owner and receptionist | clinic_id | None | PLANNED | Numeric money |
| REQ-PAY-001 | Payments and partial payments | payment | BR-PAY-001 | payments | Planned | Planned | Owner and receptionist | clinic_id | None | PLANNED | Idempotency key |
| REQ-PAY-002 | Refunds | payment | BR-PAY-002 | payment_refunds | Planned | Planned | Owner | clinic_id | None | PLANNED | Audited |
| REQ-PHA-001 | Medicine catalog | pharmacy | BR-INV-001 | products | Planned | Planned | Owner, doctor, staff | clinic_id | None | PLANNED | Doctors are not the POS |
| REQ-INV-001 | Stock movements | inventory | BR-INV-002 | stock_movements | Planned | Planned | Owner and staff | Branch stock | None | PLANNED | No negative stock |
| REQ-PRC-001 | Vendor to receipt to stock | procurement | BR-PRC-001 | purchase_orders, goods_receipts | Planned | Planned | Owner | clinic_id | None | PLANNED | PO does not add stock |
| REQ-VND-001 | Vendor records | vendor | BR-PRC-002 | vendors | Planned | Planned | Owner | clinic_id | None | PLANNED | |
| REQ-SVC-001 | Service catalog | service | BR-BIL-003 | services, service_prices | Planned | Planned | Owner | clinic_id | None | PLANNED | Versioned price |
| REQ-LAB-001 | Laboratory orders and results | laboratory | BR-CLN-003 | lab_orders | Planned | Planned | Doctor and staff | clinic_id | None | PLANNED | |
| REQ-SRG-001 | Surgery workflow | surgery | BR-CLN-003 | surgeries | Planned | Planned | Doctor and owner | clinic_id | None | PLANNED | |
| REQ-IPD-001 | Hospitalization | ipd | BR-CLN-003 | admissions | Planned | Planned | Doctor and owner | clinic_id | None | PLANNED | |
| REQ-GRM-001 | Grooming | grooming | BR-CLN-003 | grooming_bookings | Planned | Planned | Reception and staff | clinic_id | None | PLANNED | |
| REQ-FIN-001 | Expenses | expense | BR-FIN-001 | expenses | Planned | Planned | Owner | clinic_id | None | PLANNED | |
| REQ-FIN-002 | Financial reporting | analytics | BR-FIN-002 | invoices, payments, expenses | Planned | Planned | Owner | clinic_id | None | PLANNED | Authoritative records |
| REQ-ANL-001 | Operational analytics | analytics | BR-FIN-002 | Read models | Planned | Planned | Owner | clinic_id | None | PLANNED | |
| REQ-COM-001 | WhatsApp transactional messages | communication | BR-COM-001 | messages, outbox_events | Planned | Planned | Owner and reception | clinic_id | None | PLANNED | Outbox, not inline |
| REQ-COM-002 | Email via Resend | communication | BR-COM-001 | messages | Planned | Planned | Owner and reception | clinic_id | None | PLANNED | |
| REQ-COM-003 | Reminders | notification | BR-COM-002 | reminder_jobs | Planned | Planned | System job | Per clinic | None | PLANNED | Dedupe required |
| REQ-CMP-001 | Campaigns respect opt-out | campaign | BR-COM-003 | campaigns | Planned | Planned | Owner | clinic_id | None | PLANNED | |
| REQ-NTF-001 | In-app notifications | notification | BR-COM-004 | notifications | Planned | Planned | Authenticated recipient | clinic_id | None | PLANNED | |
| REQ-AUD-001 | Append-only tenant audit | audit | BR-AUD-001 | audit_events | Not exposed yet | Not built | Owner for read | RLS, no update or delete | CrossTenantIsolationTest | IMPLEMENTED | Auth events only |
| REQ-FIL-001 | Tenant-scoped files | file | BR-FIL-001 | files | Planned | Planned | Entity authorization | Key prefix | None | PLANNED | S3 |
| REQ-RPT-001 | Reports | report | BR-RPT-001 | Read queries | Planned | Planned | Role and branch | clinic_id | None | PLANNED | |
| REQ-EXP-001 | Owner can export clinic data | export | BR-EXP-001 | export_jobs | Planned | Planned | OWNER | Own clinic | None | PLANNED | |
| REQ-EXP-002 | Export is tenant-scoped | export | BR-EXP-002 | export_jobs | Planned | Planned | OWNER | RLS | None | PLANNED | |
| REQ-EXP-003 | Export is audited | export | BR-EXP-003 | audit_events | Planned | Planned | OWNER | clinic_id | None | PLANNED | |
| REQ-OFF-001 | Offline queue for allowed mutations | web | BR-OFF-001 | idempotency_keys | Planned | Planned | Same as online | Server rechecks tenant | None | PLANNED | offline-architecture.md |
| REQ-AI-001 | Advisory AI with human review | ai | BR-AI-001 | ai_invocations | Planned | Planned | Authorized user | Clinic data minimization | None | PLANNED | No voice |
| REQ-OPS-001 | Liveness, readiness, database health | platform | BR-OPS-001 | none | Actuator probes | n/a | Health is public | n/a | ActuatorHealthTest | IMPLEMENTED | application.properties |

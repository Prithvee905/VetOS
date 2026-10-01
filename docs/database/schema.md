# Schema

`V1__foundation.sql` creates the identity, clinic, branch, audit, and RLS objects. Later tables in this document are the column-level contract for the first vertical slice and are not migrated yet. Remaining domains are table groups.

## Migrated: clinics

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key and tenant id |
| name | text | Required |
| legal_name | text | |
| timezone | text | Default `Asia/Kolkata` |
| currency_code | char(3) | Default `INR` |
| default_tax_rate | numeric(9,6) | Default 0 |
| phone, email | text | |
| status | text | `ACTIVE` or `SUSPENDED` |
| created_at, updated_at | timestamptz | |
| version | bigint | |

RLS: `id` equals `app.clinic_id`.

## Migrated: branches

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| clinic_id | uuid | FK clinics |
| name | text | Unique per clinic among live rows |
| address_line, city, region, postal_code | text | |
| country_code | char(2) | Default `IN` |
| phone, email, timezone | text | Timezone empty means clinic timezone |
| operating_hours | jsonb | |
| status | text | `ACTIVE` or `INACTIVE` |
| created_at, updated_at | timestamptz | |
| created_by, updated_by | uuid | |
| version | bigint | |
| deleted_at | timestamptz | Soft delete |

## Migrated: roles, permissions, role_permissions

Reference data. `roles.code` is `OWNER`, `DOCTOR`, `RECEPTIONIST`, or `STAFF`. Permissions are global codes. No RLS; the tables contain no clinic rows.

## Migrated: users

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| clinic_id | uuid | FK clinics |
| branch_id | uuid | Nullable FK branches |
| email | text | Unique among live rows, compared case-insensitively |
| password_hash | text | Argon2id |
| display_name | text | |
| status | text | `ACTIVE` or `DISABLED` |
| failed_login_count | integer | |
| locked_until | timestamptz | |
| created_at, updated_at, version, deleted_at | | |

## Migrated: user_roles

`user_id`, `role_code`, `clinic_id`. Primary key `(user_id, role_code)`.

## Migrated: refresh_tokens

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| clinic_id, user_id | uuid | |
| family_id | uuid | Rotation family |
| token_hash | text | SHA-256 hex, unique |
| expires_at | timestamptz | |
| revoked_at | timestamptz | |
| replaced_by_id | uuid | |
| reuse_detected_at | timestamptz | |
| created_at | timestamptz | |

## Migrated: audit_events

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| clinic_id | uuid | |
| actor_user_id | uuid | Nullable |
| action, entity_type | text | |
| entity_id | uuid | Nullable |
| details | jsonb | No secrets |
| request_id | text | |
| created_at | timestamptz | |

The application role can insert and select. It cannot update or delete.

## Designed, not migrated: first slice

### clients

`id`, `clinic_id`, `display_name`, `phone`, `email`, `notes`, `consent_whatsapp`, `consent_email`, `status` (`ACTIVE`, `INACTIVE`), audit columns, `version`, `deleted_at`.

### patients

`id`, `clinic_id`, `client_id`, `name`, `species_code`, `breed`, `size_category` (`SMALL`, `MEDIUM`, `LARGE`), `date_of_birth`, `sex_code`, `color`, `microchip`, `notes`, audit columns, `version`, `deleted_at`.

Composite foreign key `(client_id, clinic_id)` to clients.

### appointments

`id`, `clinic_id`, `branch_id`, `patient_id`, `client_id`, `doctor_user_id`, `starts_at`, `ends_at`, `status` (`SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), `notes`, `version`, audit columns.

### queue_entries

`id`, `clinic_id`, `branch_id`, `appointment_id`, `patient_id`, `doctor_user_id`, `token_number`, `priority` (`NORMAL`, `EMERGENCY`), `status` (`WAITING`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), `checked_in_at`, `version`.

### consultations

`id`, `clinic_id`, `appointment_id`, `patient_id`, `doctor_user_id`, `subjective`, `history`, `examination`, `assessment`, `plan`, `vitals` jsonb, `diagnosis`, `doctor_remarks`, `doctor_notes`, `follow_up_on`, `status` (`DRAFT`, `FINALIZED`), `version`.

### consultation_differentials

`id`, `clinic_id`, `consultation_id`, `label`, `rank`, `notes`.

### prescriptions and prescription_items

Prescription: `id`, `clinic_id`, `consultation_id`, `patient_id`, `doctor_user_id`, `status` (`DRAFT`, `ISSUED`, `DISPENSED`, `CANCELLED`), `notes`, `version`.

Item: `id`, `clinic_id`, `prescription_id`, `medicine_name`, `quantity` numeric(14,3), `dosage`, `frequency`, `duration`, `route`, `instructions`, `sort_order`.

### invoices, invoice_lines, payments

Invoice: `id`, `clinic_id`, `branch_id`, `client_id`, `patient_id`, `invoice_number`, `status` (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`), `currency_code`, `subtotal`, `discount_total`, `tax_total`, `total`, `amount_paid`, `issued_at`, `version`. Unique `(clinic_id, invoice_number)`.

Line: `id`, `clinic_id`, `invoice_id`, `source_type`, `source_id`, `description`, `quantity`, `unit_price`, `discount_amount`, `tax_rate`, `tax_amount`, `line_total`.

Payment: `id`, `clinic_id`, `invoice_id`, `method` (`CASH`, `CARD`, `UPI`, `BANK_TRANSFER`, `OTHER`), `amount`, `status` (`PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`), `reference`, `idempotency_key`, `paid_at`. Unique `(clinic_id, idempotency_key)`.

### outbox_events

`id`, `clinic_id`, `event_type`, `payload` jsonb, `status` (`PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`), `attempt_count`, `next_attempt_at`, `last_error`, `created_at`, `processed_at`.

## Later table groups

Products and stock movements; vendors, purchase orders, goods receipts, purchase invoices; vaccinations and deworming doses; lab orders; surgeries; admissions; grooming bookings; services and service prices; expenses; messages and campaigns; notifications; files; export jobs; reminder dedupe keys. Each group is tenant-owned and gets RLS when it is migrated.

# Module architecture

Packages live under `com.vetos`. Each business module uses `api`, `application`, `domain`, and `infrastructure`. Modules own their tables. Cross-module reads go through an application interface or an event, not through another module's repository.

## Foundation packages

| Module | Purpose | Owns |
| --- | --- | --- |
| identity | Login, refresh, logout, CSRF, password hashing | refresh token use, password verification |
| tenant | Clinic id on the request and on the transaction | tenant context only |
| clinic | Clinic and branch records | `clinics`, `branches` |
| audit | Append-only security and business events | `audit_events` |
| platform | Errors, request ids, health, shared ids | none |

`user` accounts currently sit with identity because login and the user row are the same aggregate. A later user-admin module may expose management operations without taking over credential storage.

## Later modules

`client`, `lead`, `patient`, `appointment`, `schedule`, `queue`, `clinical`, `prescription`, `vaccination`, `laboratory`, `surgery`, `ipd`, `grooming`, `pharmacy`, `inventory`, `procurement`, `vendor`, `service`, `billing`, `payment`, `expense`, `analytics`, `communication`, `campaign`, `notification`, `file`, `report`, `export`, `ai`.

Each module, when added, documents purpose, entities, services, repositories, controllers, events, dependencies, authorization, invariants, and failure behavior in this file.

## Dependency direction

`api` depends on `application`. `application` depends on `domain`. `infrastructure` implements application ports. Controllers do not call repositories. The identity module may call the audit module through `AuditRecorder`. Clinical modules must not write invoices; billing accepts a command that snapshots lines.

# Permission matrix

Backend checks are required when the feature exists. Clinic profile updates and user administration enforce `CLINIC_MANAGE` and `USER_MANAGE` through the seeded role-permission map. Other routes still rely on authentication only until their features land.

| Capability | OWNER | DOCTOR | RECEPTIONIST | STAFF |
| --- | --- | --- | --- | --- |
| Manage clinic profile | Yes | No | No | No |
| Manage branches | Yes | No | No | No |
| Manage users and roles | Yes | No | No | No |
| Read clients and pets | Yes | Yes | Yes | Yes |
| Register clients and pets | Yes | Yes | Yes | No |
| Appointments | Yes | Own schedule | Yes | No |
| Queue | Yes | Own queue | Yes | No |
| Consultation and prescription | Yes | Yes | No | No |
| Vaccination and deworming | Yes | Yes | Yes | No |
| Laboratory | Yes | Yes | No | Yes |
| Surgery and IPD | Yes | Yes | No | No |
| Grooming | Yes | No | Yes | Yes |
| Pharmacy catalog dispense | Yes | Medicines | Yes | Yes |
| Inventory quantity changes | Yes | No | No | Yes |
| Vendors and purchase orders | Yes | No | No | No |
| Invoices and payments | Yes | No | Yes | No |
| Refunds | Yes | No | No | No |
| Expenses, analytics, campaigns | Yes | No | No | No |
| Communications and reminders | Yes | No | Yes | No |
| Audit read | Yes | No | No | No |
| Data export | Yes | No | No | No |

`OWNER` does not imply access to other clinics or to platform operations.

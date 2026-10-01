# Architecture decision records

## ADR-001 Modular monolith

Status: accepted.

VetOS is one Spring Boot application with module packages. Separate deployable services, a service mesh, and per-module databases add operational cost without a current scale or team boundary that requires them. Modules communicate through application interfaces and events inside the process.

## ADR-002 Shared schema and row-level security

Status: accepted.

All clinics share one PostgreSQL schema. Each tenant-owned row carries `clinic_id`. The application sets `app.clinic_id` for the current transaction, and forced RLS policies use that setting. A schema or database per clinic would multiply migrations and connections without a stated isolation requirement beyond clinic tenancy.

The application role does not bypass RLS. Login lookup is a fixed security-definer function because the clinic is unknown before authentication.

## ADR-003 India defaults for time and money

Status: accepted.

Timestamps are `timestamptz` in UTC. A clinic has a display timezone, default `Asia/Kolkata`. Money columns are `numeric`. The clinic currency defaults to `INR`. Display formatting uses the clinic currency and locale. The database does not store floating-point money.

## ADR-004 Invoice tax snapshot without a statutory GST engine

Status: accepted.

The production brief requires taxes where applicable and historical accuracy. It does not specify CGST, SGST, IGST, or HSN. Invoice lines store the tax rate, taxable amount, tax amount, and discount used when the invoice was issued. Clinic configuration supplies the default rate. A statutory GST breakdown needs a new requirement and a new ADR before it is built.

## ADR-005 Versions that resolved

Status: accepted.

Spring Boot `4.1.1` and Next.js `16.3.8` were available on 2026-09-30, so the locked major lines are used without substitution. The API compiles with Java 21.

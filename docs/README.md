# VetOS documentation

This directory is the source of truth for requirements, architecture, database design, APIs, business rules, security, decisions, and progress.

The running system lives in this repository:

- `apps/api` — Java 21, Spring Boot 4.1.1 modular monolith
- `apps/web` — Next.js 16 clinic application
- `docker-compose.yml` — local PostgreSQL 17, Redis, API, and web

If code and documentation disagree, identify the difference, decide the correct state, record it in [decisions/changelog.md](decisions/changelog.md), update the affected side, and test before continuing.

## Read before changing the system

1. [progress.md](progress.md)
2. [implementation-plan.md](implementation-plan.md)
3. [requirements/requirements-matrix.md](requirements/requirements-matrix.md)
4. [requirements/acceptance-criteria.md](requirements/acceptance-criteria.md)
5. [requirements/feature-catalog.md](requirements/feature-catalog.md)
6. [architecture/system-architecture.md](architecture/system-architecture.md)
7. [architecture/technology-stack.md](architecture/technology-stack.md)
8. [architecture/module-architecture.md](architecture/module-architecture.md)

Then read the database, API, business-rule, security, and testing documents that the change touches.

## Status meanings

`NOT_STARTED`, `PLANNED`, `IN_DESIGN`, `READY`, `IN_PROGRESS`, `IMPLEMENTED`, `TESTING`, `VERIFIED`, `BLOCKED`, `DEFERRED`, `PRODUCTION_READY`.

`PRODUCTION_READY` requires passing implementation, tests, security checks, tenant isolation, production validation, synchronized documentation, and no open critical bugs. Nothing in VetOS is `PRODUCTION_READY` yet.

## Current milestone

Foundation: documentation contract, authentication skeleton, tenant context, PostgreSQL row-level security, health checks, and a cross-tenant test. The clinical vertical slice is specified and not implemented.

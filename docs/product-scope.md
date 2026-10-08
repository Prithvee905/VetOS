# Product scope (honest map)

VetOS in `docs/implementation-plan.md` is an **18-phase** program (clinic ops → pharmacy → procurement → comms → export → offline → AI → AWS → production). **No single release implements all phases at once**; each phase needs migrations, APIs, permissions, RLS tests, and usually UI.

## What runs in this repository today

| Area | Status |
| --- | --- |
| Auth, tenant RLS, clinic, users, branches (read) | **Done** |
| Phase 2 slice (client → payment) | **Done** — see `docs/progress.md` |
| Swagger UI | **Done** — `/swagger-ui.html` (dev) |
| Leads, vaccinations, catalog, inventory, vendors, expenses, export jobs, outbox | **Done (API + schema)** — `V3__platform_expansion.sql` |
| Lab, surgery, IPD, grooming records | **Done (API + schema)** — same migration |
| Branch create (owner) | **Done** — `POST /api/v1/branches` |
| WhatsApp / email delivery, campaign sends | **Stub** — outbox only; no provider workers |
| S3 files, signed URLs | **Metadata only** — no blob store wired |
| Offline sync, advisory AI, Terraform/ECS | **Not implemented** — architecture in `docs/` only |

## What “complete product” still requires (your decision + ops)

1. **Workers** — process `outbox_events` (reminders, WhatsApp, email).
2. **Object storage** — S3 (or local MinIO in Compose) for `files` + pet gallery.
3. **Redis** — rate limits and job dedupe (Compose has Redis; app does not use it yet).
4. **AWS phase** — ECS, RDS, secrets, CI deploy (phase 16).
5. **Production gate** — restore drills, penetration test, load test (phases 17–18).

Use `docs/progress.md` for test evidence and `docs/implementation-plan.md` for phase checklist.

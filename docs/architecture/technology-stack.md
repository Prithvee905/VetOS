# Technology stack

Locked choices. A replacement requires an ADR and approval.

| Area | Choice | In this repository |
| --- | --- | --- |
| Web | Next.js 16.3.8, React 19, TypeScript, Tailwind CSS, shadcn/ui, Lucide, TanStack Query, Zustand, React Hook Form, Zod | Shell and design-system button |
| Offline | IndexedDB, service worker, Serwist, sync queue, UUIDv7, idempotency keys | Documented only |
| API | Java 21, Spring Boot 4.1.1, Spring Security, Spring Data JPA, Hibernate, Jakarta Validation | Foundation running |
| Mapping | MapStruct | Not introduced until a mapper is needed |
| AI | Spring AI | Not wired; provider must be configurable |
| Resilience | Resilience4j | Not wired until an external client exists |
| Jobs | Spring Scheduler, ShedLock | Not wired |
| Database | PostgreSQL 17, UUIDv7, full text search, pg_trgm | PostgreSQL 17 in Compose; pg_trgm created; FTS indexes later |
| Vectors | pgvector | Not installed; no retrieval requirement yet |
| Tenancy | Shared schema, RLS, `SET LOCAL app.clinic_id` | Implemented |
| Auth | Short-lived JWT access cookie, rotating hashed refresh cookie, Argon2id, CSRF | Implemented |
| Files | S3, signed URLs | Documented only |
| Documents | OpenHTMLToPDF, Indic fonts when required | Documented only |
| Messaging | Meta WhatsApp Cloud API, Resend | Documented only |
| Async | Transactional outbox in PostgreSQL | Table designed, worker not built |
| Cache | ElastiCache-compatible Redis | Compose service only; not a source of truth |
| Tests | JUnit 5, Testcontainers, Vitest, Testing Library, Playwright later | API and one web test |
| CI | GitHub Actions | Build and test workflow |
| IaC | Terraform, phased | Not started |
| Monitoring | Sentry, CloudWatch | Actuator health only |
| Region | ap-south-1 | Documented target |

Excluded unless a future ADR approves them: microservices, Kafka, RabbitMQ, Kubernetes, Elasticsearch, OpenSearch, ClickHouse, and a service mesh.

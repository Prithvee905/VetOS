# Testing strategy

## Backend

JUnit 5 and Spring Boot tests. PostgreSQL behavior, RLS, transactions, and constraints use Testcontainers with the `postgres:17` image. Mockito is available for pure unit tests. WireMock is added when an external HTTP client exists.

Foundation tests:

- Login, refresh rotation, refresh reuse, and logout
- Clinic A cannot read, update, or delete clinic B branches
- A session with no `app.clinic_id` sees no tenant rows
- Actuator liveness and readiness

## Frontend

Vitest and React Testing Library cover the shell. Playwright is added when a user workflow exists to click through.

## Later suites

Authorization matrix, invoice snapshot, payment idempotency, stock movement concurrency, webhook signature, export isolation, and offline conflict handling. Each ships with the feature it proves.

Fixtures are built in tests. They do not contain production secrets. The dev password loader is profile-gated and is not the test fixture.

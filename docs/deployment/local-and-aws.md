# Deployment

## Local

From the repository root:

```bash
docker compose up --build
```

PostgreSQL listens on port 5432, Redis on 6379, the API on 8080, and the web app on 3000. Flyway runs as `postgres`. The API uses `vetos_app`.

Set `VETOS_JWT_SECRET` to a random string of at least 32 bytes before any shared environment. The compose file supplies a local-only value.

## CI

GitHub Actions builds the web app and runs API tests on Java 21. API tests require Docker so Testcontainers can start PostgreSQL.

## AWS

Not provisioned. The target is ECS, ALB, RDS PostgreSQL, ElastiCache, S3, and Secrets Manager in `ap-south-1`, described in [../architecture/deployment-architecture.md](../architecture/deployment-architecture.md). Terraform is a later phase.

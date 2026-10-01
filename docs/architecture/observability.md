# Observability

Initial production signals are Sentry for application exceptions and CloudWatch for logs and metrics. Prometheus, Grafana, and Loki are not part of the first deployment.

## Now

Actuator liveness and readiness probes are enabled. Readiness includes database connectivity. Logs are structured enough to carry a request id. The API adds `X-Request-Id` to responses and to error bodies.

The API does not log passwords, refresh tokens, access tokens, or provider secrets.

## To monitor when the related feature exists

API latency, HTTP 5xx, database errors, pool exhaustion, ECS task health, outbox failures, webhook failures, WhatsApp and email failures, export failures, authentication failures, rate-limit rejections, and external provider latency.

Sentry is not configured in this milestone.

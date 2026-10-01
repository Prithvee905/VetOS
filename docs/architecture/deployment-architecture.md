# Deployment architecture

## Local

`docker-compose.yml` starts PostgreSQL 17, Redis 7, the API image, and the web image. The API migrates as the database owner and serves traffic as `vetos_app`.

## Target

Region `ap-south-1`.

CloudFront, where static web assets need it, forwards to an Application Load Balancer. ECS services run the API and the web app in private subnets where practical. RDS PostgreSQL holds the system of record. ElastiCache holds cache and rate limits. S3 holds files and exports. Secrets Manager holds database passwords, JWT HMAC secret, WhatsApp tokens, Resend keys, and AI provider keys.

Security groups allow the API to reach RDS and Redis, and the load balancer to reach the tasks. Tasks use a task role with least privilege for S3 prefixes and secrets.

## Release rules

Migrations run before or as part of startup and must be backward compatible with the previous application version during rollout. Destructive column drops wait until the old version is gone. Health checks gate traffic. Workers stop claiming new jobs on SIGTERM after the in-flight job finishes or the stop timeout hits.

Terraform is phased in later. This repository does not contain AWS resources yet.

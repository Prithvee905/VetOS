# Disaster recovery

The system of record is RDS PostgreSQL. Redis and S3 do not replace it. Redis data can be rebuilt. S3 objects for files and exports need versioning and the same region backup policy when those features exist.

## Targets to confirm before production

| Item | Initial target |
| --- | --- |
| RPO | 15 minutes, using RDS automated backups and point-in-time recovery |
| RTO | 4 hours for a database restore into a new instance and an ECS redeploy |
| Backup retention | 7 days minimum, longer if a clinic contract requires it |

A backup is not treated as valid until a restore has been executed and a tenant-scoped row count has been checked. That test has not been run.

## Restore outline

1. Restore RDS to a new instance or a point in time.
2. Point the API task definition at the restored endpoint through Secrets Manager.
3. Confirm Flyway history matches the restored schema.
4. Run the cross-tenant check and an invoice total check before opening the load balancer.

Application rollback is a previous ECS task definition. A migration that the new version already applied must remain compatible with the previous task definition, or the rollback includes a forward fix rather than a blind schema revert.

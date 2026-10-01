# Migration strategy

Flyway migrations live in `apps/api/src/main/resources/db/migration`. Names are versioned `V{n}__description.sql`. They are deterministic and reviewed in git.

Rules:

- Expand, then migrate data, then contract. Do not drop a column the running version still reads.
- Do not rewrite production rows in place when a new event row would preserve history.
- RLS and grants ship in the same migration as the table.
- Migrations run as the owner role. The application role is unchanged except for grants.
- Rollback of a bad migration is a forward migration unless the release has not been applied anywhere.
- Tests run the same migrations against PostgreSQL 17 in Testcontainers.

`V1__foundation.sql` is the only migration in this milestone.

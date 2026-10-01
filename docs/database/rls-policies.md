# RLS policies

Forced row-level security is enabled on `clinics`, `branches`, `users`, `user_roles`, `refresh_tokens`, and `audit_events`.

Policy expression:

```sql
clinic_match AS (
  clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid
)
```

For `clinics`, the column compared is `id`, because that column is the tenant id.

`USING` and `WITH CHECK` both use the expression. An empty setting matches nothing, including inserts.

`roles`, `permissions`, and `role_permissions` have no clinic column and no RLS. They are reference data. The API does not expose them for editing.

`vetos_app` is granted `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on tenant tables except `audit_events`, where `UPDATE` and `DELETE` are revoked.

The same policy shape is required on every future tenant-owned table in the migration that creates it.

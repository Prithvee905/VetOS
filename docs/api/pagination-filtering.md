# Pagination, filtering, and sorting

Large collections use page pagination until a feed needs a cursor.

Query parameters:

- `page` default 0, minimum 0
- `size` default 25, maximum 100
- `sort` a field from the endpoint's allow-list, plus `asc` or `desc`
- `q` optional search string, limited to 100 characters

The default sort is `created_at desc, id desc` so pages stay stable. The API rejects unknown sort fields. Responses are:

```json
{
  "items": [],
  "page": 0,
  "size": 25,
  "hasNext": false
}
```

Total counts are omitted when the count would be an expensive scan. Filters are endpoint-specific and listed in OpenAPI. No list endpoint runs without a limit.

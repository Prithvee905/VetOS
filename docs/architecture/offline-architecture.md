# Offline architecture

Offline support is designed and not enabled.

Allowed later, after entity rules are written: draft clinical notes, appointment requests, and other mutations that the server can reject or merge safely.

Not allowed offline:

- Stock decrements and other inventory quantity changes
- Payment confirmation and financial settlement
- Export downloads
- Permission changes

## Client stack, when enabled

IndexedDB holds a local copy and a sync queue. A service worker is built with Serwist. Each mutation stores a UUIDv7 mutation id, entity id, operation, payload, created time, retry count, status, last error, and server result. The server treats the mutation id as an idempotency key.

## Conflict rules

The server record wins when the client base version is older than the current version. The client shows the conflict and does not overwrite the server copy. Appointment booking, invoice issue, and stock movement reject conflicts rather than merging field by field.

## Sync behavior

Duplicate submission returns the original server result. Network loss leaves the item queued. Server validation errors become a visible failed item. Audit rows are written only for mutations the server accepts.

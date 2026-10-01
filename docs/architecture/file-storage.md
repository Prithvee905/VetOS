# File storage and export

Large objects go to S3. PostgreSQL stores metadata: id, clinic id, owning entity type and id, object key, content type, size, checksum, created by, and timestamps.

Object keys include the clinic id and a generated object id. The original filename is metadata, not the key. Uploads check authorization, content type, size, and that the owner entity belongs to the same clinic. Downloads use short-lived signed URLs. Permanent public S3 URLs are not issued.

Deletion follows the entity retention rule. Clinical and financial attachments are not hard-deleted as a side effect of a casual UI delete.

## Owner export

An owner requests an export. The API checks the owner role and the clinic on the session, writes an export job, and returns the job id. A worker reads only that clinic, writes CSV, XLSX, JSON, or a ZIP of documents, stores the artifact in S3, and exposes a short-lived download. Request and download are audited. Jobs expire and a cleanup job removes the object. Export of another clinic is a defect, not a feature.

This flow is specified and not implemented.

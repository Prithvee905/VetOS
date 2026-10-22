-- Address and GST number printed on tax invoices; both optional until the clinic fills them in.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gstin text;

ALTER TABLE clinics
    ADD CONSTRAINT clinics_gstin_format_chk
    CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

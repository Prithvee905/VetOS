-- V9: Add expanded vendor details including contact person, email, address, gstin, dl_number, notes
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gstin text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS dl_number text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notes text;

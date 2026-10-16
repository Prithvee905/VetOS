-- V6: Add explicit distributor and pharmaceutical company/manufacturer fields to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS distributor_name text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_person text;

UPDATE vendors SET distributor_name = name WHERE distributor_name IS NULL;

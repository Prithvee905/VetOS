-- V8: Customer categories and medicine discount rules

-- Add category to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'STANDARD';
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_category_chk;
ALTER TABLE clients ADD CONSTRAINT clients_category_chk CHECK (category IN ('STANDARD', 'LOYAL', 'NGO'));

-- Add discount rule settings to clinics
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS loyal_discount_percent numeric(5, 2) NOT NULL DEFAULT 30.00;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS ngo_consultation_discount_percent numeric(5, 2) NOT NULL DEFAULT 50.00;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS allow_medicine_discount boolean NOT NULL DEFAULT false;

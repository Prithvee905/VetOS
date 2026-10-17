ALTER TABLE clinics ADD COLUMN IF NOT EXISTS allow_staff_discounts boolean NOT NULL DEFAULT true;

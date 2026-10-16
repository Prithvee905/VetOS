-- V7: Specialties procedure charges, dog size tiered grooming, medicine valuation & distributor tracking, owner discount cap

-- 1. Specialties Charges
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS charge_amount numeric(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS charge_amount numeric(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE admissions ADD COLUMN IF NOT EXISTS daily_rate numeric(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS total_charge numeric(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE grooming_bookings ADD COLUMN IF NOT EXISTS dog_size text DEFAULT 'MEDIUM';
ALTER TABLE grooming_bookings ADD COLUMN IF NOT EXISTS charge_amount numeric(14, 2) NOT NULL DEFAULT 0.00;

-- 2. Medicine & Inventory Product Tracking (Company, Distributor, Purchase/Cost Price)
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS distributor_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price numeric(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS cost_price numeric(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS vendor_id uuid;

-- 3. Owner-Controlled Staff Discount Cap
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS max_staff_discount_percent numeric(5, 2) NOT NULL DEFAULT 20.00;

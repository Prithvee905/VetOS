-- GST-ready invoicing: HSN/SAC codes and GST rates on catalog items, codes on invoice lines,
-- and whether the clinic's prices already include GST (usual for MRP medicines in India).
ALTER TABLE services ADD COLUMN IF NOT EXISTS hsn_sac text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS gst_rate numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE services ADD CONSTRAINT services_gst_rate_chk CHECK (gst_rate >= 0 AND gst_rate <= 40);

ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD CONSTRAINT products_gst_rate_chk CHECK (gst_rate >= 0 AND gst_rate <= 40);

ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS hsn_sac text;

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT true;

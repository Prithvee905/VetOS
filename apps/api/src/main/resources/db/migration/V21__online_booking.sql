-- Online booking from the clinic's public page and by WhatsApp chat. Off until the owner turns it on.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS online_booking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS booking_slug text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS booking_open_time time NOT NULL DEFAULT '10:00';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS booking_close_time time NOT NULL DEFAULT '19:00';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS booking_slot_minutes integer NOT NULL DEFAULT 30;
-- ISO weekdays the clinic takes bookings, 1 = Monday ... 7 = Sunday.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS booking_days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}';
ALTER TABLE clinics ADD CONSTRAINT clinics_booking_slug_uq UNIQUE (booking_slug);
ALTER TABLE clinics ADD CONSTRAINT clinics_booking_slug_chk CHECK (booking_slug IS NULL OR booking_slug ~ '^[a-z0-9][a-z0-9-]{2,48}$');
ALTER TABLE clinics ADD CONSTRAINT clinics_booking_slot_chk CHECK (booking_slot_minutes BETWEEN 10 AND 120);
ALTER TABLE clinics ADD CONSTRAINT clinics_booking_hours_chk CHECK (booking_close_time > booking_open_time);

-- Where a booking came from, so reception can see online requests.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'STAFF';

-- Slots offered to a client in a WhatsApp chat ("reply 1, 2 or 3"), valid for a short time.
CREATE TABLE whatsapp_booking_offers (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    client_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    phone_digits text NOT NULL,
    slots timestamptz[] NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT whatsapp_booking_offers_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT whatsapp_booking_offers_client_fk FOREIGN KEY (client_id, clinic_id) REFERENCES clients (id, clinic_id)
);

CREATE INDEX whatsapp_booking_offers_phone_idx ON whatsapp_booking_offers (clinic_id, phone_digits, expires_at DESC);

ALTER TABLE whatsapp_booking_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_booking_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_booking_offers_tenant ON whatsapp_booking_offers
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_booking_offers TO vetos_app;

-- The public booking page has no signed-in user, so it finds its clinic through this lookup.
CREATE OR REPLACE FUNCTION app.find_booking_clinic(p_slug text)
RETURNS TABLE (booking_clinic_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT c.id FROM public.clinics c
    WHERE c.booking_slug = lower(p_slug) AND c.online_booking_enabled
$$;

REVOKE ALL ON FUNCTION app.find_booking_clinic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_booking_clinic(text) TO vetos_app;

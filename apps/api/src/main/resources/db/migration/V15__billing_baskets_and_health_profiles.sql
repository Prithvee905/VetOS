-- Server-side billing basket (one open basket per patient) so a consultation billed on one computer
-- can be completed at reception on another. Replaces browser localStorage.
CREATE TABLE billing_baskets (
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    patient_id uuid NOT NULL,
    client_id uuid,
    lines jsonb NOT NULL DEFAULT '[]'::jsonb,
    invoice_id uuid,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clinic_id, patient_id),
    CONSTRAINT billing_baskets_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT billing_baskets_lines_array_chk CHECK (jsonb_typeof(lines) = 'array')
);

-- Patient health profile (weights, allergies, notes, photo references). Replaces browser localStorage.
CREATE TABLE patient_health_profiles (
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    patient_id uuid NOT NULL,
    profile jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clinic_id, patient_id),
    CONSTRAINT patient_health_profiles_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT patient_health_profiles_object_chk CHECK (jsonb_typeof(profile) = 'object')
);

ALTER TABLE billing_baskets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_baskets FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_baskets_tenant ON billing_baskets
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE patient_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_health_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_health_profiles_tenant ON patient_health_profiles
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_baskets, patient_health_profiles TO vetos_app;

-- Vaccine protocols each clinic defines (no built-in list), and the per-pet schedule built from them.
CREATE TABLE vaccine_protocols (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    species_code text NOT NULL,
    vaccine_name text NOT NULL,
    -- Other names staff write on the card for the same vaccine, comma separated (e.g. "dhpp, 9-in-1").
    aliases text,
    -- Primary series for puppies/kittens; null first_dose_age_weeks means no primary series.
    first_dose_age_weeks integer,
    primary_doses integer NOT NULL DEFAULT 1,
    primary_interval_weeks integer NOT NULL DEFAULT 4,
    -- Repeat interval after the primary series; null means no booster.
    booster_interval_months integer,
    sort_order integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vaccine_protocols_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT vaccine_protocols_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT vaccine_protocols_doses_chk CHECK (primary_doses BETWEEN 1 AND 6),
    CONSTRAINT vaccine_protocols_interval_chk CHECK (primary_interval_weeks BETWEEN 1 AND 26),
    CONSTRAINT vaccine_protocols_age_chk CHECK (first_dose_age_weeks IS NULL OR first_dose_age_weeks BETWEEN 0 AND 520),
    CONSTRAINT vaccine_protocols_booster_chk CHECK (booster_interval_months IS NULL OR booster_interval_months BETWEEN 1 AND 60)
);

CREATE INDEX vaccine_protocols_clinic_species_idx ON vaccine_protocols (clinic_id, species_code);

CREATE TABLE vaccination_schedule (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    patient_id uuid NOT NULL,
    protocol_id uuid NOT NULL,
    dose_label text NOT NULL,
    due_on date NOT NULL,
    status text NOT NULL DEFAULT 'DUE',
    completed_dose_id uuid,
    -- The dose this entry was planned from, so reminders already sent for that dose are not repeated.
    source_dose_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vaccination_schedule_status_chk CHECK (status IN ('DUE', 'DONE', 'SKIPPED')),
    CONSTRAINT vaccination_schedule_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT vaccination_schedule_protocol_fk FOREIGN KEY (protocol_id, clinic_id) REFERENCES vaccine_protocols (id, clinic_id)
);

CREATE INDEX vaccination_schedule_patient_idx ON vaccination_schedule (clinic_id, patient_id, due_on);
CREATE INDEX vaccination_schedule_due_idx ON vaccination_schedule (clinic_id, status, due_on);

ALTER TABLE vaccination_doses ADD COLUMN IF NOT EXISTS protocol_id uuid;

ALTER TABLE vaccine_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccine_protocols FORCE ROW LEVEL SECURITY;
CREATE POLICY vaccine_protocols_tenant ON vaccine_protocols
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE vaccination_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY vaccination_schedule_tenant ON vaccination_schedule
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON vaccine_protocols, vaccination_schedule TO vetos_app;

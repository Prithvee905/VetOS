-- V5: Allow walk-in consultations to queue for the same doctor without exclusion conflicts
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_doctor_overlap;

ALTER TABLE appointments ADD CONSTRAINT appointments_no_doctor_overlap
    EXCLUDE USING gist (
        clinic_id WITH =,
        doctor_user_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND (notes IS NULL OR (notes NOT LIKE '%Walk-in%' AND notes NOT LIKE '%walk-in%')));

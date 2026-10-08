CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE clients (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    display_name text NOT NULL,
    phone text,
    email text,
    notes text,
    consent_whatsapp boolean NOT NULL DEFAULT false,
    consent_email boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    version bigint NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    CONSTRAINT clients_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT clients_id_clinic_uq UNIQUE (id, clinic_id)
);

CREATE INDEX clients_clinic_idx ON clients (clinic_id);

CREATE TABLE patients (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    species_code text NOT NULL,
    breed text,
    size_category text NOT NULL,
    date_of_birth date,
    sex_code text,
    color text,
    microchip text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    version bigint NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    CONSTRAINT patients_size_chk CHECK (size_category IN ('SMALL', 'MEDIUM', 'LARGE')),
    CONSTRAINT patients_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT patients_client_fk FOREIGN KEY (client_id, clinic_id) REFERENCES clients (id, clinic_id)
);

CREATE INDEX patients_clinic_client_idx ON patients (clinic_id, client_id);

CREATE TABLE appointments (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    client_id uuid NOT NULL,
    doctor_user_id uuid NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'SCHEDULED',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT appointments_status_chk CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    CONSTRAINT appointments_range_chk CHECK (ends_at > starts_at),
    CONSTRAINT appointments_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT appointments_branch_fk FOREIGN KEY (branch_id, clinic_id) REFERENCES branches (id, clinic_id),
    CONSTRAINT appointments_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT appointments_client_fk FOREIGN KEY (client_id, clinic_id) REFERENCES clients (id, clinic_id),
    CONSTRAINT appointments_doctor_fk FOREIGN KEY (doctor_user_id, clinic_id) REFERENCES users (id, clinic_id)
);

CREATE INDEX appointments_clinic_starts_idx ON appointments (clinic_id, starts_at);
CREATE INDEX appointments_doctor_starts_idx ON appointments (clinic_id, doctor_user_id, starts_at);

ALTER TABLE appointments ADD CONSTRAINT appointments_no_doctor_overlap
    EXCLUDE USING gist (
        clinic_id WITH =,
        doctor_user_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status NOT IN ('CANCELLED', 'NO_SHOW'));

CREATE TABLE queue_entries (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_user_id uuid NOT NULL,
    token_number integer NOT NULL,
    priority text NOT NULL DEFAULT 'NORMAL',
    status text NOT NULL DEFAULT 'WAITING',
    checked_in_at timestamptz NOT NULL DEFAULT now(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT queue_priority_chk CHECK (priority IN ('NORMAL', 'EMERGENCY')),
    CONSTRAINT queue_status_chk CHECK (status IN ('WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    CONSTRAINT queue_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT queue_appointment_fk FOREIGN KEY (appointment_id, clinic_id) REFERENCES appointments (id, clinic_id),
    CONSTRAINT queue_branch_fk FOREIGN KEY (branch_id, clinic_id) REFERENCES branches (id, clinic_id),
    CONSTRAINT queue_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT queue_doctor_fk FOREIGN KEY (doctor_user_id, clinic_id) REFERENCES users (id, clinic_id)
);

CREATE UNIQUE INDEX queue_appointment_live_idx ON queue_entries (clinic_id, appointment_id)
    WHERE status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED');

CREATE TABLE consultations (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_user_id uuid NOT NULL,
    subjective text,
    history text,
    examination text,
    assessment text,
    plan text,
    vitals jsonb NOT NULL DEFAULT '{}'::jsonb,
    diagnosis text,
    doctor_remarks text NOT NULL,
    doctor_notes text NOT NULL,
    follow_up_on date,
    status text NOT NULL DEFAULT 'DRAFT',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT consultations_status_chk CHECK (status IN ('DRAFT', 'FINALIZED')),
    CONSTRAINT consultations_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT consultations_appointment_fk FOREIGN KEY (appointment_id, clinic_id) REFERENCES appointments (id, clinic_id),
    CONSTRAINT consultations_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT consultations_doctor_fk FOREIGN KEY (doctor_user_id, clinic_id) REFERENCES users (id, clinic_id)
);

CREATE UNIQUE INDEX consultations_appointment_live_idx ON consultations (clinic_id, appointment_id);

CREATE TABLE consultation_differentials (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    consultation_id uuid NOT NULL,
    label text NOT NULL,
    rank integer NOT NULL DEFAULT 1,
    notes text,
    CONSTRAINT consultation_differentials_consultation_fk
        FOREIGN KEY (consultation_id, clinic_id) REFERENCES consultations (id, clinic_id)
);

CREATE TABLE prescriptions (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    consultation_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT prescriptions_status_chk CHECK (status IN ('DRAFT', 'ISSUED', 'DISPENSED', 'CANCELLED')),
    CONSTRAINT prescriptions_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT prescriptions_consultation_fk FOREIGN KEY (consultation_id, clinic_id) REFERENCES consultations (id, clinic_id),
    CONSTRAINT prescriptions_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT prescriptions_doctor_fk FOREIGN KEY (doctor_user_id, clinic_id) REFERENCES users (id, clinic_id)
);

CREATE TABLE prescription_items (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    prescription_id uuid NOT NULL,
    medicine_name text NOT NULL,
    quantity numeric(14, 3) NOT NULL,
    dosage text NOT NULL,
    frequency text NOT NULL,
    duration text NOT NULL,
    route text,
    instructions text,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT prescription_items_qty_chk CHECK (quantity > 0),
    CONSTRAINT prescription_items_prescription_fk FOREIGN KEY (prescription_id, clinic_id) REFERENCES prescriptions (id, clinic_id)
);

CREATE TABLE invoices (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    client_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    invoice_number text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    currency_code char(3) NOT NULL,
    subtotal numeric(14, 2) NOT NULL DEFAULT 0,
    discount_total numeric(14, 2) NOT NULL DEFAULT 0,
    tax_total numeric(14, 2) NOT NULL DEFAULT 0,
    total numeric(14, 2) NOT NULL DEFAULT 0,
    amount_paid numeric(14, 2) NOT NULL DEFAULT 0,
    issued_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT invoices_status_chk CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID')),
    CONSTRAINT invoices_amounts_chk CHECK (
        subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND total >= 0 AND amount_paid >= 0
    ),
    CONSTRAINT invoices_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT invoices_branch_fk FOREIGN KEY (branch_id, clinic_id) REFERENCES branches (id, clinic_id),
    CONSTRAINT invoices_client_fk FOREIGN KEY (client_id, clinic_id) REFERENCES clients (id, clinic_id),
    CONSTRAINT invoices_patient_fk FOREIGN KEY (patient_id, clinic_id) REFERENCES patients (id, clinic_id),
    CONSTRAINT invoices_number_uq UNIQUE (clinic_id, invoice_number)
);

CREATE TABLE invoice_lines (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    description text NOT NULL,
    quantity numeric(14, 3) NOT NULL,
    unit_price numeric(14, 2) NOT NULL,
    discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
    tax_rate numeric(9, 6) NOT NULL DEFAULT 0,
    tax_amount numeric(14, 2) NOT NULL DEFAULT 0,
    line_total numeric(14, 2) NOT NULL,
    CONSTRAINT invoice_lines_amounts_chk CHECK (
        quantity > 0 AND unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND line_total >= 0
    ),
    CONSTRAINT invoice_lines_invoice_fk FOREIGN KEY (invoice_id, clinic_id) REFERENCES invoices (id, clinic_id)
);

CREATE TABLE payments (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    method text NOT NULL,
    amount numeric(14, 2) NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    reference text,
    idempotency_key text NOT NULL,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payments_method_chk CHECK (method IN ('CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER')),
    CONSTRAINT payments_status_chk CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')),
    CONSTRAINT payments_amount_chk CHECK (amount > 0),
    CONSTRAINT payments_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT payments_invoice_fk FOREIGN KEY (invoice_id, clinic_id) REFERENCES invoices (id, clinic_id),
    CONSTRAINT payments_idempotency_uq UNIQUE (clinic_id, idempotency_key)
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_tenant ON clients
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
CREATE POLICY patients_tenant ON patients
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_tenant ON appointments
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY queue_entries_tenant ON queue_entries
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations FORCE ROW LEVEL SECURITY;
CREATE POLICY consultations_tenant ON consultations
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE consultation_differentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_differentials FORCE ROW LEVEL SECURITY;
CREATE POLICY consultation_differentials_tenant ON consultation_differentials
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY prescriptions_tenant ON prescriptions
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items FORCE ROW LEVEL SECURITY;
CREATE POLICY prescription_items_tenant ON prescription_items
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant ON invoices
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_tenant ON invoice_lines
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant ON payments
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON
    clients, patients, appointments, queue_entries, consultations, consultation_differentials,
    prescriptions, prescription_items, invoices, invoice_lines, payments
    TO vetos_app;

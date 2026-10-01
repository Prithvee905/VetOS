CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT NULLIF(current_setting('app.clinic_id', true), '')::uuid
$$;

CREATE TABLE clinics (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    legal_name text,
    timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    currency_code char(3) NOT NULL DEFAULT 'INR',
    default_tax_rate numeric(9, 6) NOT NULL DEFAULT 0,
    phone text,
    email text,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT clinics_status_chk CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    CONSTRAINT clinics_currency_chk CHECK (char_length(currency_code) = 3),
    CONSTRAINT clinics_tax_chk CHECK (default_tax_rate >= 0)
);

CREATE TABLE branches (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    name varchar(200) NOT NULL,
    address_line text,
    city text,
    region text,
    postal_code text,
    country_code char(2) NOT NULL DEFAULT 'IN',
    phone text,
    email text,
    timezone text,
    operating_hours jsonb,
    status varchar(32) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    version bigint NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    CONSTRAINT branches_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT branches_id_clinic_uq UNIQUE (id, clinic_id)
);

CREATE UNIQUE INDEX branches_live_name_idx
    ON branches (clinic_id, name)
    WHERE deleted_at IS NULL;

CREATE TABLE roles (
    code varchar(32) PRIMARY KEY,
    description text NOT NULL,
    CONSTRAINT roles_code_chk CHECK (code IN ('OWNER', 'DOCTOR', 'RECEPTIONIST', 'STAFF'))
);

CREATE TABLE permissions (
    code varchar(64) PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE role_permissions (
    role_code varchar(32) NOT NULL REFERENCES roles (code),
    permission_code varchar(64) NOT NULL REFERENCES permissions (code),
    PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE users (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    branch_id uuid,
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE',
    failed_login_count integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version bigint NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    CONSTRAINT users_status_chk CHECK (status IN ('ACTIVE', 'DISABLED')),
    CONSTRAINT users_id_clinic_uq UNIQUE (id, clinic_id),
    CONSTRAINT users_branch_fk FOREIGN KEY (branch_id, clinic_id) REFERENCES branches (id, clinic_id)
);

CREATE UNIQUE INDEX users_email_live_idx
    ON users (lower(email))
    WHERE deleted_at IS NULL;

CREATE TABLE user_roles (
    user_id uuid NOT NULL,
    role_code varchar(32) NOT NULL REFERENCES roles (code),
    clinic_id uuid NOT NULL,
    PRIMARY KEY (user_id, role_code),
    CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id, clinic_id) REFERENCES users (id, clinic_id)
);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by_id uuid,
    reuse_detected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT refresh_tokens_user_fk FOREIGN KEY (user_id, clinic_id) REFERENCES users (id, clinic_id)
);

CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    actor_user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_clinic_created_idx ON audit_events (clinic_id, created_at DESC);
CREATE INDEX branches_clinic_idx ON branches (clinic_id);
CREATE INDEX users_clinic_idx ON users (clinic_id);

INSERT INTO roles (code, description) VALUES
    ('OWNER', 'Clinic owner'),
    ('DOCTOR', 'Veterinarian'),
    ('RECEPTIONIST', 'Front office'),
    ('STAFF', 'Clinic staff');

INSERT INTO permissions (code, description) VALUES
    ('CLINIC_MANAGE', 'Manage clinic profile'),
    ('USER_MANAGE', 'Manage users and roles'),
    ('BRANCH_READ', 'Read branches'),
    ('PATIENT_WRITE', 'Register and update patients'),
    ('APPOINTMENT_WRITE', 'Manage appointments'),
    ('QUEUE_WRITE', 'Manage the queue'),
    ('CONSULTATION_WRITE', 'Write consultations and prescriptions'),
    ('INVOICE_WRITE', 'Issue invoices'),
    ('PAYMENT_WRITE', 'Record payments'),
    ('AUDIT_READ', 'Read audit events'),
    ('EXPORT_REQUEST', 'Request a clinic export');

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('OWNER', 'CLINIC_MANAGE'),
    ('OWNER', 'USER_MANAGE'),
    ('OWNER', 'BRANCH_READ'),
    ('OWNER', 'PATIENT_WRITE'),
    ('OWNER', 'APPOINTMENT_WRITE'),
    ('OWNER', 'QUEUE_WRITE'),
    ('OWNER', 'CONSULTATION_WRITE'),
    ('OWNER', 'INVOICE_WRITE'),
    ('OWNER', 'PAYMENT_WRITE'),
    ('OWNER', 'AUDIT_READ'),
    ('OWNER', 'EXPORT_REQUEST'),
    ('DOCTOR', 'BRANCH_READ'),
    ('DOCTOR', 'PATIENT_WRITE'),
    ('DOCTOR', 'APPOINTMENT_WRITE'),
    ('DOCTOR', 'QUEUE_WRITE'),
    ('DOCTOR', 'CONSULTATION_WRITE'),
    ('RECEPTIONIST', 'BRANCH_READ'),
    ('RECEPTIONIST', 'PATIENT_WRITE'),
    ('RECEPTIONIST', 'APPOINTMENT_WRITE'),
    ('RECEPTIONIST', 'QUEUE_WRITE'),
    ('RECEPTIONIST', 'INVOICE_WRITE'),
    ('RECEPTIONIST', 'PAYMENT_WRITE'),
    ('STAFF', 'BRANCH_READ'),
    ('STAFF', 'QUEUE_WRITE');

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
CREATE POLICY clinics_tenant ON clinics
    USING (id = app.current_clinic_id())
    WITH CHECK (id = app.current_clinic_id());

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
CREATE POLICY branches_tenant ON branches
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant ON users
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_roles_tenant ON user_roles
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_tokens_tenant ON refresh_tokens
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant ON audit_events
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

CREATE OR REPLACE FUNCTION app.find_login(p_email text)
RETURNS TABLE (
    user_id uuid,
    clinic_id uuid,
    password_hash text,
    status text,
    display_name text,
    failed_login_count integer,
    locked_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT u.id, u.clinic_id, u.password_hash, u.status, u.display_name,
           u.failed_login_count, u.locked_until
    FROM public.users u
    WHERE lower(u.email) = lower(p_email)
      AND u.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION app.find_refresh_token(p_hash text)
RETURNS TABLE (
    token_id uuid,
    clinic_id uuid,
    user_id uuid,
    family_id uuid,
    expires_at timestamptz,
    revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT t.id, t.clinic_id, t.user_id, t.family_id, t.expires_at, t.revoked_at
    FROM public.refresh_tokens t
    WHERE t.token_hash = p_hash
$$;

REVOKE ALL ON FUNCTION app.current_clinic_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.find_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.find_refresh_token(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO vetos_app;
GRANT EXECUTE ON FUNCTION app.current_clinic_id() TO vetos_app;
GRANT EXECUTE ON FUNCTION app.find_login(text) TO vetos_app;
GRANT EXECUTE ON FUNCTION app.find_refresh_token(text) TO vetos_app;

GRANT USAGE ON SCHEMA public TO vetos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetos_app;
REVOKE INSERT, UPDATE, DELETE ON public.roles, public.permissions, public.role_permissions FROM vetos_app;
REVOKE UPDATE, DELETE ON public.audit_events FROM vetos_app;

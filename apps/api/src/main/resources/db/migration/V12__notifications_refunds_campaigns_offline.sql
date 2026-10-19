-- In-app notifications, refunds, persisted campaigns, marketing opt-out, offline sync queue

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE in_app_notifications (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    user_id uuid REFERENCES users (id),
    title text NOT NULL,
    body text NOT NULL,
    category text NOT NULL DEFAULT 'GENERAL',
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT in_app_notifications_category_chk CHECK (category IN ('GENERAL', 'EXPORT', 'CAMPAIGN', 'REFUND', 'REMINDER', 'SYSTEM'))
);

CREATE INDEX in_app_notifications_user_idx ON in_app_notifications (clinic_id, user_id, created_at DESC);

CREATE TABLE payment_refunds (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    amount numeric(14, 2) NOT NULL,
    reason text,
    status text NOT NULL DEFAULT 'COMPLETED',
    idempotency_key text NOT NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_refunds_amount_chk CHECK (amount > 0),
    CONSTRAINT payment_refunds_status_chk CHECK (status IN ('COMPLETED', 'FAILED')),
    CONSTRAINT payment_refunds_payment_fk FOREIGN KEY (payment_id, clinic_id) REFERENCES payments (id, clinic_id),
    CONSTRAINT payment_refunds_idempotency_uq UNIQUE (clinic_id, idempotency_key)
);

CREATE TABLE marketing_campaigns (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    name text NOT NULL,
    cohort text NOT NULL,
    channel text NOT NULL DEFAULT 'WHATSAPP',
    message_template text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    targeted_count int NOT NULL DEFAULT 0,
    sent_count int NOT NULL DEFAULT 0,
    skipped_opt_out int NOT NULL DEFAULT 0,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT marketing_campaigns_status_chk CHECK (status IN ('DRAFT', 'QUEUED', 'COMPLETED', 'FAILED')),
    CONSTRAINT marketing_campaigns_channel_chk CHECK (channel IN ('WHATSAPP', 'EMAIL'))
);

CREATE TABLE marketing_campaign_deliveries (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    campaign_id uuid NOT NULL REFERENCES marketing_campaigns (id),
    client_id uuid NOT NULL,
    status text NOT NULL,
    skip_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT marketing_campaign_deliveries_status_chk CHECK (status IN ('QUEUED', 'SKIPPED', 'FAILED'))
);

ALTER TABLE marketing_campaign_deliveries
    ADD CONSTRAINT marketing_campaign_deliveries_campaign_client_uq UNIQUE (campaign_id, client_id);

CREATE TABLE offline_sync_batches (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    device_id text NOT NULL,
    status text NOT NULL DEFAULT 'RECEIVED',
    mutation_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    CONSTRAINT offline_sync_batches_status_chk CHECK (status IN ('RECEIVED', 'PROCESSED', 'REJECTED'))
);

CREATE TABLE offline_sync_mutations (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL,
    batch_id uuid NOT NULL REFERENCES offline_sync_batches (id),
    client_mutation_id text NOT NULL,
    mutation_type text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT offline_sync_mutations_status_chk CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED')),
    CONSTRAINT offline_sync_mutations_batch_client_uq UNIQUE (batch_id, client_mutation_id)
);

INSERT INTO permissions (code, description) VALUES
    ('NOTIFICATION_READ', 'Read in-app notifications'),
    ('REFUND_WRITE', 'Issue payment refunds'),
    ('CAMPAIGN_MANAGE', 'Create and run marketing campaigns'),
    ('COPILOT_READ', 'Use advisory copilot'),
    ('OFFLINE_SYNC', 'Submit offline mutation batches'),
    ('PRODUCTION_READ', 'View production readiness gates')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('OWNER', 'NOTIFICATION_READ'),
    ('OWNER', 'REFUND_WRITE'),
    ('OWNER', 'CAMPAIGN_MANAGE'),
    ('OWNER', 'COPILOT_READ'),
    ('OWNER', 'OFFLINE_SYNC'),
    ('OWNER', 'PRODUCTION_READ'),
    ('DOCTOR', 'NOTIFICATION_READ'),
    ('DOCTOR', 'COPILOT_READ'),
    ('RECEPTIONIST', 'NOTIFICATION_READ'),
    ('RECEPTIONIST', 'CAMPAIGN_MANAGE')
ON CONFLICT (role_code, permission_code) DO NOTHING;

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY in_app_notifications_tenant ON in_app_notifications
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_refunds_tenant ON payment_refunds
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY marketing_campaigns_tenant ON marketing_campaigns
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE marketing_campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY marketing_campaign_deliveries_tenant ON marketing_campaign_deliveries
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE offline_sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_sync_batches_tenant ON offline_sync_batches
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

ALTER TABLE offline_sync_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_mutations FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_sync_mutations_tenant ON offline_sync_mutations
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

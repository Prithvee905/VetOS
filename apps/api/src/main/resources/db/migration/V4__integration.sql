CREATE TABLE provider_webhook_events (
    id uuid PRIMARY KEY,
    provider text NOT NULL,
    external_event_id text NOT NULL,
    clinic_id uuid REFERENCES clinics (id),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT provider_webhook_events_uq UNIQUE (provider, external_event_id)
);

CREATE INDEX provider_webhook_events_received_idx ON provider_webhook_events (received_at DESC);

ALTER TABLE provider_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_webhook_events_tenant ON provider_webhook_events
    USING (clinic_id IS NULL OR clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id IS NULL OR clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT ON provider_webhook_events TO vetos_app;

CREATE OR REPLACE FUNCTION app.claim_outbox_events(p_limit integer)
RETURNS TABLE (
    outbox_id uuid,
    outbox_clinic_id uuid,
    outbox_event_type text,
    outbox_payload jsonb,
    outbox_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH picked AS (
        SELECT o.id
        FROM outbox_events o
        WHERE o.status = 'PENDING'
          AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= now())
        ORDER BY o.created_at
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events o
    SET status = 'PROCESSING',
        attempt_count = o.attempt_count + 1
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.id, o.clinic_id, o.event_type, o.payload, o.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION app.claim_outbox_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_outbox_events(integer) TO vetos_app;

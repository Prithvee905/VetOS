-- Messages clients send to the clinic's WhatsApp number (replies to reminders, booking requests).
CREATE TABLE whatsapp_inbound_messages (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    client_id uuid,
    from_phone text NOT NULL,
    provider_message_id text NOT NULL,
    message_type text NOT NULL,
    body text,
    received_at timestamptz NOT NULL,
    read_at timestamptz,
    handled_action text,
    CONSTRAINT whatsapp_inbound_provider_uq UNIQUE (provider_message_id)
);

CREATE INDEX whatsapp_inbound_clinic_received_idx ON whatsapp_inbound_messages (clinic_id, received_at DESC);

ALTER TABLE whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_inbound_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_inbound_messages_tenant ON whatsapp_inbound_messages
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT, UPDATE ON whatsapp_inbound_messages TO vetos_app;

-- Webhook calls carry no tenant, so this resolves which clinic (and client) a sender belongs to:
-- 1) the clinic that most recently messaged the number, 2) a client registered with the number,
-- 3) on a single-clinic deployment, that clinic (sender not yet a client).
CREATE OR REPLACE FUNCTION app.resolve_whatsapp_sender(p_phone text)
RETURNS TABLE (sender_clinic_id uuid, sender_client_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
BEGIN
    IF length(v_digits) < 10 THEN
        RETURN;
    END IF;

    RETURN QUERY
        SELECT o.clinic_id,
               (SELECT c.id FROM clients c
                 WHERE c.clinic_id = o.clinic_id
                   AND c.deleted_at IS NULL
                   AND right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_digits
                 ORDER BY c.created_at
                 LIMIT 1)
        FROM outbox_events o
        WHERE o.event_type = 'WHATSAPP_MESSAGE'
          AND right(regexp_replace(coalesce(o.payload->>'to', ''), '\D', '', 'g'), 10) = v_digits
        ORDER BY o.created_at DESC
        LIMIT 1;
    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
        SELECT c.clinic_id, c.id
        FROM clients c
        WHERE c.deleted_at IS NULL
          AND right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_digits
        ORDER BY c.created_at
        LIMIT 1;
    IF FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
        SELECT cl.id, NULL::uuid
        FROM clinics cl
        WHERE (SELECT count(*) FROM clinics) = 1;
END;
$$;

REVOKE ALL ON FUNCTION app.resolve_whatsapp_sender(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_whatsapp_sender(text) TO vetos_app;

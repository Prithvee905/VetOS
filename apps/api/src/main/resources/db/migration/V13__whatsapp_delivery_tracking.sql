ALTER TABLE outbox_events
    ADD COLUMN IF NOT EXISTS provider_message_id text,
    ADD COLUMN IF NOT EXISTS delivery_status text;

CREATE INDEX IF NOT EXISTS outbox_events_provider_message_idx
    ON outbox_events (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.apply_whatsapp_delivery_status(
    p_provider_message_id text,
    p_delivery_status text,
    p_last_error text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE outbox_events
    SET delivery_status = p_delivery_status,
        last_error = p_last_error
    WHERE provider_message_id = p_provider_message_id;
    RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION app.apply_whatsapp_delivery_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_whatsapp_delivery_status(text, text, text) TO vetos_app;

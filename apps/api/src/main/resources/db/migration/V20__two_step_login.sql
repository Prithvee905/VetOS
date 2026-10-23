-- Two-step login with an authenticator app (TOTP). Secrets are stored encrypted by the API.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;
-- Last 30-second time step accepted, so a code cannot be replayed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint;

-- When on, owners and doctors must set up two-step login before using the app.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS require_two_step boolean NOT NULL DEFAULT false;

-- One-time recovery codes for a lost phone (stored as SHA-256 hashes).
CREATE TABLE user_recovery_codes (
    id uuid PRIMARY KEY,
    clinic_id uuid NOT NULL REFERENCES clinics (id),
    user_id uuid NOT NULL REFERENCES users (id),
    code_hash text NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_recovery_codes_user_idx ON user_recovery_codes (user_id);

ALTER TABLE user_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recovery_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY user_recovery_codes_tenant ON user_recovery_codes
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON user_recovery_codes TO vetos_app;

-- Login lookup now also says whether the account uses two-step login.
DROP FUNCTION app.find_login(text);
CREATE FUNCTION app.find_login(p_email text)
RETURNS TABLE (
    user_id uuid,
    clinic_id uuid,
    password_hash text,
    status text,
    display_name text,
    failed_login_count integer,
    locked_until timestamptz,
    two_step_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT u.id, u.clinic_id, u.password_hash, u.status, u.display_name,
           u.failed_login_count, u.locked_until, u.totp_enabled_at IS NOT NULL
    FROM public.users u
    WHERE lower(u.email) = lower(p_email)
      AND u.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION app.find_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_login(text) TO vetos_app;

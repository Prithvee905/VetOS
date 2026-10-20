# WhatsApp production setup (Meta Cloud API)

## Environment variables

Set on the API host (never in the web app):

| Variable | Purpose |
| --- | --- |
| `META_WHATSAPP_TOKEN` | Permanent or system user token with `whatsapp_business_messaging` |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from Meta (used in Graph URL) |
| `VETOS_WHATSAPP_VERIFY_TOKEN` | Random string; same value in Meta webhook configuration |
| `VETOS_WHATSAPP_API_BASE_URL` | Optional override; default `https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages` |

Example:

```bash
META_WHATSAPP_TOKEN=EAAxxxxx
META_WHATSAPP_PHONE_NUMBER_ID=123456789012345
VETOS_WHATSAPP_VERIFY_TOKEN=your-random-verify-token
```

**Important:** Put the token on a **single line** with **no quotes** and no `Bearer ` prefix.  
If Graph returns **OAuth 190 / Malformed access token**, the string in `.env.production` was corrupted (common when shell scripts `source` the file). Use `bash scripts/verify-whatsapp-token.sh` after editing.

## Webhook URL

In Meta Developer Console → WhatsApp → Configuration:

- **Callback URL:** `https://<your-public-host>/api/v1/webhooks/whatsapp`
- **Verify token:** same as `VETOS_WHATSAPP_VERIFY_TOKEN`
- Subscribe to: `messages` (and `message_template_status_update` if available)

Inbound events and **delivery statuses** are stored and linked to outbox rows via Meta message id (`wamid`).

## Local development

Without tokens, the API **stubs** sends (log only). Use a tunnel (ngrok, Cloudflare Tunnel) to test webhooks against local Docker.

## Templates

Approve templates listed in [whatsapp-meta-templates.md](./whatsapp-meta-templates.md) before sending reminders or campaigns.

## Outbox shows `401 Unauthorized`

Meta rejected the access token. The worker and UI are working; the token on the server is wrong or expired.

1. **Do not use** the short-lived “temporary access token” from the API Setup page for production (it expires in ~24 hours).
2. Create a **System User** token (recommended):
   - [Meta Business Settings](https://business.facebook.com/settings) → **Users** → **System users** → your system user → **Generate token**
   - Select your **ClinicOS / VetOS** app
   - Permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
   - Copy the token once (starts with `EAA…`)
3. On EC2, edit `.env.production`:
   ```bash
   META_WHATSAPP_TOKEN=EAApaste_here_no_quotes
   META_WHATSAPP_PHONE_NUMBER_ID=from_whatsapp_api_setup
   ```
4. Recreate the API container so env is reloaded:
   ```bash
   cd ~/VetOS
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
   ```
5. In the app: **Communications → Process queue now**, or send a new test `hello_world`.

`PHONE_NUMBER_ID` must belong to the same WhatsApp Business Account as the token.

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

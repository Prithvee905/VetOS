# Meta WhatsApp templates (VetOS)

Create and **approve** these templates in [Meta Business Manager](https://business.facebook.com/) → WhatsApp Manager → Message templates. Names must match exactly (lowercase, underscores).

## Required templates

| Meta template name | Category | Body (example) | Variables |
| --- | --- | --- | --- |
| `appointment_reminder` | Utility | Hello {{1}}, reminder: {{2}} has a vet appointment on {{3}}. | 1=owner name, 2=pet name, 3=date/time |
| `vax_due` | Utility | Hello {{1}}, vaccination {{2}} for {{3}} is due on {{4}}. | 1=owner, 2=vaccine, 3=pet, 4=due date |
| `deworm_due` | Utility | Hello {{1}}, deworming ({{2}}) for {{3}} is due on {{4}}. | 1=owner, 2=product, 3=pet, 4=due date |
| `followup_reminder` | Utility | Hello {{1}}, follow-up for {{2}} with Dr. {{3}} on {{4}}. | 1=owner, 2=pet, 3=doctor, 4=date |
| `campaign_notice` | Marketing | Hello {{1}}, message from {{2}} regarding {{3}}. | 1=owner, 2=clinic name, 3=pet or short note |
| `hello_world` | Utility | (Meta sample) | none |
| `invoice_pdf_alert` | Utility | Document header (PDF) + body with {{1}} owner name | 1=owner name; PDF generated server-side |
| `invoice_alert` | Utility | Text invoice notice (no attachment) | per Meta template |

Language code used in API: **`en`** (map to `en_US` in Meta if required for `hello_world`).

## Logical keys in code

The API maps reminder/campaign template keys to Meta names:

- `APPOINTMENT_REMINDER` → `appointment_reminder`
- `VAX_REMINDER` → `vax_due`
- `DEWORM_REMINDER` → `deworm_due`
- `FOLLOWUP_REMINDER` → `followup_reminder`
- `CAMPAIGN_*` / `BROADCAST_*` / `DEFAULT` → `campaign_notice`
- `INVOICE_PDF` → `invoice_pdf_alert` (requires `invoiceId` on `/api/v1/communications/whatsapp`)
- `INVOICE_ALERT` → `invoice_alert`

## Session messages (24-hour window)

Staff replies to an active customer chat may use `sessionMessage: true` in the outbox payload to send **plain text** instead of a template. All automated reminders and campaigns must use templates above.

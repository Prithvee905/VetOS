# Notification architecture

One notification record represents a message to a recipient inside a clinic. Channels are in-app, WhatsApp, and email. Each record stores recipient, clinic, type, status, created time, and delivery attempts.

Transactional sends and campaigns both pass through the outbox. The core clinical or invoice transaction does not call Meta or Resend.

## Providers

- WhatsApp: Meta Cloud API, approved templates, webhook verification, signature check, provider event id uniqueness, opt-in and opt-out.
- Email: Resend, verified sender, retry on failure, unsubscribe where the message is marketing.

## Reminders

Appointment, vaccination, deworming, and follow-up reminders are scheduled jobs. A unique key of clinic, subject, channel, and due instant prevents duplicates. Jobs are tenant-aware and safe on multiple instances.

## Campaigns

A campaign has an audience, template, channel, schedule, and status. Opted-out recipients are removed before send. Delivery and failure are tracked per recipient.

None of these senders are implemented.

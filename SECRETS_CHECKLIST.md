# CleanerX — Secrets Checklist

Check each secret is set before deploying:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only)
- [ ] `SESSION_SECRET` — Secret for session signing
- [ ] `TWILIO_ACCOUNT_SID` — (optional) Twilio account SID for WhatsApp notifications
- [ ] `TWILIO_AUTH_TOKEN` — (optional) Twilio auth token
- [ ] `TWILIO_WHATSAPP_FROM` — (optional) Twilio WhatsApp sender number

## Notes
- Never commit `.env.local` to version control.
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser.

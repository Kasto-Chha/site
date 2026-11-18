-- Patch 14o: messaging the owner on WhatsApp by hand.
--
-- The team sends the owner a short WhatsApp message ("2 things need you, here is your link"). No WhatsApp service is involved:
-- the team's own phone sends it. Two things are remembered per business, so nobody has to ask around:
--   owner_whatsapp     the owner's WhatsApp number, digits only with the country code (for example 9779841000000). Optional.
--   owner_messaged_at  when the team last messaged the owner, so two people do not send the same reminder.
-- Only the server reads or writes these. Additive and safe to run twice. Run it BEFORE pushing patch 14o.

alter table public.sync_merchants add column if not exists owner_whatsapp text check (owner_whatsapp is null or owner_whatsapp ~ '^[0-9]{8,15}$');
alter table public.sync_merchants add column if not exists owner_messaged_at timestamptz;

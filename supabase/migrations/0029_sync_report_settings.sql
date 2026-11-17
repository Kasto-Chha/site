-- Patch 14e: what the audit report says about price and how to reach us, kept in the database so a team member can change it
-- without a redeploy.
--
-- sync_report_settings holds one row (id 'default'). sync_prospects.report_contacts holds a copy of those values taken at the
-- moment a report is recorded as sent, so a report an owner already received keeps the price it showed that day.
--
-- Only the server reads or writes either: row level security is on and the public key is refused outright. Additive and safe to
-- run twice: one new table and one new column, nothing that exists is changed.

create table if not exists public.sync_report_settings (
  id text primary key check (id = 'default'),
  price text check (price is null or char_length(price) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 40),
  booking_link text check (booking_link is null or char_length(booking_link) <= 300),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.sync_report_settings enable row level security;
revoke all on table public.sync_report_settings from anon, authenticated;

alter table public.sync_prospects add column if not exists report_contacts jsonb;

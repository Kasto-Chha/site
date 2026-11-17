-- Patch 14d: prospects (the Audit tool).
--
-- A prospect is a business we are pitching. It is not on KastoChha until the owner says yes, so it lives apart from
-- sync_merchants. It holds the facts typed in from the business's public Google profile, the three drafts the team wrote, who
-- ticked that they were checked, and where the pitch stands. When the owner agrees it is tagged as a business, and merchant_id
-- then points at it; if that business is later deleted the link is cleared and the prospect stays.
--
-- Only the server reads or writes it: row level security is on and the public key is refused outright, the same as the other
-- Sync tables. Additive only: it changes no existing table or row, and it is safe to run more than once.

create table if not exists public.sync_prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(business_name) between 1 and 120),
  area text not null check (char_length(area) between 1 and 80),
  business_kind text not null default 'cafe',
  kind_label text check (kind_label is null or char_length(kind_label) <= 60),
  google_maps_url text check (google_maps_url is null or char_length(google_maps_url) <= 500),
  match_key text not null check (char_length(match_key) between 1 and 200),
  facts jsonb not null default '{}'::jsonb,
  drafts jsonb not null default '{}'::jsonb,
  facts_checked boolean not null default false,
  drafts_checked boolean not null default false,
  status text not null default 'new' check (status in ('new', 'typed', 'report_ready', 'sent', 'replied', 'declined', 'tagged')),
  sent_via text check (sent_via is null or sent_via in ('email', 'whatsapp', 'in_person')),
  sent_on date,
  follow_up_on date,
  merchant_id uuid references public.sync_merchants(id) on delete set null,
  created_by text not null check (char_length(created_by) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists sync_prospects_status_idx on public.sync_prospects (status, created_at desc);
create index if not exists sync_prospects_match_idx on public.sync_prospects (match_key);
create index if not exists sync_prospects_merchant_idx on public.sync_prospects (merchant_id) where merchant_id is not null;

alter table public.sync_prospects enable row level security;
revoke all on table public.sync_prospects from anon, authenticated;

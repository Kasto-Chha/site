-- KastoChha Sync, foundation (Stage A, patch 1 of 8).
--
-- The tables behind the QR hub, business threads and private feedback, plus a
-- `source` column on posts for the "Visited" label. Nothing on the live site reads
-- these tables yet: later patches add the admin screen, the business thread page, the
-- hub and the feedback inbox on top of them.
--
-- SECURITY. Every sync_ table has row level security ON and NO policy, and the public
-- roles have no privileges on them. That means the public (anon) key cannot read or
-- write any of it, which matters most for sync_feedback (private notes) and for
-- merchants' owner accounts. Only the server, using the service role, touches these
-- tables, and it does its own role checks. Do not add a public read policy here
-- without checking what the table holds first.
--
-- A thread on KastoChha is not a row: it is the posts in `reviews` that share a
-- topic_slug. A merchant therefore stores the thread's slug (topic_slug), pinned when
-- the business is tagged and never recomputed, so renaming a café never splits its
-- thread. slug is the café's own address for /hub/[slug].
--
-- Idempotent: the migration runner re-runs every file, so each statement is safe to
-- repeat.

create table if not exists public.sync_merchants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  topic_slug text not null,
  business_name text not null,
  area text not null,
  business_kind text not null default 'cafe',
  category text not null default 'Food',
  about text,
  google_place_id text,
  google_review_url text,
  google_maps_url text,
  owner_user_id text,
  status text not null default 'active',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_merchants_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint sync_merchants_topic_slug_format
    check (topic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(topic_slug) <= 120),
  constraint sync_merchants_status_check
    check (status in ('active', 'cancelled')),
  constraint sync_merchants_about_length
    check (about is null or char_length(about) <= 400),
  constraint sync_merchants_name_length
    check (char_length(business_name) between 1 and 120 and char_length(area) between 1 and 80)
);

create unique index if not exists sync_merchants_slug_key
  on public.sync_merchants (slug);
create unique index if not exists sync_merchants_topic_slug_key
  on public.sync_merchants (topic_slug);
create index if not exists sync_merchants_owner_idx
  on public.sync_merchants (owner_user_id) where owner_user_id is not null;

-- One row per printed QR code (a table, the counter, ...). Scans are counted from
-- sync_events rather than a counter column here, so two scans at once cannot lose one.
create table if not exists public.sync_qr_codes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants (id) on delete cascade,
  code text not null,
  label text not null default 'Table',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sync_qr_codes_code_format check (code ~ '^[a-z0-9]{8,24}$'),
  constraint sync_qr_codes_label_length check (char_length(label) between 1 and 60)
);

create unique index if not exists sync_qr_codes_code_key
  on public.sync_qr_codes (code);
create index if not exists sync_qr_codes_merchant_idx
  on public.sync_qr_codes (merchant_id);

-- What happens at the hub. Deliberately no address, name or device is stored: the
-- point is counts per café, not tracking people.
create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants (id) on delete cascade,
  qr_code_id uuid references public.sync_qr_codes (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sync_events_type_check check (event_type in (
    'scan', 'hub_share', 'hub_google', 'hub_ask', 'hub_note', 'hub_maps',
    'post_created', 'google_copy'
  )),
  constraint sync_events_metadata_size check (octet_length(metadata::text) <= 1000)
);

create index if not exists sync_events_merchant_time_idx
  on public.sync_events (merchant_id, created_at desc);
create index if not exists sync_events_type_time_idx
  on public.sync_events (event_type, created_at desc);

-- Private notes from the hub. Contact is optional and only what the person chose to
-- type. These never appear on the public site.
create table if not exists public.sync_feedback (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants (id) on delete cascade,
  message text not null,
  contact text,
  is_urgent boolean not null default false,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  constraint sync_feedback_message_length check (char_length(message) between 1 and 2000),
  constraint sync_feedback_contact_length check (contact is null or char_length(contact) <= 120),
  constraint sync_feedback_status_check check (status in ('new', 'in_digest', 'resolved'))
);

create index if not exists sync_feedback_merchant_status_idx
  on public.sync_feedback (merchant_id, status, created_at desc);

-- Row level security on, no policy, no privileges for the public roles.
alter table public.sync_merchants enable row level security;
alter table public.sync_qr_codes enable row level security;
alter table public.sync_events enable row level security;
alter table public.sync_feedback enable row level security;

revoke all on table public.sync_merchants from anon, authenticated;
revoke all on table public.sync_qr_codes from anon, authenticated;
revoke all on table public.sync_events from anon, authenticated;
revoke all on table public.sync_feedback from anon, authenticated;

-- "Visited": set by the server only, and only when a post arrives with a valid,
-- unexpired hub token for that café (a later patch). Null for every ordinary post.
alter table public.reviews
  add column if not exists source text
  constraint reviews_source_check check (source is null or source in ('qr'));

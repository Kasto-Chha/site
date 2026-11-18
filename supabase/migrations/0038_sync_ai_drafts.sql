-- Patch 14p: optional AI first drafts of review replies.
--
-- The team can press "Draft a reply" on a review and get a first draft to edit. It is OFF until an admin turns it on. Two small tables:
--   sync_ai_settings  one row (id = 1): whether AI drafts are on, who last changed it and when. Starts OFF.
--   sync_ai_usage     how many drafts one business used on one day, so the free Gemini allowance cannot run out. Deleted with the business.
-- Only the server reads or writes them: row level security is on and the public key is refused outright, like the other Sync tables.
-- Additive and safe to run twice: new tables only, nothing that exists is changed.

create table if not exists public.sync_ai_settings (
  id smallint primary key check (id = 1),
  replies_enabled boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.sync_ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sync_ai_usage (
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (merchant_id, day)
);

alter table public.sync_ai_settings enable row level security;
alter table public.sync_ai_usage enable row level security;
revoke all on table public.sync_ai_settings from anon, authenticated;
revoke all on table public.sync_ai_usage from anon, authenticated;

-- Patch 14h: profile health, typed in by hand.
--
-- A "check" is a snapshot of what a business's public Google profile shows on one day: the answers to the 22 questions (facts),
-- and the counts worked out from them. Checking again adds a new snapshot, so the history of the score is kept. When the Google
-- connection exists these can be filled by it instead.
--
-- Only the server reads or writes it: row level security is on and the public key is refused outright, the same as the other
-- Sync tables. If a business is deleted its checks go with it. Additive and safe to run twice: one new table, nothing that exists
-- is changed.

create table if not exists public.sync_health_checks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  checked_on date not null,
  facts jsonb not null default '{}'::jsonb,
  passing integer not null check (passing between 0 and 22),
  failing integer not null check (failing between 0 and 22),
  unknown integer not null check (unknown between 0 and 22),
  score integer check (score is null or score between 0 and 100),
  checked_by text,
  created_at timestamptz not null default now()
);

create index if not exists sync_health_checks_merchant_idx on public.sync_health_checks (merchant_id, created_at desc);

alter table public.sync_health_checks enable row level security;
revoke all on table public.sync_health_checks from anon, authenticated;

-- Patch 14i: the posts plan, typed in by hand.
--
-- A post is something a business will put on its Google profile: an update, an offer or an event. The team plans it, drafts it,
-- sends it to the owner, and marks it posted by hand until the Google connection exists. Only the server reads or writes it: row
-- level security is on and the public key is refused outright, like the other Sync tables. If a business is deleted its posts go
-- with it. Additive and safe to run twice: one new table, nothing that exists is changed.

create table if not exists public.sync_posts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1500),
  kind text not null default 'update' check (kind in ('update', 'offer', 'event')),
  status text not null default 'idea' check (status in ('idea', 'drafted', 'waiting', 'approved', 'published')),
  planned_on date,
  button_link text check (button_link is null or char_length(button_link) <= 300),
  published_on date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_posts_merchant_idx on public.sync_posts (merchant_id, planned_on);

alter table public.sync_posts enable row level security;
revoke all on table public.sync_posts from anon, authenticated;

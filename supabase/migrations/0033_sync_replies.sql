-- Patch 14j: the replies queue, typed in by hand.
--
-- A row is one customer review on a business's Google profile that needs an answer: who wrote it, the stars and words (pasted by
-- the team), our draft of the reply, and where it is: new, asking the owner, drafted, waiting for the owner, approved, posted.
-- Posting is done by hand on Google until the Google connection is approved.
--
-- Only the server reads or writes it: row level security is on and the public key is refused outright, like the other Sync tables.
-- If a business is deleted its replies go with it. Additive and safe to run twice: one new table, nothing that exists is changed.

create table if not exists public.sync_replies (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  reviewer text not null check (char_length(reviewer) between 1 and 80),
  stars integer check (stars is null or stars between 1 and 5),
  review text not null default '' check (char_length(review) <= 1500),
  draft text not null default '' check (char_length(draft) <= 4000),
  status text not null default 'new' check (status in ('new', 'asking', 'drafted', 'waiting', 'approved', 'posted')),
  review_on date,
  posted_on date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_replies_merchant_idx on public.sync_replies (merchant_id, review_on);

alter table public.sync_replies enable row level security;
revoke all on table public.sync_replies from anon, authenticated;

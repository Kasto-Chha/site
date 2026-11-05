-- KastoChha Sync, patch 8: a business's reply to one specific post, from the account the team linked to it.
--
-- A reply lives in its own table, not among the posts. That is deliberate: everything that counts or ranks
-- experiences (the Ramro / Thikai / Naramro tally, experience counts, trending, votes, the "Visited" label,
-- the Overview) reads the reviews table and never sees this one, so a reply cannot be mistaken for an
-- experience by any of it, now or by code written later.
--
-- One reply per post, enforced here and not only in code: a second reply, even from a double click or two
-- tabs at once, is refused by the database. A reply goes when its post goes (a person deleting their own
-- post takes the answer to it with it), and when its business goes.

create table if not exists public.sync_owner_replies (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants (id) on delete cascade,
  review_id uuid not null references public.reviews (id) on delete cascade,
  -- Which account wrote it (the one linked to the business at the time). Never sent to a browser.
  author_user_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint sync_owner_replies_body_length check (char_length(body) between 1 and 1500),
  constraint sync_owner_replies_review_id_key unique (review_id)
);

create index if not exists sync_owner_replies_merchant_idx
  on public.sync_owner_replies (merchant_id, created_at desc);

-- Row level security on, no policy, no privileges for the public roles: only the server reads or writes it.
alter table public.sync_owner_replies enable row level security;
revoke all on table public.sync_owner_replies from anon, authenticated;

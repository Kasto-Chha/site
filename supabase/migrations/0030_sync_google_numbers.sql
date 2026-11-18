-- Patch 14g: the Google numbers, typed in by hand once a month.
--
-- Until the Google connection is approved, a team member opens the business's Business Profile screen on Google, reads the
-- Performance figures and types them in. One row per business per month; typing a month again replaces it. When the connection
-- exists these rows can be filled by it instead, and the table stays as the history.
--
-- Only the server reads or writes it: row level security is on and the public key is refused outright, the same as the other
-- Sync tables. If a business is deleted its numbers go with it. Additive and safe to run twice: one new table, nothing that
-- exists is changed.

create table if not exists public.sync_google_numbers (
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  calls integer check (calls is null or calls between 0 and 1000000),
  directions integer check (directions is null or directions between 0 and 1000000),
  profile_views integer check (profile_views is null or profile_views between 0 and 100000000),
  rating numeric(2, 1) check (rating is null or rating between 0 and 5),
  reviews integer check (reviews is null or reviews between 0 and 1000000),
  note text check (note is null or char_length(note) <= 300),
  entered_by text,
  entered_at timestamptz not null default now(),
  primary key (merchant_id, month)
);

alter table public.sync_google_numbers enable row level security;
revoke all on table public.sync_google_numbers from anon, authenticated;

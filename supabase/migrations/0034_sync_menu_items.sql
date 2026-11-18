-- Patch 14l: the menu, rooms and rates (or services), typed in by hand.
--
-- One row is one thing a business offers: a dish or drink, a room type, a service. The words each business type uses are decided in
-- the code; the table is the same for all of them. The owner confirms the list: an item is a draft, then waiting for the owner,
-- then confirmed. The price is a whole number of rupees (or none), with a short unit such as "per night".
--
-- Only the server reads or writes it: row level security is on and the public key is refused outright, like the other Sync tables.
-- If a business is deleted its items go with it. Additive and safe to run twice: one new table, nothing that exists is changed.

create table if not exists public.sync_menu_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  section text not null default '' check (char_length(section) <= 60),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  price integer check (price is null or price between 0 and 100000000),
  unit text not null default '' check (char_length(unit) <= 40),
  status text not null default 'draft' check (status in ('draft', 'waiting', 'confirmed')),
  position integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_menu_items_merchant_idx on public.sync_menu_items (merchant_id, position);

alter table public.sync_menu_items enable row level security;
revoke all on table public.sync_menu_items from anon, authenticated;

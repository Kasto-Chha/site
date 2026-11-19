-- Patch 14q: billing, recorded by hand.
--
-- Businesses pay us outside the site (cash, bank transfer, eSewa, Khalti). The team records each payment here, so we always know who is
-- paid up, who is due and who is late, and can give a receipt. No payment service is involved.
--   sync_billing_settings  one row (id = 1): the standard monthly price in rupees, how to pay (shown on receipts and reminders), and the
--                          issuer line printed on receipts.
--   sync_merchants.monthly_price  a price agreed for one business; empty means the standard price.
--   sync_payments          one row per payment received: the amount, the months it covers (from/to dates), how it was paid, a short
--                          reference, and a receipt number. A payment is never deleted: a mistake is voided, with a reason, and kept.
-- Only the server reads or writes them: row level security is on and the public key is refused outright, like the other Sync tables.
-- Deleting a business deletes its payments. Additive and safe to run twice: new tables and one new column only.

create table if not exists public.sync_billing_settings (
  id smallint primary key check (id = 1),
  standard_monthly integer check (standard_monthly is null or (standard_monthly >= 0 and standard_monthly <= 10000000)),
  instructions text not null default '' check (char_length(instructions) <= 500),
  issuer text not null default '' check (char_length(issuer) <= 300),
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.sync_billing_settings (id) values (1) on conflict (id) do nothing;

alter table public.sync_merchants add column if not exists monthly_price integer check (monthly_price is null or (monthly_price >= 0 and monthly_price <= 10000000));

create table if not exists public.sync_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  receipt_no bigint not null unique,
  amount integer not null check (amount > 0 and amount <= 100000000),
  months integer not null check (months between 1 and 12),
  paid_on date not null,
  period_from date not null,
  period_to date not null,
  method text not null check (method in ('cash', 'bank', 'esewa', 'khalti', 'other')),
  reference text not null default '' check (char_length(reference) <= 60),
  note text not null default '' check (char_length(note) <= 300),
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 200),
  recorded_by text,
  created_at timestamptz not null default now(),
  check (period_to >= period_from)
);

create index if not exists sync_payments_merchant_idx on public.sync_payments (merchant_id, period_to);

alter table public.sync_billing_settings enable row level security;
alter table public.sync_payments enable row level security;
revoke all on table public.sync_billing_settings from anon, authenticated;
revoke all on table public.sync_payments from anon, authenticated;

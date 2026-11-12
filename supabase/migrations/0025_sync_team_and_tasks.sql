-- Patch 13: operators and tasks.
--
-- sync_operators is the list of operators, for the Team page: Clerk keeps each account's role but cannot list accounts by role.
-- The role itself stays in Clerk, which is what grants access; this table only says who to show.
--
-- sync_operator_assignments says which businesses an operator (a team member below admin) may work on. An operator
-- sees and edits only the businesses listed here. If a business is deleted its assignments go with it.
--
-- sync_tasks is the team's to-do list: one thing to do for one business, who does it, and by when.
--
-- All three tables hold account ids and the team's own working words, never names or emails. Row level security is on and the
-- public key is refused outright (the same as sync_owner_replies, 0023, and the audit log, 0024): only the server reads or
-- writes them. Additive only: it changes no existing table or row, and it is safe to run more than once.

create table if not exists public.sync_operators (
  operator_user_id text primary key check (char_length(operator_user_id) between 1 and 100),
  added_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_operator_assignments (
  operator_user_id text not null check (char_length(operator_user_id) between 1 and 100),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  assigned_by text,
  created_at timestamptz not null default now(),
  primary key (operator_user_id, merchant_id)
);

create index if not exists sync_operator_assignments_merchant_idx
  on public.sync_operator_assignments (merchant_id);

create table if not exists public.sync_tasks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.sync_merchants(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 1000),
  task_type text not null default 'other' check (task_type in ('hours', 'holiday', 'photos', 'post', 'menu', 'reply', 'other')),
  source text not null default 'other' check (source in ('whatsapp', 'note', 'other')),
  source_note_id uuid,
  assignee_user_id text check (assignee_user_id is null or char_length(assignee_user_id) between 1 and 100),
  due_date date,
  status text not null default 'open' check (status in ('open', 'waiting', 'done')),
  urgent boolean not null default false,
  created_by text not null check (char_length(created_by) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);

create index if not exists sync_tasks_merchant_idx on public.sync_tasks (merchant_id, status);
create index if not exists sync_tasks_assignee_idx on public.sync_tasks (assignee_user_id) where assignee_user_id is not null;
create index if not exists sync_tasks_due_idx on public.sync_tasks (due_date) where status <> 'done';

alter table public.sync_operators enable row level security;
alter table public.sync_operator_assignments enable row level security;
alter table public.sync_tasks enable row level security;
revoke all on table public.sync_operators from anon, authenticated;
revoke all on table public.sync_operator_assignments from anon, authenticated;
revoke all on table public.sync_tasks from anon, authenticated;

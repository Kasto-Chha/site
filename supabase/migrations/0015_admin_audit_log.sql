-- ---------------------------------------------------------------------------
-- KastoChha migration 0015
--
-- admin_audit_log: who changed what, when, and from what to what.
--
-- Role changes (/api/admin/roles) and content edits (/api/admin/content/...)
-- left no trace. A promotion to super admin, a deleted article or a vote count
-- typed up by a few thousand could not be attributed or undone from a record.
--
-- One row per admin action. The entry is written BEFORE the change is made
-- (status 'pending') and closed afterwards ('applied' or 'failed'), so a change
-- the log could not record is a change that was never made — the routes refuse
-- rather than act unrecorded. A row left at 'pending' means the process died
-- between the two; the before/after values still say what was attempted.
--
--   actor_id     Clerk user id of the admin who acted
--   action       'content.create' | 'content.update' | 'content.delete' | 'role.change'
--   target_type  content type ('trending', 'battles', ...) or 'user'
--   target_id    the row id, or the Clerk user id whose role changed
--   before       the row / role before, null for a create
--   after        the row / role after, null for a delete
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'failed'))
);

-- "What happened to this row / this user?" and "what has this admin done?"
create index if not exists idx_admin_audit_target
  on public.admin_audit_log(target_type, target_id, created_at desc);
create index if not exists idx_admin_audit_actor
  on public.admin_audit_log(actor_id, created_at desc);

-- Same posture as every table holding user identifiers (see 0002): RLS on with
-- no policy, so only the server's service-role client can read or write it.
alter table public.admin_audit_log enable row level security;

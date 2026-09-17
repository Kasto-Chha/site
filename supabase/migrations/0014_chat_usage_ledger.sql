-- ---------------------------------------------------------------------------
-- KastoChha migration 0013
--
-- An append-only ledger for AI assistant usage, replacing the "count rows in
-- chat_messages" quota.
--
-- Counting the conversation itself had three problems, all of which let a
-- caller spend more than their share of a paid LLM:
--
--   1. chat_messages hangs off chat_topics with on delete cascade, and
--      DELETE /api/chat/history is a normal product feature. Send 50 questions,
--      delete your history, and the count is back to zero.
--   2. Guests have no user_id, so they were never counted at all. Their only
--      ceiling was the Upstash burst window — which is optional — plus a cookie
--      that costs nothing to clear.
--   3. The check was read-then-act: N concurrent requests all read the same
--      count, all found room, and all went through.
--
-- This table fixes all three. It is never cascaded from anything, it is keyed
-- by an identity that guests have too, and consume_chat_quota() below counts
-- and reserves inside one transaction.
--
-- It deliberately stores no content and no raw IP — only an opaque identity
-- and a timestamp — so it is a counter, not a second copy of the chat log.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_usage (
  id uuid primary key default gen_random_uuid(),
  -- 'user:<clerk id>' for a signed-in account, 'ip:<sha256 hex>' for a guest.
  -- Hashed rather than raw so a leak of this table is not a leak of who asked
  -- what from where.
  identity text not null,
  created_at timestamptz not null default now()
);

-- The only access pattern: "this identity, recently". Descending because the
-- window filter always reaches backwards from now().
create index if not exists idx_chat_usage_identity
  on public.chat_usage(identity, created_at desc);

-- Same posture as every other table holding a user identifier (see 0002): RLS
-- on with no policy, so only the server's service-role client can touch it.
alter table public.chat_usage enable row level security;

-- ---------------------------------------------------------------------------
-- consume_chat_quota: check both windows and reserve a slot, atomically.
--
-- Returns one row: (allowed, remaining, scope, retry_after).
--   scope 'day'   -> the rolling 24h quota is spent
--   scope 'burst' -> too many in the last minute
--
-- p_check_burst is false when Upstash is already enforcing the per-minute
-- window, so the common path does one less count.
--
-- The advisory lock is what makes this safe under concurrency: it serializes
-- callers sharing an identity for the rest of the transaction, so no two
-- requests can read the same count and both find room. It is per-identity, so
-- unrelated users never wait on each other.
-- ---------------------------------------------------------------------------
create or replace function public.consume_chat_quota(
  p_identity text,
  p_day_limit int,
  p_burst_limit int,
  p_check_burst boolean default false
)
returns table (allowed boolean, remaining int, scope text, retry_after int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day_used int;
  v_burst_used int;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity, 0));

  -- Anything outside the widest window can never affect an answer again, so
  -- retire it here. This keeps the table bounded by active callers rather than
  -- growing forever, with no scheduled job to remember to run.
  delete from public.chat_usage
   where identity = p_identity
     and created_at < now() - interval '24 hours';

  select count(*) into v_day_used
    from public.chat_usage
   where identity = p_identity;

  if v_day_used >= p_day_limit then
    select min(created_at) into v_oldest
      from public.chat_usage
     where identity = p_identity;

    return query select
      false,
      0,
      'day'::text,
      greatest(1, ceil(extract(epoch from
        (v_oldest + interval '24 hours' - now())))::int);
    return;
  end if;

  if p_check_burst then
    select count(*), min(created_at) into v_burst_used, v_oldest
      from public.chat_usage
     where identity = p_identity
       and created_at >= now() - interval '1 minute';

    if v_burst_used >= p_burst_limit then
      return query select
        false,
        p_day_limit - v_day_used,
        'burst'::text,
        greatest(1, ceil(extract(epoch from
          (v_oldest + interval '1 minute' - now())))::int);
      return;
    end if;
  end if;

  -- Reserve the slot now, not when the answer is stored. A question that is
  -- answered but never written (a storage failure mid-stream) has still been
  -- paid for, and must still count.
  insert into public.chat_usage (identity) values (p_identity);

  return query select true, p_day_limit - v_day_used - 1, null::text, 0;
end;
$$;

-- The limits arrive as arguments, so anyone able to call this could just ask
-- for a bigger one. Same posture as the vote counters in 0002/0003: revoked
-- from public, granted only to the service role, so it is reachable from our
-- server and not over /rest/v1/rpc with the publishable key.
revoke all on function public.consume_chat_quota(text, int, int, boolean) from public;
grant execute on function public.consume_chat_quota(text, int, int, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Backfill, so turning this on does not hand every existing account a fresh
-- allowance on deploy day. Only the last 24 hours matter; older rows would be
-- pruned on first use anyway.
-- ---------------------------------------------------------------------------
insert into public.chat_usage (identity, created_at)
select 'user:' || m.user_id, m.created_at
  from public.chat_messages m
 where m.user_id is not null
   and m.role = 'user'
   and m.created_at >= now() - interval '24 hours'
   and not exists (select 1 from public.chat_usage);

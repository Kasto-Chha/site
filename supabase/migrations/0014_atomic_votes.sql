-- ---------------------------------------------------------------------------
-- KastoChha migration 0014
--
-- cast_vote: move a user's vote and the target's counters in ONE transaction.
--
-- lib/votes.js used to do this as three separate PostgREST calls: read the
-- user's current vote, write the user_votes row, then call apply_*_vote (0003)
-- to move the counters. Nothing held the first read true until the last write,
-- so two tabs, a double click or a replayed request could both read the same
-- previous vote and both apply the same transition — one upvote counted twice,
-- one withdrawal decremented twice — and the counters drifted away from the
-- ledger they are supposed to be derived from. A counter failure after the
-- ledger had moved was patched up by a best-effort "put it back" call.
--
-- Here the whole transition is one function call, so one transaction:
--
--   1. Lock the target row (SELECT ... FOR UPDATE). Every vote on that target,
--      from any user, queues here, so the ledger read that follows always sees
--      the previous caller's committed result rather than a stale one. The lock
--      also stops the target being deleted halfway through.
--   2. Read the previous choice, work out the next one (the same choice again
--      withdraws it), and move the ledger row.
--   3. Move the counters with the existing apply_*_vote functions, so the
--      counter arithmetic still lives in exactly one place.
--
-- Any error rolls back all three. There is nothing left to compensate.
--
-- Returns jsonb { found, vote, row }:
--   found  false when the target does not exist; nothing was written.
--   vote   the caller's choice after this call, or null if it was withdrawn.
--   row    the target row with its updated counters.
-- ---------------------------------------------------------------------------

create or replace function public.cast_vote(
  p_user_id text,
  p_target_type text,
  p_target_id uuid,
  p_value text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_prev text;
  v_next text;
  v_row jsonb;
begin
  if coalesce(p_user_id, '') = '' then
    raise exception 'cast_vote: a user id is required' using errcode = '22023';
  end if;

  -- The choices each target accepts. The route checks these too; checking again
  -- here means nothing but a real choice can ever reach a counter, whoever the
  -- caller is.
  if not (
       (p_target_type = 'trending' and p_value in ('yes', 'mid', 'no'))
    or (p_target_type = 'battle'   and p_value in ('a', 'b'))
    or (p_target_type = 'review'   and p_value in ('up', 'down'))
  ) then
    raise exception 'cast_vote: % is not a valid % vote', p_value, p_target_type
      using errcode = '22023';
  end if;

  if p_target_type = 'trending' then
    perform 1 from public.trending_topics where id = p_target_id for update;
  elsif p_target_type = 'battle' then
    perform 1 from public.battles where id = p_target_id for update;
  else
    perform 1 from public.reviews where id = p_target_id for update;
  end if;

  if not found then
    return jsonb_build_object('found', false, 'vote', null, 'row', null);
  end if;

  select value into v_prev
    from public.user_votes
   where user_id = p_user_id
     and target_type = p_target_type
     and target_id = p_target_id;
  v_prev := coalesce(v_prev, '');

  v_next := case when p_value = v_prev then '' else p_value end;

  if v_next = '' then
    delete from public.user_votes
     where user_id = p_user_id
       and target_type = p_target_type
       and target_id = p_target_id;
  else
    insert into public.user_votes (user_id, target_type, target_id, value)
    values (p_user_id, p_target_type, p_target_id, v_next)
    on conflict (user_id, target_type, target_id)
    do update set value = excluded.value;
  end if;

  if p_target_type = 'trending' then
    select to_jsonb(t) into v_row
      from public.apply_trending_vote(p_target_id, v_prev, v_next) t;
  elsif p_target_type = 'battle' then
    select to_jsonb(t) into v_row
      from public.apply_battle_vote(p_target_id, v_prev, v_next) t;
  else
    select to_jsonb(t) into v_row
      from public.apply_review_vote(p_target_id, v_prev, v_next) t;
  end if;

  return jsonb_build_object('found', true, 'vote', nullif(v_next, ''), 'row', v_row);
end;
$$;

-- p_user_id is taken on trust — the route passes the Clerk id it verified — so
-- this must only be reachable from our server. Same posture as 0003 and 0013:
-- revoked from public, granted to the service role. Supabase also grants
-- execute on new public functions to anon and authenticated directly, which a
-- revoke from public does not undo, so those are revoked by name where the
-- roles exist.
revoke all on function public.cast_vote(text, text, uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.cast_vote(text, text, uuid, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.cast_vote(text, text, uuid, text) from authenticated';
  end if;
end $$;
grant execute on function public.cast_vote(text, text, uuid, text) to service_role;

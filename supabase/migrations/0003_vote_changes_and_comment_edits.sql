-- ---------------------------------------------------------------------------
-- KastoChha migration 0003
--
-- 1. Vote counters that can also DECREMENT.
--
--    The 0002 increment_* functions only ever added +1. Combined with the
--    unique (user_id, target_type, target_id) constraint on user_votes, that
--    made a user's first vote permanent: every later click on the same card
--    was rejected with 409 and the displayed number never moved. These
--    apply_* functions take the user's previous choice and their new choice
--    and move both counters in one statement, so a vote can be changed
--    (yes -> no) or withdrawn (p_new = '').
--
--    Same safety properties as 0002: SECURITY INVOKER, execute granted only to
--    the service role, so the publishable key can't call them over /rest/v1/rpc.
--    greatest(0, ...) keeps a counter from going negative if a ledger row and
--    its counter ever drift apart.
--
-- 2. blog_comments.updated_at, stamped when an author edits their comment.
-- ---------------------------------------------------------------------------

create or replace function public.apply_trending_vote(
  p_id uuid,
  p_old text,
  p_new text
)
returns public.trending_topics
language sql
as $$
  update public.trending_topics set
    votes_yes = greatest(0, votes_yes
      + (coalesce(p_new, '') = 'yes')::int - (coalesce(p_old, '') = 'yes')::int),
    votes_mid = greatest(0, votes_mid
      + (coalesce(p_new, '') = 'mid')::int - (coalesce(p_old, '') = 'mid')::int),
    votes_no  = greatest(0, votes_no
      + (coalesce(p_new, '') = 'no')::int  - (coalesce(p_old, '') = 'no')::int),
    updated_at = now()
  where id = p_id
  returning *;
$$;

create or replace function public.apply_battle_vote(
  p_id uuid,
  p_old text,
  p_new text
)
returns public.battles
language sql
as $$
  update public.battles set
    left_votes = greatest(0, left_votes
      + (coalesce(p_new, '') = 'a')::int - (coalesce(p_old, '') = 'a')::int),
    right_votes = greatest(0, right_votes
      + (coalesce(p_new, '') = 'b')::int - (coalesce(p_old, '') = 'b')::int)
  where id = p_id
  returning *;
$$;

create or replace function public.apply_review_vote(
  p_id uuid,
  p_old text,
  p_new text
)
returns public.reviews
language sql
as $$
  update public.reviews set
    upvotes = greatest(0, upvotes
      + (coalesce(p_new, '') = 'up')::int - (coalesce(p_old, '') = 'up')::int),
    downvotes = greatest(0, downvotes
      + (coalesce(p_new, '') = 'down')::int - (coalesce(p_old, '') = 'down')::int)
  where id = p_id
  returning *;
$$;

revoke all on function public.apply_trending_vote(uuid, text, text) from public;
revoke all on function public.apply_battle_vote(uuid, text, text)   from public;
revoke all on function public.apply_review_vote(uuid, text, text)   from public;

grant execute on function public.apply_trending_vote(uuid, text, text) to service_role;
grant execute on function public.apply_battle_vote(uuid, text, text)   to service_role;
grant execute on function public.apply_review_vote(uuid, text, text)   to service_role;

-- Every page load now looks up "what did this user already vote on?" by
-- (user_id, target_type); the 0001 index only covers (target_type, target_id).
create index if not exists idx_user_votes_user on public.user_votes(user_id, target_type);

-- ---------------------------------------------------------------------------
-- Comment edits.
-- ---------------------------------------------------------------------------
alter table public.blog_comments add column if not exists updated_at timestamptz;

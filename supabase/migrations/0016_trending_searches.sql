-- ---------------------------------------------------------------------------
-- KastoChha migration 0016
--
-- The homepage's "Trending searches" row is ranked from what people open the
-- assistant with (lib/trendingSearches.js). Ranking it from chat_topics.title
-- alone had three holes, and each column below closes one:
--
--   opening_query  The question as first asked. `title` is what the owner sees
--                  in their sidebar and can rename; a private label someone
--                  gave a conversation later is not a search they made, and
--                  must not be what the homepage counts.
--
--   source         Set when the opening question was clicked rather than typed
--                  ('trending', 'chip', 'question', 'prompt' — CHAT_SOURCE in
--                  lib/chatTopics.js), null for a typed one. A click on a
--                  trending link opens a conversation with that same title, so
--                  without this every click was a vote for itself and whatever
--                  reached the row first stayed there.
--
--   guest_key      Tells one guest from another. Guests have no user_id, so
--                  each guest conversation used to count as a separate person
--                  and one visitor repeating a question looked like a crowd.
--                  It is an HMAC of the question together with the address
--                  (guestAskerKey in lib/chatQuota.js), not of the address
--                  alone: it can say "this network already asked this" and
--                  nothing else, so two different questions from one guest are
--                  not linked by it, and it cannot be joined to chat_usage.
--                  Null for signed-in rows, where user_id already answers it.
--
-- Plus trending_search_rules: the editor's two controls over a list the site
-- otherwise works out for itself.
--
-- The app tolerates this migration not having run yet (the chat route retries
-- its insert without the new columns, and the ranking falls back to titles),
-- so deploy order does not matter. Idempotent, like the rest.
-- ---------------------------------------------------------------------------

alter table public.chat_topics add column if not exists opening_query text;
alter table public.chat_topics add column if not exists source text;
alter table public.chat_topics add column if not exists guest_key text;

-- Backfill opening_query for conversations that predate the column, from the
-- one place the original wording survives: the first user turn. Shaped the way
-- topicTitle() in lib/chatTopics.js shapes it — whitespace collapsed, cut to
-- 80 characters with an ellipsis — so old and new rows compare alike.
--
-- A conversation with no stored turns (storage failed after the topic was
-- created) falls back to its current title, which is the best that is left.
--
-- Only rows still null are touched, so a re-run never overwrites a value, and
-- it also picks up any conversation the old code created between this file
-- being applied and the new code going live.
update public.chat_topics t
   set opening_query = coalesce(
         (select case
                   when char_length(q.clean) <= 80 then q.clean
                   else rtrim(left(q.clean, 79)) || '…'
                 end
            from (select btrim(regexp_replace(m.content, '\s+', ' ', 'g')) as clean
                    from public.chat_messages m
                   where m.topic_id = t.id
                     and m.role = 'user'
                   order by m.created_at asc
                   limit 1) q
           where q.clean <> ''),
         t.title)
 where t.opening_query is null;

-- source and guest_key are left null on old rows: nothing recorded how those
-- conversations were opened. They rank as typed, and the old guest rows count
-- together as one asker per search rather than each as their own.

-- ---------------------------------------------------------------------------
-- trending_search_rules: managed at /admin/content/searches.
--
--   action 'hide'      any search containing `term` (whole words, ignoring
--                      case and punctuation) never appears in the row
--   action 'fallback'  `term` is shown, in `rank` order, while fewer real
--                      searches qualify than the row has room for
--
-- No unique constraint on term: a duplicate rule is harmless, and the admin
-- panel reports 23505 as a slug clash, which would be the wrong message here.
-- ---------------------------------------------------------------------------
create table if not exists public.trending_search_rules (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  action text not null default 'hide' check (action in ('hide', 'fallback')),
  rank int not null default 1,
  note text,
  created_at timestamptz not null default now()
);

-- RLS on with no policy, the posture of every table that is not public display
-- content (see 0002). The hide list is by its nature a list of the words we
-- least want read back out, and the browser has no reason to fetch any of it:
-- the row arrives already ranked from the server.
alter table public.trending_search_rules enable row level security;

-- ---------------------------------------------------------------------------
-- KastoChha migration 0004
--
-- Chat storage becomes a two-level tree instead of one flat log:
--
--   user (Clerk id)  ->  chat_topics (one conversation)  ->  chat_messages
--
-- chat_queries kept one row per question, with no link between a follow-up and
-- the question it followed, and its `response` column was never written. So a
-- conversation only existed in the browser tab that produced it: the sidebar
-- could re-ask an old question but never reopen the thread, and there was no
-- unit to rename, delete, export or retain other than a single line of text.
--
-- Ownership rules:
--   chat_topics.user_id  = the Clerk id that owns the conversation.
--   chat_topics.user_id IS NULL = an anonymous trial visitor. Guests still get
--     a topic so their few turns stay threaded and countable, but the row has
--     no owner to scope it to; the client holds the id for the session only.
--   chat_messages.user_id duplicates the parent's owner on purpose, so
--     per-user sweeps ("delete everything this user ever sent", GDPR-style
--     exports, per-user quotas) never need a join.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_topics (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  title text not null,
  -- Maintained by the trigger below, so listing a user's conversations never
  -- has to count or max() over their messages.
  message_count int not null default 0,
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.chat_topics(id) on delete cascade,
  user_id text,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reconcile an older chat_topics/chat_messages that already exists.
--
-- "create table if not exists" above is a no-op against a database that got
-- these tables from an earlier draft, so such a database keeps the old shape
-- and silently diverges from everything the app expects. Two ways that bites,
-- both observed on a live database:
--
--   * archived_at missing — getUserChatTopics and searchUserChatTopics both
--     filter on it, so every history query errors. safeQuery swallows the
--     error and returns [], which renders as "Your conversations will be saved
--     here" forever, no matter how many chats the user has had.
--   * user_id NOT NULL — a guest conversation has no owner by design, so the
--     insert is rejected and anonymous visitors' turns are never stored (and
--     the backfill at the bottom of this file fails outright).
--
-- All four statements are no-ops once the shape is right, so this stays safe to
-- re-run alongside the rest of the file.
-- ---------------------------------------------------------------------------
alter table public.chat_topics   add column if not exists archived_at timestamptz;
alter table public.chat_topics   alter column user_id drop not null;
alter table public.chat_messages alter column user_id drop not null;
-- Columns an older draft added that this design doesn't set on insert. They
-- carry defaults, but only a nullable column is safe if that ever changes.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_topics'
      and column_name = 'category_slug'
  ) then
    alter table public.chat_topics alter column category_slug drop not null;
  end if;
end $$;

-- "This user's conversations, newest activity first" — the sidebar's only query.
create index if not exists idx_chat_topics_user
  on public.chat_topics(user_id, last_message_at desc);
-- The community rail reads the newest topics across everyone.
create index if not exists idx_chat_topics_created
  on public.chat_topics(created_at desc);
-- Replaying one thread, in order.
create index if not exists idx_chat_messages_topic
  on public.chat_messages(topic_id, created_at);
-- Per-user retention / export sweeps.
create index if not exists idx_chat_messages_user
  on public.chat_messages(user_id, created_at desc);

-- Title search for the sidebar. pg_trgm is what makes an unanchored ILIKE
-- indexable; if the extension can't be installed the search still works, it
-- just falls back to a sequential scan.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists idx_chat_topics_title_trgm
    on public.chat_topics using gin (title gin_trgm_ops);
exception when others then
  raise notice 'pg_trgm unavailable — chat title search falls back to a scan';
end $$;

-- Keep the denormalized counters on the parent honest. Messages are only ever
-- deleted with their topic (on delete cascade), so insert is the only event
-- that can move these.
create or replace function public.touch_chat_topic()
returns trigger
language plpgsql
as $$
begin
  update public.chat_topics set
    message_count = message_count + 1,
    last_message_at = greatest(last_message_at, new.created_at),
    updated_at = now()
  where id = new.topic_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_touch_topic on public.chat_messages;
create trigger trg_chat_messages_touch_topic
  after insert on public.chat_messages
  for each row execute function public.touch_chat_topic();

-- Same posture as the other tables carrying user identifiers (see 0002): RLS on
-- with no policy, so the publishable/anon key gets zero access and only the
-- server's service-role client can read or write chat.
alter table public.chat_topics   enable row level security;
alter table public.chat_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill: every old chat_queries row becomes a one-question topic, keeping
-- its original id so the ids the client already holds still resolve. Then the
-- flat table goes away, so chat text lives in exactly one place.
--
-- Guarded on the table still existing, which makes the whole block a no-op on
-- a re-run or on a database created after this migration.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.chat_queries') is null then
    return;
  end if;

  insert into public.chat_topics (id, user_id, title, created_at, updated_at, last_message_at)
  select
    q.id,
    q.user_id,
    coalesce(nullif(left(regexp_replace(q.query, '\s+', ' ', 'g'), 80), ''), 'Chat'),
    q.created_at,
    q.created_at,
    q.created_at
  from public.chat_queries q
  on conflict (id) do nothing;

  -- message_count is left at 0 above and filled in by the trigger as these run.
  insert into public.chat_messages (topic_id, user_id, role, content, created_at)
  select q.id, q.user_id, 'user', q.query, q.created_at
  from public.chat_queries q
  where not exists (
    select 1 from public.chat_messages m where m.topic_id = q.id and m.role = 'user'
  );

  insert into public.chat_messages (topic_id, user_id, role, content, created_at)
  select q.id, q.user_id, 'assistant', q.response, q.created_at
  from public.chat_queries q
  where coalesce(q.response, '') <> ''
    and not exists (
      select 1 from public.chat_messages m where m.topic_id = q.id and m.role = 'assistant'
    );

  drop table public.chat_queries;
end $$;

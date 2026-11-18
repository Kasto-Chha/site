-- Patch 14n: what the owner says back, and what the team asks the owner.
--
-- The owner dashboard lets an owner approve what is waiting for them, send it back with a short comment, and answer a question the
-- team has about a review. This adds the words that travel with that:
--   owner_note       on menu items, posts and replies: why the owner sent it back (shown to the team while it is a draft again)
--   team_question    on replies: what the team needs to know from the owner before it can write the reply
--   owner_answer     on replies: the owner's answer (read by the team only, never posted as written)
--   owner_answered_at the moment of the answer
--
-- Only the server reads or writes these. Additive and safe to run twice: new columns only, nothing that exists is changed. Run this
-- BEFORE pushing patch 14n: the team's Google tab reads these columns.

alter table public.sync_menu_items add column if not exists owner_note text check (owner_note is null or char_length(owner_note) <= 300);
alter table public.sync_posts add column if not exists owner_note text check (owner_note is null or char_length(owner_note) <= 300);
alter table public.sync_replies add column if not exists owner_note text check (owner_note is null or char_length(owner_note) <= 300);
alter table public.sync_replies add column if not exists team_question text check (team_question is null or char_length(team_question) <= 500);
alter table public.sync_replies add column if not exists owner_answer text check (owner_answer is null or char_length(owner_answer) <= 1000);
alter table public.sync_replies add column if not exists owner_answered_at timestamptz;

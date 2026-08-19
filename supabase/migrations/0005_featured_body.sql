-- ---------------------------------------------------------------------------
-- KastoChha migration 0005
--
-- featured_stories.body — the article itself.
--
-- Featured stories were card-only: title, description, and a link_url pointing
-- somewhere else. That made /featured/[id] a dead end — it re-printed the same
-- title and description the card already showed, and offered "Read full story"
-- only when an editor had a URL to send the reader off-site to. There was no
-- way to publish a piece of writing on KastoChha itself.
--
-- With a body, a featured story is a blog post: the permalink renders the full
-- text, and link_url goes back to being what it was meant to be — an optional
-- override for stories that live elsewhere.
--
-- Plain text, not markup. The admin editor is a textarea, and the renderer
-- splits on blank lines into paragraphs (see lib/featured.js), so nothing here
-- is interpreted as HTML on the way out.
-- ---------------------------------------------------------------------------

alter table public.featured_stories
  add column if not exists body text;

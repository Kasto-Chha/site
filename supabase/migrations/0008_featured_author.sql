-- ---------------------------------------------------------------------------
-- KastoChha migration 0008
--
-- featured_stories.author_name
--
-- Articles had no author. The card showed a title and a blurb, the permalink
-- showed the body, and nowhere did it say who wrote it — even though these are
-- written by named people (Pradip Karki and Rimisha Karki have roughly five
-- bylines each on the pieces being republished here).
--
-- That matters beyond tidiness. Google's guidelines weigh demonstrable
-- expertise most heavily on exactly the subjects KastoChha covers under Paisa
-- and Health, and an anonymous article about money is the weakest possible
-- shape for that. With an author, lib/seo/schema.js can emit a real Person as
-- the article's author rather than falling back to the organisation.
--
-- Nullable on purpose: a story genuinely produced by the team rather than one
-- person should be allowed to have no byline, and the schema falls back to the
-- Organization in that case.
-- ---------------------------------------------------------------------------

alter table public.featured_stories
  add column if not exists author_name text;

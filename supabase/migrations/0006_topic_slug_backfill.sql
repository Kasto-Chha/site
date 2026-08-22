-- Discussion URLs are now keyed on topic_slug rather than a review's own id, so
-- a row without a slug is a row with no reachable page. Two rows in this table
-- predate the topic_slug column, and the insert path in app/api/reviews/route.js
-- has a fallback that writes a row without a slug if the column is missing.
--
-- Backfill what's there, then make the column required so a slugless row fails
-- loudly at insert instead of quietly becoming unreachable.

-- 1. Derive a slug from the topic (or title) for any row missing one.
--    This mirrors what lib/slug.js does in JS: lowercase, non-alphanumerics
--    collapsed to single hyphens, no leading or trailing hyphen.
update reviews
set topic_slug = nullif(
  btrim(
    regexp_replace(lower(coalesce(topic, title, '')), '[^a-z0-9]+', '-', 'g'),
    '-'
  ),
  ''
)
where topic_slug is null or btrim(topic_slug) = '';

-- 2. A title written entirely in Devanagari (or emoji) reduces to an empty
--    string above, which would leave the row unreachable again. Give anything
--    still empty a stable, unique fallback derived from its own id.
update reviews
set topic_slug = 'topic-' || left(id::text, 8)
where topic_slug is null or btrim(topic_slug) = '';

-- 3. Require it from here on.
alter table reviews alter column topic_slug set not null;

-- idx_reviews_topic_slug already exists (see schema.sql) and is what makes the
-- new "fetch one thread by slug" query a single indexed lookup.

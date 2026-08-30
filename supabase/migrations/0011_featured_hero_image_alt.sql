-- 0011_featured_hero_image_alt.sql
-- Alt text for the hero image added in 0010. Kept as its own nullable
-- column, same reasoning as image_url itself: additive, nothing about a
-- story with no image (or no alt text yet) changes.
alter table public.featured_stories add column if not exists image_alt text;

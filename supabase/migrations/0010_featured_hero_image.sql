-- 0010_featured_hero_image.sql
-- A real photo for a featured story, alongside the existing fixed icon
-- (book/home/briefcase). The icon stays as the fallback for a story with no
-- image set — this column is additive, nothing about the existing icon
-- behavior changes for stories that don't use it.
alter table public.featured_stories add column if not exists image_url text;

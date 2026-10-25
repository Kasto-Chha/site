-- A cover image for each reel, set by hand in /admin/content/reels.
--
-- TikTok no longer returns a cover from its public lookup, so a reel's cover can't
-- always be fetched automatically any more. When cover_url is set, the card shows
-- it; when it is empty the site tries the platform's own cover, as before.
--
-- RUN THIS BEFORE DEPLOYING the code that uses it: the admin saves every field of a
-- reel each time, so saving a reel without this column would fail.

alter table reels add column if not exists cover_url text;

create or replace function sync_site_stats() returns trigger as $$
begin
  update public.site_stats
    set value = (select count(*)::text from public.reviews where kind = 'experience')
    where label = 'Experiences shared';
  update public.site_stats
    set value = (select count(*)::text from public.reviews where kind = 'question')
    where label = 'Questions asked';
  update public.site_stats
    set value = (select count(*)::text from public.user_votes)
    where label = 'Votes cast';
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists reviews_sync_stats on public.reviews;
create trigger reviews_sync_stats
  after insert or delete or update of kind on public.reviews
  for each statement execute function sync_site_stats();

drop trigger if exists user_votes_sync_stats on public.user_votes;
create trigger user_votes_sync_stats
  after insert or delete on public.user_votes
  for each statement execute function sync_site_stats();

update public.site_stats
  set value = (select count(*)::text from public.reviews where kind = 'experience')
  where label = 'Experiences shared';
update public.site_stats
  set value = (select count(*)::text from public.reviews where kind = 'question')
  where label = 'Questions asked';
update public.site_stats
  set value = (select count(*)::text from public.user_votes)
  where label = 'Votes cast';

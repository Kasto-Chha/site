-- Patch 11b: the admin audit log is private.
--
-- admin_audit_log has row level security on (0015) and no policy, so the public key was refused every row, but it was
-- still allowed to ask: a request answered 200 with an empty list instead of "permission denied". The log holds who
-- changed what and when, and only the server (the service role, which ignores row level security and is not affected by
-- this) ever needs it. Closing the table off entirely means the public key cannot even ask, the same as the other private
-- Sync tables (0018, 0019, 0023). Safe to run more than once, and it changes no data.

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;

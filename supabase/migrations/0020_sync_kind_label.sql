-- KastoChha Sync: what an "Other" business is, in the admin's own words.
--
-- The business type list is long but cannot be endless. When a business fits none of the
-- types, the admin picks "Other (write it in)" and types what it is, for example
-- "Motorcycle workshop". Those words are stored here, and customers see them in place of
-- the business type. It is empty for every business that has a standard type.
--
-- The length is checked here as well as in the code. Whether the Other type has a label is
-- checked in the code only, so that businesses tagged before this column existed (which
-- have none) are not rejected.
--
-- Idempotent: the migration runner re-runs every file.

alter table public.sync_merchants
  add column if not exists kind_label text
  constraint sync_merchants_kind_label_length check (kind_label is null or char_length(kind_label) between 1 and 60);

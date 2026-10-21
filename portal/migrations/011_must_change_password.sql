-- Run against your existing Neon database after 010_cohort_tier_capacity.sql.
--   psql $DATABASE_URL -f migrations/011_must_change_password.sql

-- Set true whenever an admin issues a temp password (new registration or
-- resend); cleared once the learner successfully changes their own password.
alter table users add column if not exists must_change_password boolean not null default false;

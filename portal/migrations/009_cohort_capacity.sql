-- Run against your existing Neon database after 008_cohorts.sql.
--   psql $DATABASE_URL -f migrations/009_cohort_capacity.sql

-- Nullable: null means "no cap set," shown publicly as open enrollment
-- rather than a slot count.
alter table cohorts add column if not exists capacity int;

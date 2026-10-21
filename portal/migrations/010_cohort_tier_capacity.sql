-- Run against your existing Neon database after 009_cohort_capacity.sql.
--   psql $DATABASE_URL -f migrations/010_cohort_tier_capacity.sql

-- Replace the single capacity field with two separate pools -- early bird
-- and standard slots sell out independently. Safe to drop: no real cohort
-- has ever had capacity set yet (only test data, already cleaned up).
alter table cohorts drop column if exists capacity;
alter table cohorts add column if not exists capacity_early_bird int;
alter table cohorts add column if not exists capacity_standard int;

-- Which pricing tier a given attendee registered under, so slot counts per
-- tier are accurate. Matches the "Early Bird" / "Standard Rate" terminology
-- already used site-wide.
alter table cohort_enrollments add column if not exists tier text not null default 'standard';
alter table cohort_enrollments drop constraint if exists cohort_enrollments_tier_check;
alter table cohort_enrollments add constraint cohort_enrollments_tier_check check (tier in ('early_bird', 'standard'));

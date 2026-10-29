-- Run against your existing Neon database after 013_payment_reminders.sql.
--   psql $DATABASE_URL -f migrations/014_early_bird_overrides.sql

-- Admin-set Early Bird deadline per offering (admin/pricing.html). When a
-- row exists, its deadline replaces the default in bootcampPricing.js for
-- every tier in the early_bird pool -- later to extend it, now() to end it
-- early. Deleting the row goes back to the default.
create table if not exists offering_pricing_overrides (
    offering_slug text primary key,
    early_bird_deadline timestamptz not null,
    updated_at timestamptz not null default now(),
    updated_by text
);

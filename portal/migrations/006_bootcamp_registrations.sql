-- Run against your existing Neon database after 005_admin_roles.sql.
--   psql $DATABASE_URL -f migrations/006_bootcamp_registrations.sql

-- Guest checkout for the live cohort bootcamps (Cloud+DE Bundle, GCP, Python
-- Automation, SQL Foundations). No portal account involved -- this is a
-- one-time slot reservation + payment, separate from the self-paced
-- Masterclass subscription in `payments`/`users.subscription_until`.
create table if not exists bootcamp_registrations (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    phone text,
    offering_slug text not null,
    tier text not null,
    tier_label text not null,
    amount_centavos int not null,
    total_price_centavos int not null,
    currency text not null default 'PHP',
    paymongo_checkout_session_id text unique not null,
    status text not null default 'pending', -- pending | paid | failed
    created_at timestamptz not null default now(),
    paid_at timestamptz
);

create index if not exists bootcamp_registrations_status_idx on bootcamp_registrations(status);
create index if not exists bootcamp_registrations_offering_idx on bootcamp_registrations(offering_slug);

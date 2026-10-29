-- Run against your existing Neon database after 014_early_bird_overrides.sql.
--   psql $DATABASE_URL -f migrations/015_offering_promos.sql

-- Admin-run down-payment promos (admin/pricing.html). A promo keeps the
-- tier's normal total; it only changes how it's paid: down_payment today,
-- then the rest split into installment_count equal monthly payments
-- (bootcampPricing.js promoInstallments). While starts_at..ends_at contains
-- "now", it replaces the tier's schedule exactly like a promo hardcoded in
-- bootcampPricing.js, and takes priority over one.
create table if not exists offering_promos (
    id uuid primary key default gen_random_uuid(),
    offering_slug text not null,
    tier_key text not null,
    badge text not null,
    headline text,
    down_payment_centavos int not null check (down_payment_centavos > 0),
    installment_count int not null check (installment_count between 1 and 6),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    created_at timestamptz not null default now(),
    created_by text,
    check (ends_at > starts_at)
);

create index if not exists offering_promos_offering_idx on offering_promos(offering_slug, ends_at);

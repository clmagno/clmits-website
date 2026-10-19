-- Run against your existing Neon database after 006_bootcamp_registrations.sql.
--   psql $DATABASE_URL -f migrations/007_bootcamp_installments.sql

-- A bootcamp_registrations row now represents only the FIRST payment (down
-- payment, or the full amount for single-payment tiers), charged through
-- bootcamp-checkout.js at registration time. Everything collected later --
-- the Nov 30 balance, the 3 monthly installments -- lives here instead, one
-- row per scheduled future payment. No auto-billing (GCash can't be charged
-- silently): an admin generates a PayMongo link for the next 'scheduled' row
-- when it's due and sends it manually; the webhook marks it paid once it is.
create table if not exists bootcamp_installments (
    id uuid primary key default gen_random_uuid(),
    registration_id uuid not null references bootcamp_registrations(id) on delete cascade,
    position int not null, -- 2, 3, 4... (position 1 is the registration's own first payment)
    label text not null,
    amount_centavos int not null,
    status text not null default 'scheduled', -- scheduled (no link yet) | pending (link sent) | paid
    paymongo_checkout_session_id text unique,
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    unique (registration_id, position)
);

create index if not exists bootcamp_installments_registration_idx on bootcamp_installments(registration_id);
create index if not exists bootcamp_installments_status_idx on bootcamp_installments(status);

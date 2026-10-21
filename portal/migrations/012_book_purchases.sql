-- Book purchases (Phase 1/2/3 companion books, full-access paywall).
-- book_content holds the real unlockable HTML server-side only -- it must
-- NEVER be committed as a static file in the repo, since GitHub Pages
-- serves the whole repo (including portal/) as static files, which would
-- defeat the paywall entirely. Only this function-served table may hold it.

create table if not exists book_purchases (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    book_slug text not null check (book_slug in ('phase1', 'phase2', 'phase3')),
    amount_centavos int not null,
    paymongo_checkout_session_id text not null,
    status text not null default 'pending' check (status in ('pending', 'paid')),
    access_token text not null unique,
    created_at timestamptz not null default now(),
    paid_at timestamptz
);

create table if not exists book_content (
    book_slug text primary key check (book_slug in ('phase1', 'phase2', 'phase3')),
    html_content text not null,
    updated_at timestamptz not null default now()
);

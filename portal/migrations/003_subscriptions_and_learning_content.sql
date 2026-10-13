-- Run against your existing Neon database after 002_offerings_and_progress.sql.
--   psql $DATABASE_URL -f migrations/003_subscriptions_and_learning_content.sql

-- A user's subscription access is a single expiry timestamp, extended by 30 days
-- on each successful payment ("pay to extend" model, not silent auto-billing --
-- GCash can't be auto-charged, so the learner pays again each cycle).
alter table users add column if not exists subscription_until timestamptz;

-- Which courses are gated behind the subscription, vs. the catalog-only live
-- bootcamps (unchanged -- those stay inquiry-only via the contact form).
alter table courses add column if not exists requires_subscription boolean not null default false;
update courses set requires_subscription = true where slug = 'data-engineering-masterclass';

-- Optional reading/book-style content per module, shown alongside (or instead
-- of) the video. Trusted admin-authored HTML, not user input.
alter table modules add column if not exists reading_content text;

create table if not exists payments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    paymongo_checkout_session_id text unique not null,
    amount_centavos int not null,
    currency text not null default 'PHP',
    status text not null default 'pending', -- pending | paid | failed
    period_days int not null default 30,
    created_at timestamptz not null default now(),
    paid_at timestamptz
);

create table if not exists quizzes (
    id uuid primary key default gen_random_uuid(),
    module_id uuid not null unique references modules(id) on delete cascade,
    title text not null
);

create table if not exists quiz_questions (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references quizzes(id) on delete cascade,
    position int not null,
    prompt text not null,
    explanation text,
    unique (quiz_id, position)
);

create table if not exists quiz_options (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references quiz_questions(id) on delete cascade,
    position int not null,
    label text not null,
    is_correct boolean not null default false,
    unique (question_id, position)
);

create table if not exists quiz_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    quiz_id uuid not null references quizzes(id) on delete cascade,
    score int not null,
    total int not null,
    created_at timestamptz not null default now()
);

-- Convenience: grant yourself (or anyone) access without going through checkout,
-- e.g. for testing or comping an account. Run manually whenever needed:
--   update users set subscription_until = now() + interval '365 days' where email = 'you@example.com';

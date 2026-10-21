-- Run against your existing Neon database after 007_bootcamp_installments.sql.
--   psql $DATABASE_URL -f migrations/008_cohorts.sql

-- Admin-registered attendees (Facebook/cash payments, outside PayMongo) need a
-- name and optional phone on file -- self-signup users won't have these set.
alter table users add column if not exists full_name text;
alter table users add column if not exists phone text;

-- Curriculum-level content for live-bootcamp courses: set once per course, not
-- re-pasted per cohort. Edited on admin/course.html alongside module content.
alter table courses add column if not exists lesson_plan text;
alter table courses add column if not exists setup_guide_url text;

-- A cohort is one scheduled run of a live-bootcamp course (e.g. "SQL
-- Foundations -- December 2026"), distinct from both the catalog-only
-- marketing-card course row and any self-paced subscription course.
create table if not exists cohorts (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses(id) on delete cascade,
    name text not null,
    schedule_type text not null check (schedule_type in ('weekday', 'weekend')),
    start_date date not null,
    duration_weeks int not null default 12,
    meet_link text,
    google_calendar_event_id text,
    drive_folder_url text,
    created_at timestamptz not null default now()
);

create index if not exists cohorts_course_idx on cohorts(course_id);

create table if not exists cohort_enrollments (
    user_id uuid not null references users(id) on delete cascade,
    cohort_id uuid not null references cohorts(id) on delete cascade,
    status text not null default 'active', -- active | removed
    enrolled_at timestamptz not null default now(),
    primary key (user_id, cohort_id)
);

-- Private learner <-> admin comment channel, scoped by learner (not per
-- cohort) -- an ongoing relationship with the school, not per-batch.
create table if not exists comments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    author_id uuid not null references users(id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now()
);

create index if not exists comments_user_idx on comments(user_id);

-- Singleton: one operator, one connected Google account, ever.
create table if not exists google_integration (
    id int primary key default 1,
    refresh_token text,
    connected_email text,
    updated_at timestamptz not null default now(),
    constraint google_integration_singleton check (id = 1)
);

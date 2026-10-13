-- Run this once against your Neon database (Neon console -> SQL editor, or `psql $DATABASE_URL -f schema.sql`).

create extension if not exists pgcrypto;

create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists courses (
    id uuid primary key default gen_random_uuid(),
    slug text unique not null,
    title text not null,
    description text not null default ''
);

create table if not exists modules (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses(id) on delete cascade,
    position int not null,
    title text not null,
    description text not null default '',
    video_url text,
    is_free_preview boolean not null default false,
    unique (course_id, position)
);

create table if not exists enrollments (
    user_id uuid not null references users(id) on delete cascade,
    course_id uuid not null references courses(id) on delete cascade,
    source text not null default 'free',
    created_at timestamptz not null default now(),
    primary key (user_id, course_id)
);

-- Seed: the Data Engineering Masterclass and its 18 self-paced modules.
-- Modules 1-5 match the titles already shown on clmits.com. Modules 6-18 are
-- placeholders — rename them and fill in video_url as you upload/record them:
--   update modules set title = '...', video_url = '...' where course_id =
--     (select id from courses where slug = 'data-engineering-masterclass') and position = 6;
insert into courses (slug, title, description)
values (
    'data-engineering-masterclass',
    'Data Engineering Masterclass',
    '18-module self-paced curriculum: Python, SQL, ETL, and a full project build.'
)
on conflict (slug) do nothing;

insert into modules (course_id, position, title, is_free_preview, video_url)
select c.id, m.position, m.title, m.is_free_preview, m.video_url
from courses c
cross join (values
    (1, 'Python Fundamentals', true, 'https://www.youtube-nocookie.com/embed/cEVYVjaJUGc'),
    (2, 'Python Fundamentals 2', false, null),
    (3, 'Python Advanced', false, null),
    (4, 'Python Advanced (ETL)', false, null),
    (5, 'Python Project & Git', false, null),
    (6, 'Module 6', false, null),
    (7, 'Module 7', false, null),
    (8, 'Module 8', false, null),
    (9, 'Module 9', false, null),
    (10, 'Module 10', false, null),
    (11, 'Module 11', false, null),
    (12, 'Module 12', false, null),
    (13, 'Module 13', false, null),
    (14, 'Module 14', false, null),
    (15, 'Module 15', false, null),
    (16, 'Module 16', false, null),
    (17, 'Module 17', false, null),
    (18, 'Module 18', false, null)
) as m(position, title, is_free_preview, video_url)
where c.slug = 'data-engineering-masterclass'
on conflict (course_id, position) do nothing;

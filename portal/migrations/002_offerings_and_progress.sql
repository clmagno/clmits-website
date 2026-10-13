-- Run this against your existing Neon database (it only adds to what's there,
-- nothing in schema.sql needs to be re-run). Neon console -> SQL editor, or:
--   psql $DATABASE_URL -f migrations/002_offerings_and_progress.sql

-- Catalog-only courses (the live/paid bootcamps) show up as "offerings" in the
-- portal but are never auto-enrolled. Clicking one links back to clmits.com's
-- contact form with the interest pre-filled, same as the #bootcamps section.
alter table courses add column if not exists is_catalog_only boolean not null default false;
alter table courses add column if not exists inquiry_interest text;

-- Per-module completion, toggled by the "Mark Complete" button in course.html.
create table if not exists module_progress (
    user_id uuid not null references users(id) on delete cascade,
    module_id uuid not null references modules(id) on delete cascade,
    completed_at timestamptz not null default now(),
    primary key (user_id, module_id)
);

insert into courses (slug, title, description, is_catalog_only, inquiry_interest)
values
    ('cloud-de-bundle', 'Cloud + Data Engineering Track', 'Bundle offer: the Data Engineer Bootcamp + GCP Cloud Engineer Bootcamp. Build pipelines, then deploy them on real cloud infrastructure.', true, 'CloudDEBundle'),
    ('gcp-bootcamp', 'GCP Associate Cloud Engineer Bootcamp', 'Hands-on labs across Compute Engine, Storage, IAM, Cloud SQL and more. Certification-focused, exam-ready by the end.', true, 'GCPBootcamp'),
    ('python-automation', 'Python Automation for IT & Ops', 'Stop doing repetitive work by hand. Build real automation scripts with Python, designed for IT admins, engineers and ops teams.', true, 'PythonAutomation'),
    ('sql-foundations', 'SQL Foundations', 'Your first step into data, no experience needed. Query real databases with confidence.', true, 'SQLFoundations')
on conflict (slug) do nothing;

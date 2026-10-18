-- Run against your existing Neon database after 004_lesson_content.sql.
--   psql $DATABASE_URL -f migrations/005_admin_roles.sql

alter table users add column if not exists role text not null default 'student';
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('student', 'instructor', 'admin'));

-- Admin/instructor content-management permissions are always re-checked against
-- this column on every request (see netlify/functions/_lib/roles.js) -- never
-- trusted from the session cookie. That way revoking someone's access (e.g. a
-- contractor whose engagement ended) takes effect on their very next request,
-- not whenever their 90-day cookie happens to expire.

-- Makes chris.ultd@gmail.com an admin if that account already exists. If it
-- hasn't signed up yet, sign up normally first, then re-run this one line:
update users set role = 'admin' where email = 'chris.ultd@gmail.com';

-- To bring on an instructor later (content-only access, can't manage other
-- users' roles), once they've created their own free account:
--   update users set role = 'instructor' where email = 'the-new-hire@example.com';

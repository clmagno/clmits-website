-- Run against your existing Neon database after 012_book_purchases.sql.
--   psql $DATABASE_URL -f migrations/013_payment_reminders.sql

-- Follow-up for registrations that never finished paying. An admin sends a
-- reminder (admin-send-payment-reminder.js), which mints a FRESH PayMongo
-- checkout session -- the original one may be expired or abandoned. The old
-- session id moves into previous_checkout_session_ids so the webhook still
-- recognizes a payment made through an older link instead of dropping it.
alter table bootcamp_registrations add column if not exists reminder_count int not null default 0;
alter table bootcamp_registrations add column if not exists last_reminded_at timestamptz;
alter table bootcamp_registrations add column if not exists previous_checkout_session_ids text[] not null default '{}';

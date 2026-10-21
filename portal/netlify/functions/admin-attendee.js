const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin-only. Edits an attendee's profile fields and their enrollment's
// tier/status for one specific cohort -- same stricter PII gating as the
// rest of the cohort/roster surface. Always sends the full set of fields
// (not a partial patch), matching admin-course.js's save-the-whole-form
// pattern elsewhere in this codebase.
exports.handler = async (event) => {
    if (event.httpMethod !== 'PATCH') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const userId = String(body.userId || '').trim();
    const cohortId = String(body.cohortId || '').trim();
    const fullName = String(body.fullName || '').trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const email = String(body.email || '').trim().toLowerCase();
    const tier = String(body.tier || '').trim();
    const status = String(body.status || '').trim();

    if (!userId || !cohortId || !fullName || !EMAIL_RE.test(email) || !['early_bird', 'standard'].includes(tier) || !['active', 'removed'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Name, a valid email, a tier, and a status are all required.' }) };
    }

    const sql = getDb();

    const [enrollment] = await sql`select user_id from cohort_enrollments where user_id = ${userId} and cohort_id = ${cohortId}`;
    if (!enrollment) {
        return { statusCode: 404, body: JSON.stringify({ error: 'This attendee is not enrolled in that cohort.' }) };
    }

    const [emailOwner] = await sql`select id from users where email = ${email} and id != ${userId}`;
    if (emailOwner) {
        return { statusCode: 409, body: JSON.stringify({ error: 'Another account already uses that email.' }) };
    }

    await sql`update users set full_name = ${fullName}, phone = ${phone}, email = ${email} where id = ${userId}`;
    await sql`update cohort_enrollments set tier = ${tier}, status = ${status} where user_id = ${userId} and cohort_id = ${cohortId}`;

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

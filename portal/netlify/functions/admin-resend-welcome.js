const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { generateTempPassword } = require('./_lib/tempPassword');
const { welcomeEmail } = require('./_lib/emailTemplates');
const { sendMail } = require('./_lib/email');

// Covers both "the first send failed" and "the attendee lost the email" --
// always regenerates the password (plaintext is never retrievable once
// hashed), so re-sending necessarily means re-issuing credentials.
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
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
    if (!userId || !cohortId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'userId and cohortId are required.' }) };
    }

    const sql = getDb();
    const portalUrl = process.env.PORTAL_URL || 'https://portal.clmits.com';

    const [user] = await sql`select id, email, full_name from users where id = ${userId}`;
    if (!user) {
        return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
    }

    const [cohort] = await sql`
        select co.schedule_type, co.start_date, co.duration_weeks, co.meet_link,
               c.title as course_title, c.setup_guide_url
        from cohorts co join courses c on c.id = co.course_id
        where co.id = ${cohortId}
    `;
    if (!cohort) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Cohort not found.' }) };
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await sql`update users set password_hash = ${passwordHash}, must_change_password = true where id = ${userId}`;

    const { subject, html } = welcomeEmail({
        fullName: user.full_name,
        email: user.email,
        tempPassword,
        courseTitle: cohort.course_title,
        cohort: {
            schedule_type: cohort.schedule_type,
            start_date: cohort.start_date,
            durationWeeks: cohort.duration_weeks,
            meetLink: cohort.meet_link,
            setupGuideUrl: cohort.setup_guide_url
        },
        portalUrl
    });

    try {
        await sendMail({ to: user.email, subject, html });
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, emailSent: true }) };
    } catch (err) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: true, emailSent: false, emailError: err.message, tempPassword })
        };
    }
};
